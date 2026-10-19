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

interface PreparacionIntento { clave: string; apartadoId: number }
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
  if (Object.keys(datos).length !== 2 ||
    Object.keys(datos).some((campo) => !['clave', 'apartadoId'].includes(campo)) ||
    typeof datos.clave !== 'string' || !/^[A-Za-z0-9_-]{16,64}$/.test(datos.clave) ||
    !Number.isSafeInteger(datos.apartadoId) || Number(datos.apartadoId) < 1) {
    throw new BadRequestException('Intento inválido.');
  }
  return { clave: datos.clave, apartadoId: datos.apartadoId as number };
}

/** Colaborador interno: vincula un intento al apartado sin registrar cita. */
@Injectable()
export class IntentosReservaPublicaService {
  constructor(@InjectDataSource() private readonly db: DataSource,
    private readonly coordinacion: CoordinacionReservaPublicaService,
    @Inject(RELOJ) private readonly reloj: Reloj) {}

  async preparar(negocioId: number, titularHash: string,
    entrada: unknown): Promise<IntentoPreparado> {
    const { clave, apartadoId } = validarPreparacion(entrada);
    return this.coordinacion.transaccion(clave, async (manager) => {
      const sesion = await this.coordinacion.bloquearSesion(manager, negocioId, titularHash);
      const repo = manager.getRepository(IntentoReservaPublica);
      // La sesión bloqueada serializa búsqueda e inserción de una misma clave.
      const existente = await repo.createQueryBuilder('intento').setLock('pessimistic_write')
        .where(`intento.negocioId=:negocioId AND intento.sesionId=:sesionId
          AND intento.clave=:clave`, { negocioId, sesionId: sesion.id, clave }).getOne();
      if (existente) {
        if (existente.apartadoId !== apartadoId || existente.estado === 'no_registrado') {
          throw new ConflictException('Clave de intento incompatible o cerrada.');
        }
        return { id: existente.id, apartadoId, estado: existente.estado };
      }
      // Solo un apartado propio, actual, público y vigente puede originar un
      // intento nuevo. La preparación nunca cambia su expiraEn ni su puntero.
      const apartado = await manager.getRepository(BloqueoTemporal).findOneBy({
        id: apartadoId, negocioId, sesionId: sesion.id, titularHash,
        generacion: sesion.generacion });
      if (!apartado || sesion.apartadoActualId !== apartadoId ||
        apartado.liberadoEn !== null || this.reloj.ahora() >= apartado.expiraEn ||
        apartado.costoAceptado === null || apartado.zonaHorariaApartado === null) {
        throw new NotFoundException('Apartado no disponible.');
      }
      const intento = await this.coordinacion.bloquearOCrearIntento(manager, sesion,
        clave, apartadoId);
      return { id: intento.id, apartadoId, estado: 'preparado' };
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
      throw new ConflictException('Intento cerrado sin registro.');
    }
    if (intento.formularioHash !== null) {
      const iguales = /^[a-f0-9]{64}$/.test(intento.formularioHash) &&
        /^[a-f0-9]{64}$/.test(huella) && timingSafeEqual(
          Buffer.from(intento.formularioHash, 'hex'), Buffer.from(huella, 'hex'));
      if (!iguales) throw new ConflictException('Clave reutilizada con otro contenido.');
    }
    if (intento.estado === 'preparado') return null;
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
