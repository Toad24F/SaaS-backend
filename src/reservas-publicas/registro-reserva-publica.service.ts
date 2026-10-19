import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { randomBytes } from 'node:crypto';
import { DataSource, EntityManager } from 'typeorm';
import { RELOJ, type Reloj } from '../comun/reloj';
import { MotorDisponibilidadService } from '../disponibilidad/motor-disponibilidad.service';
import { BloqueoTemporal } from '../disponibilidad/entities/bloqueo-temporal.entity';
import { Cita } from '../disponibilidad/entities/cita.entity';
import { Cliente } from '../disponibilidad/entities/cliente.entity';
import { Negocio } from '../negocios/entities/negocio.entity';
import { Servicio } from '../servicios/entities/servicio.entity';
import { Sucursal } from '../sucursales/entities/sucursal.entity';
import { Usuario } from '../usuarios/entities/usuario.entity';
import { CoordinacionReservaPublicaService } from './coordinacion-reserva-publica.service';
import { huellaContactoReservaPublica, validarContactoReservaPublica } from './contacto-reserva-publica';
import type { ContactoReservaPublica } from './contacto-reserva-publica';
import type { ResultadoReservaPublica } from './contratos';
import { IntentoReservaPublica } from './entities/intento-reserva-publica.entity';
import { OperacionApartado } from './entities/operacion-apartado.entity';
import { SesionReservaPublica } from './entities/sesion-reserva-publica.entity';
import { IntentosReservaPublicaService } from './intentos-reserva-publica.service';

interface CopiaHistorica {
  negocio: string; servicio: string; sucursal: string; profesional: string;
  costo: string; zona: string;
}

/** Escritor atómico compartido por la frontera HTTP y las pruebas de dominio. */
@Injectable()
export class RegistroReservaPublicaService {
  constructor(@InjectDataSource() private readonly db: DataSource,
    private readonly coordinacion: CoordinacionReservaPublicaService,
    private readonly intentos: IntentosReservaPublicaService,
    private readonly motor: MotorDisponibilidadService,
    @Inject(RELOJ) private readonly reloj: Reloj) {}

  async registrar(negocioId: number, titularHash: string, clave: string,
    entrada: unknown): Promise<ResultadoReservaPublica> {
    return (await this.registrarConMeta(negocioId, titularHash, clave, entrada)).resultado;
  }

  /** Informa creación o repetición desde la misma transacción que guarda la cita. */
  async registrarConMeta(negocioId: number, titularHash: string, clave: string,
    entrada: unknown): Promise<{ resultado: ResultadoReservaPublica; repetida: boolean }> {
    const contacto = validarContactoReservaPublica(entrada);
    const huella = huellaContactoReservaPublica(contacto);
    return this.coordinacion.transaccion(clave, async (manager) => {
      const sesion = await this.coordinacion.bloquearSesion(manager, negocioId, titularHash);
      const intento = await manager.getRepository(IntentoReservaPublica)
        .createQueryBuilder('i').setLock('pessimistic_write')
        .where('i.negocioId=:negocioId AND i.sesionId=:sesionId AND i.clave=:clave',
          { negocioId, sesionId: sesion.id, clave }).getOne();
      if (!intento) throw new NotFoundException('Intento no disponible.');
      // Una respuesta perdida se reproduce antes de comprobar vigencia comercial
      // o del apartado; el resultado durable jamás crea una segunda cita.
      const anterior = await this.intentos.reconocerEnTransaccion(manager, intento, huella);
      if (anterior) return { resultado: anterior, repetida: true };
      const previo = await manager.getRepository(BloqueoTemporal).findOneBy({
        id: intento.apartadoId, negocioId, sesionId: sesion.id, titularHash });
      if (!previo) throw new NotFoundException('Apartado no disponible.');
      await this.coordinacion.bloquearRecursos(manager, { negocioId,
        usuarioIds: [previo.personalId], sucursalIds: [previo.sucursalId],
        servicioIds: [previo.servicioId], personalIds: [previo.personalId],
        apartadoIds: [previo.id] });
      // READ COMMITTED y el bloqueo común obligan a releer después de esperar.
      const apartado = await manager.getRepository(BloqueoTemporal).findOneBy({
        id: previo.id, negocioId, sesionId: sesion.id, titularHash });
      const actual = await manager.getRepository(SesionReservaPublica).findOneBy({
        id: sesion.id, negocioId });
      const ahora = this.reloj.ahora();
      if (!apartado || !actual || actual.apartadoActualId !== apartado.id ||
        actual.generacion !== apartado.generacion || apartado.liberadoEn !== null ||
        ahora >= apartado.expiraEn || apartado.costoAceptado === null ||
        apartado.zonaHorariaApartado === null || apartado.operacionId === null) {
        throw new ConflictException('Apartado vencido o incompatible.');
      }
      const operacion = await manager.getRepository(OperacionApartado).findOneBy({
        id: apartado.operacionId, negocioId, sesionId: sesion.id,
        apartadoId: apartado.id, estado: 'concedida' });
      if (!operacion || operacion.personalId !== apartado.personalId ||
        operacion.sucursalId !== apartado.sucursalId ||
        operacion.servicioId !== apartado.servicioId) {
        throw new ConflictException('Selección incompatible.');
      }
      // MariaDB entrega TIME como HH:mm:ss; la operación original solo
      // admite minutos completos y el motor recibe su contrato HH:mm.
      if (!/^([01]\d|2[0-3]):[0-5]\d:00$/.test(operacion.horaInicio)) {
        throw new Error('Hora persistida incompatible.');
      }
      // El driver puede convertir DATE a Date en la zona del host y desplazar
      // el día. DATE_FORMAT recupera la fecha civil exacta guardada en MariaDB.
      const fechas: { fechaLocal: string }[] = await manager.query(
        `SELECT DATE_FORMAT(fecha_local,'%Y-%m-%d') AS fechaLocal
          FROM operaciones_apartado WHERE id=? AND negocio_id=?`,
        [operacion.id, negocioId]);
      if (fechas.length !== 1) throw new Error('Fecha persistida incompatible.');
      const validacion = await this.motor.revalidarPublicoEnTransaccion(manager,
        negocioId, { personalId: apartado.personalId, sucursalId: apartado.sucursalId,
          servicioId: apartado.servicioId, fechaLocal: fechas[0].fechaLocal,
          horaInicio: operacion.horaInicio.slice(0, 5),
          apartadoPropio: { id: apartado.id, titularHash } });
      if (!validacion.valido || validacion.inicioUtc.getTime() !== apartado.inicioUtc.getTime() ||
        validacion.finUtc.getTime() !== apartado.finUtc.getTime() ||
        validacion.zonaHoraria !== apartado.zonaHorariaApartado) {
        throw new ConflictException('Horario ya no disponible.');
      }
      const copia = await this.copiaHistorica(manager, negocioId, apartado);
      // Si la lectura de nombres tomó tiempo, el límite temporal vuelve a
      // comprobarse justo antes de insertar el primer registro.
      const instanteFinal = this.reloj.ahora();
      if (instanteFinal >= apartado.expiraEn || validacion.inicioUtc <= instanteFinal) {
        throw new ConflictException('Apartado vencido o inicio pasado.');
      }
      const resultado = await this.guardarTodo(manager, sesion, intento, apartado, contacto,
        huella, validacion.inicioUtc, validacion.finUtc, copia, instanteFinal);
      return { resultado, repetida: false };
    });
  }

  /** T075: la copia toma el precio del apartado y los nombres vigentes bajo
   * los bloqueos; nunca recupera precio o contacto de otra cita por teléfono. */
  private async copiaHistorica(manager: EntityManager, negocioId: number,
    apartado: BloqueoTemporal): Promise<CopiaHistorica> {
    const [negocio, servicio, sucursal, profesional] = await Promise.all([
      manager.getRepository(Negocio).findOneBy({ id: negocioId }),
      manager.getRepository(Servicio).findOneBy({ id: apartado.servicioId, negocioId }),
      manager.getRepository(Sucursal).findOneBy({ id: apartado.sucursalId, negocioId }),
      manager.getRepository(Usuario).findOneBy({ id: apartado.personalId, negocioId }),
    ]);
    if (!negocio || !servicio || !sucursal || !profesional?.nombre ||
      !apartado.costoAceptado || !apartado.zonaHorariaApartado) {
      throw new NotFoundException('Selección no disponible.');
    }
    return { negocio: negocio.nombre, servicio: servicio.nombre,
      sucursal: sucursal.nombre, profesional: profesional.nombre,
      costo: apartado.costoAceptado, zona: apartado.zonaHorariaApartado };
  }

  /** T076: cada paso comparte el mismo manager; un error en cualquier fila
   * revierte cliente, cita, consumo y vínculo del intento en conjunto. */
  private async guardarTodo(manager: EntityManager, sesion: SesionReservaPublica,
    intento: IntentoReservaPublica, apartado: BloqueoTemporal,
    contacto: ContactoReservaPublica, huella: string, inicioUtc: Date,
    finUtc: Date, copia: CopiaHistorica, ahora: Date): Promise<ResultadoReservaPublica> {
    const cliente = await manager.getRepository(Cliente).save({
      negocioId: intento.negocioId, nombreCompleto: contacto.nombre,
      telefono: contacto.telefono, email: null });
    // 18 caracteres aleatorios más prefijo caben en VARCHAR(20) y la unicidad
    // global de folio se mantiene en la base de datos.
    const folio = `P-${randomBytes(9).toString('hex').toUpperCase()}`;
    const cita = await manager.getRepository(Cita).save({ negocioId: intento.negocioId,
      sucursalId: apartado.sucursalId, personalId: apartado.personalId,
      servicioId: apartado.servicioId, clienteId: cliente.id, inicioUtc, finUtc,
      zonaHorariaReserva: copia.zona, estado: 'pendiente', origen: 'portal_publico',
      motivoConsulta: contacto.notas, costoAceptado: copia.costo,
      nombreContacto: contacto.nombre, telefonoContacto: contacto.telefono,
      nombreNegocio: copia.negocio, nombreServicio: copia.servicio,
      nombreSucursal: copia.sucursal, nombreProfesional: copia.profesional, folio });
    await manager.getRepository(BloqueoTemporal).update({ id: apartado.id,
      negocioId: intento.negocioId }, { liberadoEn: ahora });
    await manager.getRepository(SesionReservaPublica).update({ id: sesion.id,
      negocioId: intento.negocioId }, { apartadoActualId: null });
    await manager.getRepository(IntentoReservaPublica).update({ id: intento.id,
      negocioId: intento.negocioId }, { estado: 'registrado',
      formularioHash: huella, citaId: cita.id });
    return { folio, estado: 'pendiente', inicioUtc: inicioUtc.toISOString(),
      finUtc: finUtc.toISOString(), zonaHoraria: copia.zona, costoAceptado: copia.costo,
      nombreNegocio: copia.negocio, nombreServicio: copia.servicio,
      nombreSucursal: copia.sucursal, nombreProfesional: copia.profesional };
  }
}
