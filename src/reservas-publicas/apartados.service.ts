import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { RELOJ, type Reloj } from '../comun/reloj';
import { BloqueoTemporal } from '../disponibilidad/entities/bloqueo-temporal.entity';
import { MotorDisponibilidadService } from '../disponibilidad/motor-disponibilidad.service';
import { Servicio } from '../servicios/entities/servicio.entity';
import { Personal } from '../profesionales/entities/personal.entity';
import { Sucursal } from '../sucursales/entities/sucursal.entity';
import { validarSolicitudApartado, type SolicitudApartado } from './apartados-entrada';
import { CoordinacionReservaPublicaService } from './coordinacion-reserva-publica.service';
import { OperacionApartado } from './entities/operacion-apartado.entity';
import { SesionReservaPublica } from './entities/sesion-reserva-publica.entity';
import { IntentoReservaPublica } from './entities/intento-reserva-publica.entity';
import { exigirEscriturasPublicas } from './control-escrituras-publicas';

export interface ResultadoApartado {
  estado: 'concedida' | 'rechazada' | 'sustituida';
  generacion: string;
  apartadoId: number | null;
  expiraEn: Date | null;
  costoAceptado: string | null;
  zonaHoraria: string | null;
}

export interface EstadoApartadoPropio {
  apartadoId: number;
  generacion: string;
  estado: 'vigente' | 'liberado' | 'sustituido' | 'vencido';
  expiraEn: Date;
  servidorAhora: Date;
  costoAceptado: string | null;
}

/** Concede apartados en dos commits y conserva una lectura histórica del estado. */
@Injectable()
export class ApartadosService {
  constructor(@InjectDataSource() private readonly db: DataSource,
    @Inject(RELOJ) private readonly reloj: Reloj,
    private readonly coordinacion: CoordinacionReservaPublicaService,
    private readonly motor: MotorDisponibilidadService) {}

  async solicitar(negocioId: number, titularHash: string, entrada: unknown): Promise<ResultadoApartado> {
    return (await this.solicitarConMeta(negocioId, titularHash, entrada)).resultado;
  }

  /** Indica si la clave ya existía para distinguir creación HTTP de repetición. */
  async solicitarConMeta(negocioId: number, titularHash: string, entrada: unknown):
    Promise<{ resultado: ResultadoApartado; repetida: boolean; servidorAhora: Date }> {
    const seleccion = validarSolicitudApartado(entrada);
    // Comprobar antes de la primera transacción evita liberar un apartado
    // anterior cuando el operador ya cerró nuevas concesiones.
    exigirEscriturasPublicas();
    // La misma clave retoma una preparación tras una caída entre las fases.
    const repetida = await this.coordinacion.transaccion(seleccion.clave, (manager) =>
      this.preparar(manager, negocioId, titularHash, seleccion));
    const resultado = await this.coordinacion.transaccion(seleccion.clave, (manager) =>
      this.conceder(manager, negocioId, titularHash, seleccion));
    return { resultado, repetida, servidorAhora: this.reloj.ahora() };
  }

  /** Lee sesión y apartado en una sola instantánea; la fila histórica no se
   * borra al liberar o vencer y el reloj se captura una sola vez. */
  async consultar(negocioId: number, titularHash: string,
    apartadoId: number): Promise<EstadoApartadoPropio> {
    if (!Number.isSafeInteger(apartadoId) || apartadoId < 1) {
      throw new NotFoundException('Apartado no disponible.');
    }
    return this.db.transaction('REPEATABLE READ', async (manager) => {
      const sesion = await manager.getRepository(SesionReservaPublica)
        .findOneBy({ negocioId, titularHash });
      if (!sesion) throw new NotFoundException('Apartado no disponible.');
      const apartado = await manager.getRepository(BloqueoTemporal).findOneBy({
        id: apartadoId, negocioId, sesionId: sesion.id, titularHash });
      if (!apartado || apartado.generacion === null) {
        throw new NotFoundException('Apartado no disponible.');
      }
      const servidorAhora = this.reloj.ahora();
      // La generación separa un apartado sustituido de uno liberado por su
      // titular; la igualdad exacta con expiraEn ya cuenta como vencimiento.
      const estado = sesion.generacion !== apartado.generacion ? 'sustituido' :
        apartado.liberadoEn !== null ? 'liberado' :
          servidorAhora >= apartado.expiraEn ? 'vencido' : 'vigente';
      // La lectura interna mantiene el costo fijado; solo HTTP decide mostrarlo.
      return { apartadoId, generacion: apartado.generacion, estado,
        expiraEn: apartado.expiraEn, servidorAhora,
        costoAceptado: apartado.costoAceptado };
    });
  }

  async liberar(negocioId: number, titularHash: string, apartadoId: number,
    generacion: string): Promise<void> {
    if (!Number.isSafeInteger(apartadoId) || apartadoId < 1 ||
      !/^(0|[1-9]\d*)$/.test(generacion)) {
      throw new NotFoundException('Apartado no disponible.');
    }
    await this.coordinacion.transaccion(`liberar_${apartadoId}_${generacion}`,
      async (manager) => {
        const sesion = await this.coordinacion.bloquearSesion(manager, negocioId, titularHash);
        const apartado = await manager.getRepository(BloqueoTemporal).findOneBy({
          id: apartadoId, negocioId, sesionId: sesion.id, titularHash });
        if (!apartado || apartado.generacion !== generacion) {
          throw new NotFoundException('Apartado no disponible.');
        }
        // La operación se toma después de sesión y antes de recursos del dominio.
        if (apartado.operacionId) await this.bloquearOperacion(manager, negocioId,
          sesion.id, apartado.operacionId);
        if (sesion.apartadoActualId !== apartadoId ||
          sesion.generacion !== generacion || apartado.liberadoEn !== null) return;
        await this.bloquearApartado(manager, apartado);
        if (await this.tieneCita(manager, negocioId, apartadoId)) return;
        const ahora = this.reloj.ahora();
        await manager.getRepository(BloqueoTemporal).update({ id: apartadoId, negocioId },
          { liberadoEn: ahora });
        await manager.getRepository(SesionReservaPublica).update({ id: sesion.id, negocioId },
          { apartadoActualId: null });
      });
  }

  private async preparar(manager: EntityManager, negocioId: number, titularHash: string,
    seleccion: SolicitudApartado): Promise<boolean> {
    const sesion = await this.coordinacion.bloquearSesion(manager, negocioId, titularHash);
    // Rechazar referencias ajenas antes de insertar una operación evita filtrar
    // nombres de restricciones SQL y conserva el apartado previo intacto.
    await this.exigirRecursosPropios(manager, negocioId, seleccion);
    const existente = await manager.getRepository(OperacionApartado).findOneBy({
      negocioId, sesionId: sesion.id, clave: seleccion.clave });
    const generacion = (BigInt(sesion.generacion) + 1n).toString();
    const operacion = await this.coordinacion.bloquearOCrearOperacion(manager, sesion,
      seleccion.clave, { ...this.camposSeleccion(seleccion), generacion });
    if (operacion.generacion !== generacion) return true;
    const anterior = sesion.apartadoActualId === null ? null :
      await manager.getRepository(BloqueoTemporal).findOneBy({
        id: sesion.apartadoActualId, negocioId, sesionId: sesion.id,
        titularHash, generacion: sesion.generacion });
    if (sesion.apartadoActualId !== null && !anterior) {
      throw new ConflictException('Apartado actual incompatible.');
    }
    if (anterior) {
      await this.bloquearApartado(manager, anterior);
      if (await this.tieneCita(manager, negocioId, anterior.id)) {
        throw new ConflictException('El apartado ya tiene una reserva.');
      }
      if (anterior.liberadoEn === null) {
        await manager.getRepository(BloqueoTemporal).update({ id: anterior.id, negocioId },
          { liberadoEn: this.reloj.ahora() });
      }
    }
    // Commit de esta fase deja durable la liberación aun si la revalidación falla.
    await manager.getRepository(SesionReservaPublica).update({ id: sesion.id, negocioId },
      { generacion, apartadoActualId: null });
    return Boolean(existente);
  }

  private async conceder(manager: EntityManager, negocioId: number, titularHash: string,
    seleccion: SolicitudApartado): Promise<ResultadoApartado> {
    // El cierre entre ambos commits impide la nueva ocupación; la liberación
    // preparada permanece durable conforme al protocolo de dos fases.
    exigirEscriturasPublicas();
    const sesion = await this.coordinacion.bloquearSesion(manager, negocioId, titularHash);
    const operacion = await manager.getRepository(OperacionApartado)
      .createQueryBuilder('o').setLock('pessimistic_write')
      .where('o.negocioId=:negocioId AND o.sesionId=:sesionId AND o.clave=:clave',
        { negocioId, sesionId: sesion.id, clave: seleccion.clave }).getOne();
    if (!operacion) throw new NotFoundException('Operación de apartado no disponible.');
    if (operacion.seleccionHash !== seleccion.seleccionHash) {
      throw new ConflictException('Clave de operación incompatible.');
    }
    if (operacion.estado !== 'preparada') return this.resultado(manager, operacion);
    if (operacion.generacion !== sesion.generacion) {
      operacion.estado = 'sustituida';
      operacion.causaPublica = 'generacion_sustituida';
      await manager.getRepository(OperacionApartado).save(operacion);
      return this.resultado(manager, operacion);
    }
    await this.coordinacion.bloquearRecursos(manager, { negocioId,
      usuarioIds: [seleccion.personalId], sucursalIds: [seleccion.sucursalId],
      servicioIds: [seleccion.servicioId], personalIds: [seleccion.personalId] });
    const evaluacion = await this.motor.revalidarPublicoEnTransaccion(manager,
      negocioId, this.camposSeleccion(seleccion));
    if (!evaluacion.valido) {
      operacion.estado = 'rechazada';
      operacion.causaPublica = 'horario_no_disponible';
      await manager.getRepository(OperacionApartado).save(operacion);
      return this.resultado(manager, operacion);
    }
    const ahora = this.reloj.ahora();
    const servicio = await manager.getRepository(Servicio).findOneByOrFail({
      id: seleccion.servicioId, negocioId });
    const apartado = await manager.getRepository(BloqueoTemporal).save({
      negocioId, personalId: seleccion.personalId, sucursalId: seleccion.sucursalId,
      servicioId: seleccion.servicioId, inicioUtc: evaluacion.inicioUtc,
      finUtc: evaluacion.finUtc, expiraEn: new Date(ahora.getTime() + 300_000),
      liberadoEn: null, titularHash, costoAceptado: servicio.costo,
      zonaHorariaApartado: evaluacion.zonaHoraria, sesionId: sesion.id,
      generacion: sesion.generacion, operacionId: operacion.id,
    });
    operacion.estado = 'concedida';
    operacion.apartadoId = apartado.id;
    await manager.getRepository(OperacionApartado).save(operacion);
    await manager.getRepository(SesionReservaPublica).update({ id: sesion.id, negocioId },
      { apartadoActualId: apartado.id });
    return this.resultado(manager, operacion);
  }

  private async bloquearApartado(manager: EntityManager, apartado: BloqueoTemporal): Promise<void> {
    await this.coordinacion.bloquearRecursos(manager, { negocioId: apartado.negocioId,
      usuarioIds: [apartado.personalId], sucursalIds: [apartado.sucursalId],
      servicioIds: [apartado.servicioId], personalIds: [apartado.personalId],
      apartadoIds: [apartado.id] });
  }

  private async bloquearOperacion(manager: EntityManager, negocioId: number,
    sesionId: number, id: string): Promise<void> {
    const operacion = await manager.getRepository(OperacionApartado)
      .createQueryBuilder('o').setLock('pessimistic_write')
      .where('o.id=:id AND o.negocioId=:negocioId AND o.sesionId=:sesionId',
        { id, negocioId, sesionId }).getOne();
    if (!operacion) throw new NotFoundException('Apartado no disponible.');
  }

  private async tieneCita(manager: EntityManager, negocioId: number,
    apartadoId: number): Promise<boolean> {
    return Boolean(await manager.getRepository(IntentoReservaPublica).findOneBy({
      negocioId, apartadoId, estado: 'registrado' }));
  }

  private camposSeleccion(seleccion: SolicitudApartado) {
    return { personalId: seleccion.personalId, sucursalId: seleccion.sucursalId,
      servicioId: seleccion.servicioId, fechaLocal: seleccion.fechaLocal,
      horaInicio: seleccion.horaInicio, seleccionHash: seleccion.seleccionHash };
  }

  private async exigirRecursosPropios(manager: EntityManager, negocioId: number,
    seleccion: SolicitudApartado): Promise<void> {
    const [perfil, sucursal, servicio] = await Promise.all([
      manager.getRepository(Personal).findOneBy({ id: seleccion.personalId, negocioId }),
      manager.getRepository(Sucursal).findOneBy({ id: seleccion.sucursalId, negocioId }),
      manager.getRepository(Servicio).findOneBy({ id: seleccion.servicioId, negocioId }),
    ]);
    if (!perfil || !sucursal || !servicio) {
      throw new NotFoundException('Selección no disponible.');
    }
  }

  private async resultado(manager: EntityManager,
    operacion: OperacionApartado): Promise<ResultadoApartado> {
    const apartado = operacion.apartadoId === null ? null :
      await manager.getRepository(BloqueoTemporal).findOneBy({
        id: operacion.apartadoId, negocioId: operacion.negocioId,
        operacionId: operacion.id });
    return { estado: operacion.estado as ResultadoApartado['estado'],
      generacion: operacion.generacion, apartadoId: apartado?.id ?? null,
      expiraEn: apartado?.expiraEn ?? null,
      costoAceptado: apartado?.costoAceptado ?? null,
      zonaHoraria: apartado?.zonaHorariaApartado ?? null };
  }
}
