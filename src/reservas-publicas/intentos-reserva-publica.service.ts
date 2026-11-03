import { BadRequestException, ConflictException, Inject, Injectable,
  NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { timingSafeEqual } from 'node:crypto';
import { DataSource, EntityManager } from 'typeorm';
import { RELOJ, type Reloj } from '../comun/reloj';
import { BloqueoTemporal } from '../disponibilidad/entities/bloqueo-temporal.entity';
import { Cita } from '../disponibilidad/entities/cita.entity';
import { CoordinacionReservaPublicaService } from './coordinacion-reserva-publica.service';
import { IntentoReservaPublica } from './entities/intento-reserva-publica.entity';
import { huellaContactoReservaPublica, validarContactoReservaPublica } from './contacto-reserva-publica';
import type { ResultadoReservaPublica } from './contratos';
import { exigirEscriturasPublicas } from './control-escrituras-publicas';
import { CupoTelefonicoExcedidoException, esCausaCupoTelefonico } from './cupo-telefonico.service';

interface PreparacionIntento {
  clave: string; apartadoId: number; intentoAnteriorId: string | null;
}
export interface IntentoPreparado {
  id: string;
  apartadoId: number;
  estado: 'preparado' | 'registrado';
}

function validarPreparacion(entrada: unknown): PreparacionIntento {
  if (!entrada || typeof entrada !== 'object' || Array.isArray(entrada)) {
    throw new BadRequestException('Intento inválido.');
  }
  const datos = entrada as Record<string, unknown>;
  if (Object.keys(datos).length !== (datos.intentoAnteriorId === undefined ? 2 : 3) ||
    Object.keys(datos).some((campo) =>
      !['clave', 'apartadoId', 'intentoAnteriorId'].includes(campo)) ||
    typeof datos.clave !== 'string' || !/^[A-Za-z0-9_-]{16,64}$/.test(datos.clave) ||
    !Number.isSafeInteger(datos.apartadoId) || Number(datos.apartadoId) < 1 ||
    (datos.intentoAnteriorId !== undefined &&
      (typeof datos.intentoAnteriorId !== 'string' ||
        !/^[1-9]\d{0,19}$/.test(datos.intentoAnteriorId)))) {
    throw new BadRequestException('Intento inválido.');
  }
  return { clave: datos.clave, apartadoId: datos.apartadoId as number,
    intentoAnteriorId: (datos.intentoAnteriorId as string | undefined) ?? null };
}

/** Colaborador interno: vincula un intento al apartado sin registrar cita. */
@Injectable()
export class IntentosReservaPublicaService {
  constructor(@InjectDataSource() private readonly db: DataSource,
    private readonly coordinacion: CoordinacionReservaPublicaService,
    @Inject(RELOJ) private readonly reloj: Reloj) {}

  async preparar(negocioId: number, titularHash: string,
    entrada: unknown): Promise<IntentoPreparado> {
    return (await this.prepararConMeta(negocioId, titularHash, entrada)).resultado;
  }

  /** El estado HTTP se decide dentro de la exclusión, sin preconsultas sujetas a carreras. */
  async prepararConMeta(negocioId: number, titularHash: string,
    entrada: unknown): Promise<{ resultado: IntentoPreparado; repetida: boolean }> {
    const { clave, apartadoId, intentoAnteriorId } = validarPreparacion(entrada);
    return this.coordinacion.transaccion(clave, async (manager) => {
      const sesion = await this.coordinacion.bloquearSesion(manager, negocioId, titularHash);
      const repo = manager.getRepository(IntentoReservaPublica);
      // La sesión bloqueada serializa búsqueda e inserción de una misma clave.
      const existente = await repo.createQueryBuilder('intento').setLock('pessimistic_write')
        .where(`intento.negocioId=:negocioId AND intento.sesionId=:sesionId
          AND intento.clave=:clave`, { negocioId, sesionId: sesion.id, clave }).getOne();
      if (existente) {
        if (existente.apartadoId !== apartadoId || existente.estado === 'no_registrado' ||
          existente.intentoAnteriorId !== intentoAnteriorId) {
          throw new ConflictException('Clave de intento incompatible o cerrada.');
        }
        return { resultado: { id: existente.id, apartadoId, estado: existente.estado }, repetida: true };
      }
      // La recuperación de un intento existente sigue disponible; solo se
      // detiene la creación de intentos nuevos mientras el portal está cerrado.
      exigirEscriturasPublicas();
      // Solo un apartado propio, actual, público y vigente puede originar un
      // intento nuevo. La preparación no cambia su expiraEn.
      const apartado = await manager.getRepository(BloqueoTemporal).findOneBy({
        id: apartadoId, negocioId, sesionId: sesion.id, titularHash,
        generacion: sesion.generacion });
      if (!apartado || sesion.apartadoActualId !== apartadoId ||
        apartado.liberadoEn !== null || this.reloj.ahora() >= apartado.expiraEn ||
        apartado.costoAceptado === null || apartado.zonaHorariaApartado === null) {
        throw new NotFoundException('Apartado no disponible.');
      }
      // El puntero identifica el único escritor autorizado. Solo un rechazo
      // propio, terminal y por cupo admite sucesión explícita.
      if (apartado.intentoActualId === null) {
        if (intentoAnteriorId !== null) {
          throw new ConflictException('No existe intento anterior corregible.');
        }
      } else {
        if (apartado.intentoActualId !== intentoAnteriorId) {
          throw new ConflictException('Intento actual incompatible.');
        }
        const anterior = await repo.findOneBy({ id: intentoAnteriorId!,
          negocioId, sesionId: sesion.id, apartadoId });
        if (!anterior || anterior.estado !== 'no_registrado' ||
          !esCausaCupoTelefonico(anterior.causaPublica)) {
          throw new ConflictException('Intento anterior no corregible.');
        }
      }
      const intento = await this.coordinacion.bloquearOCrearIntento(manager, sesion,
        clave, apartadoId, intentoAnteriorId);
      await manager.getRepository(BloqueoTemporal).update({ id: apartadoId, negocioId },
        { intentoActualId: intento.id });
      return { resultado: { id: intento.id, apartadoId, estado: 'preparado' }, repetida: false };
    });
  }

  /** El futuro escritor llama esto bajo su transacción y antes de revalidar:
   * una repetición registrada se recupera aunque el apartado ya haya vencido. */
  async reconocerResultado(negocioId: number, titularHash: string, clave: string,
    entrada: unknown): Promise<ResultadoReservaPublica | null> {
    if (typeof clave !== 'string' || !/^[A-Za-z0-9_-]{16,64}$/.test(clave)) {
      throw new BadRequestException('Clave de intento inválida.');
    }
    const contacto = validarContactoReservaPublica(entrada);
    const huella = huellaContactoReservaPublica(contacto);
    return this.coordinacion.transaccion(clave, async (manager) => {
      const sesion = await this.coordinacion.bloquearSesion(manager, negocioId, titularHash);
      const intento = await manager.getRepository(IntentoReservaPublica)
        .createQueryBuilder('intento').setLock('pessimistic_write')
        .where(`intento.negocioId=:negocioId AND intento.sesionId=:sesionId
          AND intento.clave=:clave`, { negocioId, sesionId: sesion.id, clave }).getOne();
      if (!intento) throw new NotFoundException('Intento no disponible.');
      return this.reconocerEnTransaccion(manager, intento, huella);
    });
  }

  /** Reutilizable por el escritor que ya mantiene sesión e intento bloqueados. */
  async reconocerEnTransaccion(manager: EntityManager, intento: IntentoReservaPublica,
    huella: string): Promise<ResultadoReservaPublica | null> {
    if (intento.estado === 'no_registrado') {
      // El rechazo específico es terminal incluso con otro formulario; se
      // reproduce sin volver a contar ni reabrir el apartado.
      if (esCausaCupoTelefonico(intento.causaPublica)) {
        throw new CupoTelefonicoExcedidoException();
      }
      throw new ConflictException('Intento cerrado sin registro.');
    }
    if (intento.formularioHash !== null) {
      const iguales = /^[a-f0-9]{64}$/.test(intento.formularioHash) &&
        /^[a-f0-9]{64}$/.test(huella) && timingSafeEqual(
          Buffer.from(intento.formularioHash, 'hex'), Buffer.from(huella, 'hex'));
      if (!iguales) throw new ConflictException('Clave reutilizada con otro contenido.');
    }
    if (intento.estado === 'preparado') return null;
    return this.proyectarRegistradoEnTransaccion(manager, intento);
  }

  /** El resolutor ya comprobó propiedad con sesión e intento bloqueados;
   * puede recuperar un resultado sin pedir de nuevo datos de contacto. */
  async proyectarRegistradoEnTransaccion(manager: EntityManager,
    intento: IntentoReservaPublica): Promise<ResultadoReservaPublica> {
    if (intento.estado !== 'registrado') {
      throw new ConflictException('Intento sin resultado registrado.');
    }
    if (intento.formularioHash === null || intento.citaId === null) {
      throw new Error('Resultado de intento incompleto.');
    }
    const cita = await manager.getRepository(Cita).findOneBy({
      id: intento.citaId, negocioId: intento.negocioId });
    if (!cita || cita.costoAceptado === null || cita.nombreNegocio === null ||
      cita.nombreServicio === null || cita.nombreSucursal === null ||
      cita.nombreProfesional === null || cita.estado !== 'pendiente') {
      throw new Error('Resultado de intento incompleto.');
    }
    // La proyección histórica procede de la cita; no consulta el catálogo vivo.
    return { folio: cita.folio, estado: 'pendiente',
      inicioUtc: cita.inicioUtc.toISOString(), finUtc: cita.finUtc.toISOString(),
      zonaHoraria: cita.zonaHorariaReserva, costoAceptado: cita.costoAceptado,
      nombreNegocio: cita.nombreNegocio, nombreServicio: cita.nombreServicio,
      nombreSucursal: cita.nombreSucursal, nombreProfesional: cita.nombreProfesional };
  }
}
