import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { Permiso } from '../auth/services/autorizacion.service';
import { Usuario } from '../usuarios/entities/usuario.entity';
import { Personal } from '../profesionales/entities/personal.entity';
import { Licencia } from '../licencias/entities/licencia.entity';
import { Sucursal } from '../sucursales/entities/sucursal.entity';
import { Servicio } from '../servicios/entities/servicio.entity';
import { ClientesService } from '../clientes/clientes.service';
import type { DatosCliente } from '../clientes/clientes.entrada';
import { bloquearNegocioAgenda, bloquearRecursosAgenda } from '../comun/bloqueos-coordinados';
import { MotorDisponibilidadService, type ResultadoRevalidacionEscritura } from '../disponibilidad/motor-disponibilidad.service';
import { CupoTelefonicoService, CupoTelefonicoExcedidoException } from '../reservas-publicas/cupo-telefonico.service';
import { AccesoOperativoService, type ContextoOperativo } from './acceso-operativo.service';
import { IntentoCitaManual } from './entities/intento-cita-manual.entity';
import { validarSeleccionManual, validarClaveManual, huellaSeleccionManual, type SeleccionManual } from './seleccion-manual.entrada';

type Identidad = Pick<JwtPayload, 'sub' | 'sesionId'>;
export interface SeleccionManualRevalidada extends ContextoOperativo {
  intento: IntentoCitaManual;
  seleccion: SeleccionManual;
  contacto: DatosCliente;
  validacion: ResultadoRevalidacionEscritura;
  finOcupacionUtc: Date;
}

/** Infraestructura del escritor privado: prepara intentos y conserva la exclusión hasta el commit.
 * El registro colabora dentro del callback; la resolución de ausencia y las rutas se componen aparte.
 */
@Injectable()
export class IntentosCitaManualService {
  constructor(private readonly acceso: AccesoOperativoService, private readonly clientes: ClientesService,
    private readonly motor: MotorDisponibilidadService, private readonly cupo: CupoTelefonicoService) {}

  async preparar(identidad: Identidad, entradaClave: unknown, entrada: unknown) {
    const clave = validarClaveManual(entradaClave);
    const seleccion = validarSeleccionManual(entrada);
    const contenidoHash = huellaSeleccionManual(seleccion);
    return this.acceso.ejecutar(identidad, Permiso.CREAR_CITA_MANUAL, async (inicial) => {
      // El usuario excluye también la primera inserción cuando todavía no existe fila de intento.
      await this.bloquearUsuarios(inicial, [inicial.actorId]);
      const ctx = await this.acceso.resolverEnTransaccion(inicial.manager, identidad, Permiso.CREAR_CITA_MANUAL);
      const existente = await this.leerIntento(ctx, clave);
      if (existente) {
        this.exigirHuella(existente, contenidoHash);
        if (existente.estado === 'no_registrado') throw new ConflictException();
        return this.proyectar(existente);
      }
      // Preparar comprueba pertenencia, no promete disponibilidad ni toma una ocupación.
      await this.exigirPertenencia(ctx, seleccion);
      await this.contacto(ctx, identidad, seleccion);
      const repo = ctx.manager.getRepository(IntentoCitaManual);
      const intento = await repo.save(repo.create({ negocioId: ctx.negocioId, actorUsuarioId: ctx.actorId,
        clave, contenidoHash, estado: 'preparado', citaId: null, resueltoEn: null,
        creadoEn: ctx.ahora, actualizadoEn: ctx.ahora }));
      return this.proyectar(intento);
    });
  }

  /** Colaboración interna del futuro registro: solo el callback puede escribir tras revalidar.
   * Debe guardar todo con este manager antes de devolver; fuera del callback el resultado no reserva.
   * No sustituye la implementación ni las carreras de aceptación del escritor completo.
   */
  async conSeleccionRevalidada<T>(identidad: Identidad, entradaClave: unknown, entrada: unknown,
    guardar: (contexto: SeleccionManualRevalidada) => Promise<T>,
    repetir?: (contexto: ContextoOperativo, intento: IntentoCitaManual) => Promise<T>): Promise<T> {
    const clave = validarClaveManual(entradaClave);
    const seleccion = validarSeleccionManual(entrada);
    const contenidoHash = huellaSeleccionManual(seleccion);
    return this.acceso.ejecutar(identidad, Permiso.CREAR_CITA_MANUAL, async (inicial) => {
      // Todos los usuarios se toman en orden ascendente ANTES del intento y de cualquier perfil.
      await this.bloquearUsuarios(inicial, [inicial.actorId, seleccion.personalId]);
      const antes = await this.acceso.resolverEnTransaccion(inicial.manager, identidad, Permiso.CREAR_CITA_MANUAL);
      const intento = await this.leerIntento(antes, clave);
      if (!intento) throw new NotFoundException();
      this.exigirHuella(intento, contenidoHash);
      // Una respuesta ya registrada se recupera bajo el mismo intento bloqueado, antes de
      // comprobar oferta/cupo/horario actuales. La sesión, el rol y la licencia siguen vigentes.
      if (intento.estado === 'registrado' && repetir) {
        const actual = await this.acceso.resolverEnTransaccion(antes.manager, identidad, Permiso.CREAR_CITA_MANUAL);
        return repetir(actual, intento);
      }
      if (intento.estado !== 'preparado') throw new ConflictException();
      await bloquearNegocioAgenda(antes.manager, antes.negocioId);
      const licencia = await antes.manager.getRepository(Licencia).createQueryBuilder('licencia')
        .setLock('pessimistic_write').where({ negocioId: antes.negocioId }).getOne();
      if (!licencia) throw new NotFoundException();
      await bloquearRecursosAgenda(antes.manager, antes.negocioId, 'sucursal', [seleccion.sucursalId]);
      await bloquearRecursosAgenda(antes.manager, antes.negocioId, 'servicio', [seleccion.servicioId]);
      await bloquearRecursosAgenda(antes.manager, antes.negocioId, 'personal', [seleccion.personalId]);
      // READ COMMITTED relee después de TODAS las esperas. El instante de este acceso se comparte
      // con ficha, motor y cupo para que los límites temporales pertenezcan a la misma decisión.
      const ctx = await this.acceso.resolverEnTransaccion(antes.manager, identidad, Permiso.CREAR_CITA_MANUAL);
      const contacto = await this.contacto(ctx, identidad, seleccion);
      const validacion = await this.motor.revalidarEnTransaccion(ctx.manager, identidad, {
        personalId: seleccion.personalId, sucursalId: seleccion.sucursalId, servicioId: seleccion.servicioId,
        fechaLocal: seleccion.fechaLocal, horaInicio: seleccion.horaInicio, modalidad: 'manual',
      }, ctx.ahora);
      if (!validacion.valido) throw new ConflictException();
      if (await this.cupo.contar(ctx.manager, ctx.negocioId, seleccion.sucursalId, contacto.telefono, ctx.ahora) >= 2) {
        throw new CupoTelefonicoExcedidoException();
      }
      const finOcupacionUtc = new Date(validacion.finUtc.getTime() + validacion.reglasAplicadas.tiempoEntreCitasMinutos * 60000);
      return guardar({ ...ctx, intento, seleccion, contacto, validacion, finOcupacionUtc });
    }, 'READ COMMITTED');
  }

  private async bloquearUsuarios(ctx: ContextoOperativo, ids: number[]) {
    for (const id of [...new Set(ids)].sort((a, b) => a - b)) {
      const usuario = await ctx.manager.getRepository(Usuario).createQueryBuilder('usuario')
        .select('usuario.id').setLock('pessimistic_write').where({ id, negocioId: ctx.negocioId }).getOne();
      if (!usuario) throw new NotFoundException();
    }
  }

  private leerIntento(ctx: ContextoOperativo, clave: string) {
    return ctx.manager.getRepository(IntentoCitaManual).createQueryBuilder('intento')
      .setLock('pessimistic_write').where({ negocioId: ctx.negocioId, actorUsuarioId: ctx.actorId, clave }).getOne();
  }

  private exigirHuella(intento: IntentoCitaManual, contenidoHash: string): void {
    if (intento.contenidoHash !== contenidoHash) throw new ConflictException();
  }

  private async exigirPertenencia(ctx: ContextoOperativo, seleccion: SeleccionManual) {
    for (const [entidad, id] of [[Sucursal, seleccion.sucursalId], [Servicio, seleccion.servicioId], [Personal, seleccion.personalId]] as const) {
      if (!await ctx.manager.getRepository(entidad).findOneBy({ id, negocioId: ctx.negocioId })) throw new NotFoundException();
    }
  }

  private async contacto(ctx: ContextoOperativo, identidad: Identidad, seleccion: SeleccionManual): Promise<DatosCliente> {
    if (seleccion.clienteId === undefined) return seleccion.clienteNuevo;
    // No seleccionar por teléfono ni corregir la ficha desde el formulario de cita.
    const ficha = await this.clientes.resolverExistenteEnTransaccion(ctx.manager, identidad, String(seleccion.clienteId), ctx.ahora);
    return { nombreCompleto: ficha.nombreCompleto, telefono: ficha.telefono };
  }

  private proyectar(intento: IntentoCitaManual) {
    return { id: intento.id, clave: intento.clave, estado: intento.estado, creadoEn: intento.creadoEn };
  }
}
