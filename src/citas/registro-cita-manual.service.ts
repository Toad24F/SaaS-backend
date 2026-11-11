import { ConflictException, Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { ClientesService } from '../clientes/clientes.service';
import { Cita, type EstadoCita } from '../disponibilidad/entities/cita.entity';
import { Negocio } from '../negocios/entities/negocio.entity';
import { Servicio } from '../servicios/entities/servicio.entity';
import { Sucursal } from '../sucursales/entities/sucursal.entity';
import { Usuario } from '../usuarios/entities/usuario.entity';
import type { ContextoOperativo } from './acceso-operativo.service';
import { EventoCita } from './entities/evento-cita.entity';
import { IntentoCitaManual } from './entities/intento-cita-manual.entity';
import { IntentosCitaManualService, type SeleccionManualRevalidada } from './intentos-cita-manual.service';

type Identidad = Pick<JwtPayload, 'sub' | 'sesionId'>;
export interface ResultadoCitaManual {
  id: number; clienteId: number; folio: string; estado: EstadoCita; origen: 'manual'; version: number;
  sucursalId: number; personalId: number; servicioId: number;
  inicioUtc: string; finUtc: string; finOcupacionUtc: string; separacionMinutos: number; zonaHoraria: string;
  costoAceptado: string; nombreContacto: string; telefonoContacto: string; motivoConsulta: string | null;
  nombreNegocio: string; nombreSucursal: string; nombreServicio: string; nombreProfesional: string;
}
interface RegistroConMeta { resultado: ResultadoCitaManual; repetida: boolean }

/** Escritor privado real: confirma cliente, cita, evento e intento juntos, sin efectos externos. */
@Injectable()
export class RegistroCitaManualService {
  constructor(private readonly intentos: IntentosCitaManualService, private readonly clientes: ClientesService) {}

  async registrar(identidad: Identidad, clave: unknown, entrada: unknown): Promise<ResultadoCitaManual> {
    return (await this.registrarConMeta(identidad, clave, entrada)).resultado;
  }

  /** Recupera únicamente la cita persistida; el colaborador conserva la exclusión hasta el commit.
   * Si no logra adquirir los bloqueos o leer un resultado coherente, propaga 503/500, nunca ausencia.
   */
  resolver(identidad: Identidad, clave: unknown, entrada: unknown) {
    return this.intentos.resolver(identidad, clave, entrada, (ctx, intento) => this.recuperar(ctx, intento));
  }

  /** Creación o repetición se decide dentro de la misma exclusión que confirma el resultado. */
  async registrarConMeta(identidad: Identidad, clave: unknown, entrada: unknown): Promise<RegistroConMeta> {
    return this.intentos.conSeleccionRevalidada<RegistroConMeta>(identidad, clave, entrada,
      async (ctx) => ({ resultado: await this.guardar(ctx, identidad), repetida: false }),
      async (ctx, intento) => ({ resultado: await this.recuperar(ctx, intento), repetida: true }));
  }

  private async guardar(ctx: SeleccionManualRevalidada, identidad: Identidad): Promise<ResultadoCitaManual> {
    const { manager, seleccion, contacto, validacion } = ctx;
    // Los recursos y el Profesional permanecen bloqueados: solo se copian valores del servidor
    // leídos después de esperar. La duración y separación son las de la revalidación del motor.
    const copia = await this.copiaHistorica(ctx);
    const clienteId = seleccion.clienteId !== undefined ? seleccion.clienteId
      : (await this.clientes.crearParaCitaEnTransaccion(manager, identidad, contacto, ctx.ahora)).id;
    // La ficha existente y su contacto ya se releían por ID/negocio dentro de esta transacción.
    // Para una persona nueva la inserción y su auditoría comparten ahora el commit de la cita.
    const repositorio = manager.getRepository(Cita);
    const cita = await repositorio.save(repositorio.create({ negocioId: ctx.negocioId, clienteId,
      sucursalId: seleccion.sucursalId, personalId: seleccion.personalId, servicioId: seleccion.servicioId,
      // Dieciocho dígitos hexadecimales más prefijo caben en VARCHAR(20).
      // La restricción global del esquema impide cualquier folio duplicado, también ante concurrencia.
      folio: `M-${randomBytes(9).toString('hex').toUpperCase()}`, estado: 'confirmada', origen: 'manual', version: 1,
      apartadoOrigenId: null, inicioUtc: validacion.inicioUtc, finUtc: validacion.finUtc,
      zonaHorariaReserva: validacion.zonaHoraria, separacionMinutos: validacion.reglasAplicadas.tiempoEntreCitasMinutos,
      finOcupacionUtc: ctx.finOcupacionUtc, nombreContacto: contacto.nombreCompleto, telefonoContacto: contacto.telefono,
      motivoConsulta: seleccion.notas, ...copia, creadoEn: ctx.ahora }));
    // Evento de alta inmutable con actor real. No duplicar contacto, notas ni claves en el historial.
    await manager.getRepository(EventoCita).insert({ negocioId: ctx.negocioId, citaId: cita.id,
      actorUsuarioId: ctx.actorId, sesionPublicaId: null, accion: 'alta', versionResultante: 1,
      ocurridoEn: ctx.ahora, valoresAntes: null, motivo: null, valoresDespues: {
        estado: cita.estado, origen: cita.origen, folio: cita.folio, clienteId,
        sucursalId: cita.sucursalId, personalId: cita.personalId, servicioId: cita.servicioId,
        inicioUtc: cita.inicioUtc.toISOString(), finUtc: cita.finUtc.toISOString(),
        finOcupacionUtc: ctx.finOcupacionUtc.toISOString(), separacionMinutos: cita.separacionMinutos,
        zonaHoraria: cita.zonaHorariaReserva, costoAceptado: copia.costoAceptado,
      } });
    // El resultado durable se confirma al final con su huella intacta. Un fallo en cualquiera
    // de estas escrituras revierte también el cliente nuevo, su auditoría, la cita y su evento.
    const cambio = await manager.getRepository(IntentoCitaManual).update({ id: ctx.intento.id,
      negocioId: ctx.negocioId, actorUsuarioId: ctx.actorId, contenidoHash: ctx.intento.contenidoHash, estado: 'preparado' },
    { estado: 'registrado', citaId: cita.id, resueltoEn: ctx.ahora, actualizadoEn: ctx.ahora });
    if (cambio.affected !== 1) throw new ConflictException();
    return this.proyectar(cita);
  }

  private async copiaHistorica(ctx: SeleccionManualRevalidada) {
    const { manager, negocioId, seleccion } = ctx;
    const [negocio, servicio, sucursal, profesional] = await Promise.all([
      manager.getRepository(Negocio).findOne({ where: { id: negocioId }, select: { id: true, nombre: true } }),
      manager.getRepository(Servicio).findOne({ where: { id: seleccion.servicioId, negocioId }, select: { id: true, nombre: true, costo: true } }),
      manager.getRepository(Sucursal).findOne({ where: { id: seleccion.sucursalId, negocioId }, select: { id: true, nombre: true } }),
      manager.getRepository(Usuario).findOne({ where: { id: seleccion.personalId, negocioId }, select: { id: true, nombre: true } }),
    ]);
    // DECIMAL permanece texto: incluye cero y centavos exactos, sin conversión binaria de importes.
    if (!negocio?.nombre || !servicio?.nombre || !sucursal?.nombre || !profesional?.nombre ||
      typeof servicio.costo !== 'string' || !/^\d{1,8}\.\d{2}$/.test(servicio.costo)) {
      throw new Error('Resumen histórico manual incompleto.');
    }
    return { nombreNegocio: negocio.nombre, nombreServicio: servicio.nombre,
      nombreSucursal: sucursal.nombre, nombreProfesional: profesional.nombre, costoAceptado: servicio.costo };
  }

  private async recuperar(ctx: ContextoOperativo, intento: IntentoCitaManual): Promise<ResultadoCitaManual> {
    const cita = intento.citaId === null ? null : await ctx.manager.getRepository(Cita)
      .findOneBy({ id: intento.citaId, negocioId: ctx.negocioId });
    // Un vínculo durable incoherente es un fallo técnico; nunca ausencia interpretada como fracaso.
    if (!cita) throw new Error('Resultado manual persistido no disponible.');
    return this.proyectar(cita);
  }

  /** Proyección explícita de la cita guardada: repetir no consulta catálogos ni corrige snapshots. */
  private proyectar(cita: Cita): ResultadoCitaManual {
    if (cita.origen !== 'manual' || cita.finOcupacionUtc === null || cita.costoAceptado === null ||
      [cita.nombreContacto, cita.telefonoContacto, cita.nombreNegocio, cita.nombreSucursal, cita.nombreServicio, cita.nombreProfesional].some((v) => v === null)) {
      throw new Error('Resultado manual persistido incompleto.');
    }
    return { id: cita.id, clienteId: cita.clienteId, folio: cita.folio, estado: cita.estado, origen: 'manual', version: cita.version,
      sucursalId: cita.sucursalId, personalId: cita.personalId, servicioId: cita.servicioId,
      inicioUtc: cita.inicioUtc.toISOString(), finUtc: cita.finUtc.toISOString(), finOcupacionUtc: cita.finOcupacionUtc.toISOString(),
      separacionMinutos: cita.separacionMinutos, zonaHoraria: cita.zonaHorariaReserva, costoAceptado: cita.costoAceptado,
      nombreContacto: cita.nombreContacto!, telefonoContacto: cita.telefonoContacto!, motivoConsulta: cita.motivoConsulta,
      nombreNegocio: cita.nombreNegocio!, nombreSucursal: cita.nombreSucursal!, nombreServicio: cita.nombreServicio!, nombreProfesional: cita.nombreProfesional! };
  }
}
