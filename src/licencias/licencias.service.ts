import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { EnvioCorreo, EstadoEnvioCorreo, TipoEnvioCorreo } from '../correos/entities/envio-correo.entity';
import { BandejaCorreoService } from '../correos/bandeja-correo.service';
import { AutorizacionService, Permiso } from '../auth/services/autorizacion.service';
import { Usuario } from '../usuarios/entities/usuario.entity';
import { Negocio } from '../negocios/entities/negocio.entity';
import { Licencia } from './entities/licencia.entity';
import { AccionOperacionLicencia, OperacionLicencia } from './entities/operacion-licencia.entity';
import { validarClaveOperacionLicencia, validarPlazoSuspension } from './dto/operacion-licencia.dto';
import { CalendarioLicenciasService } from './services/calendario-licencias.service';
import { VistaVigenciaLicencia, VistaVigenciaLicenciaService } from './services/vista-vigencia-licencia.service';

const MAX_INTENTOS_CONFLICTO_VISTA = 3;
const DIA_MS = 24 * 60 * 60 * 1000;

export interface ResultadoOperacionLicencia {
  vista: VistaVigenciaLicencia;
  venceEn: string | null;
  suspensionSolicitadaEn: string | null;
  bloqueoProgramadoEn: string | null;
  suspendidaEn: string | null;
  remanenteMs: string | null;
  versionVencimiento: number;
  versionSuspension: number;
}

/** Serializa suspensión, reactivación y renovación sobre una misma licencia. */
@Injectable()
export class LicenciasService {
  private readonly vistaVigencia = new VistaVigenciaLicenciaService();
  private readonly bandeja = new BandejaCorreoService();
  constructor(
    @InjectRepository(Licencia) private readonly licencias: Repository<Licencia>,
    private readonly autorizacion: AutorizacionService,
    private readonly calendario: CalendarioLicenciasService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async suspender(actorId: number, licenciaId: number, ahora: Date,
    clave?: string, plazoDias?: number): Promise<ResultadoOperacionLicencia> {
    const plazo = validarPlazoSuspension(plazoDias);
    return this.aplicarOperacion(actorId, licenciaId, ahora, AccionOperacionLicencia.SUSPENDER,
      clave, { plazoDias: plazo }, async (manager, actor, licencia) => {
      if (licencia.suspensionSolicitadaEn != null || licencia.congeladaEn != null
        || licencia.suspendidaEn !== null) return false;
      if (licencia.venceEn !== null && ahora >= licencia.venceEn) {
        // Una entrada válida incompatible con el estado actual es un conflicto (409).
        throw new ConflictException('Una licencia vencida debe renovarse antes de suspenderse.');
      }
      licencia.suspensionSolicitadaEn = new Date(ahora);
      licencia.plazoSuspensionDias = plazo;
      licencia.versionSuspension = (licencia.versionSuspension ?? 0) + 1;
      // Las licencias sin habilitar nunca reciben acceso durante el plazo.
      licencia.bloqueoProgramadoEn = licencia.venceEn === null
        ? new Date(ahora) : new Date(ahora.getTime() + plazo * DIA_MS);
      await manager.getRepository(Licencia).save(licencia);
      await this.registrar(manager, actor.id, licencia, 'licencia_suspendida',
        { suspendidaEn: null, venceEn: licencia.venceEn?.toISOString() ?? null },
        { suspensionSolicitadaEn: ahora.toISOString(),
          bloqueoProgramadoEn: licencia.bloqueoProgramadoEn.toISOString(),
          venceEn: licencia.venceEn?.toISOString() ?? null });
      return true;
    });
  }

  /** Congela a la hora prevista original, aunque el procesador llegue tarde. */
  async materializarSuspension(actorId: number, licenciaId: number, ahora: Date): Promise<void> {
    await this.operar(actorId, licenciaId, async (manager, actor, licencia, negocio) => {
      await this.congelarSiCorresponde(manager, actor, licencia, ahora, negocio);
    });
  }

  async reactivar(actorId: number, licenciaId: number, ahora: Date,
    clave?: string): Promise<ResultadoOperacionLicencia> {
    return this.aplicarOperacion(actorId, licenciaId, ahora, AccionOperacionLicencia.REACTIVAR,
      clave, {}, async (manager, actor, licencia, negocio) => {
      if (licencia.suspensionSolicitadaEn == null && licencia.congeladaEn == null
        && licencia.suspendidaEn === null) return false;
      // Si el proceso programado se retrasó, aplica primero la congelación original en esta transacción.
      await this.congelarSiCorresponde(manager, actor, licencia, ahora, negocio);
      const antes = { suspensionSolicitadaEn: licencia.suspensionSolicitadaEn?.toISOString() ?? null,
        congeladaEn: licencia.congeladaEn?.toISOString() ?? null,
        venceEn: licencia.venceEn?.toISOString() ?? null };
      const venceAnterior = licencia.venceEn;
      const congelada = licencia.congeladaEn ?? licencia.suspendidaEn;
      if (congelada !== null && venceAnterior !== null) {
        // Se restaura el remanente medido al límite programado, no a la ejecución tardía.
        const restante = licencia.remanenteMs == null
          ? Math.max(0, venceAnterior.getTime() - congelada.getTime())
          : Number(licencia.remanenteMs);
        licencia.venceEn = new Date(ahora.getTime() + restante);
        licencia.versionVencimiento = (licencia.versionVencimiento ?? 0) + 1;
      }
      // Revocar un bloqueo pendiente conserva la versión del vencimiento natural.
      licencia.suspendidaEn = null;
      licencia.suspensionSolicitadaEn = null;
      licencia.bloqueoProgramadoEn = null;
      licencia.congeladaEn = null;
      licencia.remanenteMs = null;
      await manager.getRepository(Licencia).save(licencia);
      await this.invalidarAvisos(manager, licencia, false);
      await this.registrar(manager, actor.id, licencia, 'licencia_reactivada',
        antes,
        { suspensionSolicitadaEn: null, congeladaEn: null,
          suspendidaEn: null, venceEn: licencia.venceEn?.toISOString() ?? null });
      return true;
    });
  }

  async renovar(actorId: number, licenciaId: number, ahora: Date,
    clave?: string): Promise<ResultadoOperacionLicencia> {
    return this.aplicarOperacion(actorId, licenciaId, ahora, AccionOperacionLicencia.RENOVAR,
      clave, {}, async (manager, actor, licencia, negocio) => {
      // Una renovación posterior al límite debe actualizar el remanente ya congelado.
      await this.congelarSiCorresponde(manager, actor, licencia, ahora, negocio);
      if (licencia.habilitadaEn === null || licencia.venceEn === null) {
        throw new ConflictException('La licencia pendiente no puede renovarse.');
      }
      const anterior = licencia.venceEn;
      const base = licencia.congeladaEn != null || licencia.suspendidaEn !== null || ahora < anterior
        ? anterior : ahora;
      const vencimientoNuevo = this.calendario.sumarAnios(base);
      const remanenteAntes = licencia.remanenteMs;
      licencia.venceEn = vencimientoNuevo;
      if (licencia.congeladaEn != null || licencia.suspendidaEn != null) {
        // La fecha retenida sirve de base anual; el delta de calendario se agrega al tiempo congelado.
        const congelada = licencia.congeladaEn ?? licencia.suspendidaEn!;
        // Recalcular desde la fecha congelada también cubre un vencimiento durante las 48 h previas.
        licencia.remanenteMs = String(Math.max(0, vencimientoNuevo.getTime() - congelada.getTime()));
      }
      licencia.versionVencimiento = (licencia.versionVencimiento ?? 0) + 1;
      await manager.getRepository(Licencia).save(licencia);
      await this.invalidarAvisos(manager, licencia, false);
      await this.registrar(manager, actor.id, licencia, 'licencia_renovada',
        { venceEn: anterior.toISOString(), suspendidaEn: licencia.suspendidaEn?.toISOString() ?? null,
          remanenteMs: remanenteAntes },
        { venceEn: licencia.venceEn.toISOString(), suspendidaEn: licencia.suspendidaEn?.toISOString() ?? null,
          remanenteMs: licencia.remanenteMs });
      return true;
    });
  }

  /** Reconoce la clave bajo los bloqueos de negocio y licencia antes de mutar. */
  private async aplicarOperacion(actorId: number, licenciaId: number, ahora: Date,
    accion: AccionOperacionLicencia, clave: string | undefined,
    parametros: Record<string, unknown>, transicion: (manager: Repository<Licencia>['manager'],
      actor: Usuario, licencia: Licencia, negocio: Negocio) => Promise<boolean>): Promise<ResultadoOperacionLicencia> {
    const claveValida = clave === undefined ? null : validarClaveOperacionLicencia(clave);
    const huella = createHash('sha256').update(JSON.stringify(parametros)).digest('hex');
    return this.operar(actorId, licenciaId, async (manager, actor, licencia, negocio) => {
      const operaciones = manager.getRepository(OperacionLicencia);
      if (claveValida !== null) {
        const previa = await operaciones.findOneBy({ negocioId: licencia.negocioId,
          licenciaId: licencia.id, clave: claveValida });
        if (previa) {
          if (previa.accion !== accion || previa.parametrosHash !== huella) {
            throw new ConflictException('La clave ya corresponde a otra operación.');
          }
          return JSON.parse(previa.resultadoReducido) as ResultadoOperacionLicencia;
        }
      }
      const revocacion = accion === AccionOperacionLicencia.REACTIVAR &&
        licencia.congeladaEn === null && licencia.suspendidaEn === null &&
        licencia.bloqueoProgramadoEn !== null && ahora < licencia.bloqueoProgramadoEn;
      const cambio = await transicion(manager, actor, licencia, negocio);
      if (!cambio && claveValida !== null) {
        throw new ConflictException('La licencia ya tiene una transición incompatible.');
      }
      const resultado = this.resumirOperacion(licencia, ahora);
      let operacionId: string | undefined;
      if (cambio && claveValida !== null) {
        // Resultado, auditoría y licencia se confirman en el mismo commit.
        const guardada = await operaciones.save(operaciones.create({ negocioId: licencia.negocioId,
          licenciaId: licencia.id, actorId: actor.id, clave: claveValida,
          accion, parametrosHash: huella, resultadoReducido: JSON.stringify(resultado) }));
        operacionId = guardada.id;
      }
      if (cambio) {
        if (accion === AccionOperacionLicencia.SUSPENDER) {
          // El plazo cero solo genera el aviso inmediato de este ciclo.
          await this.encolarEvento(manager, negocio, licencia, ahora,
            licencia.plazoSuspensionDias === 0 ? TipoEnvioCorreo.SUSPENSION_INMEDIATA
              : TipoEnvioCorreo.SUSPENSION_PROGRAMADA,
            { versionSuspension: licencia.versionSuspension });
        } else if (accion === AccionOperacionLicencia.REACTIVAR) {
          await this.descartarSuspensionPendiente(manager, licencia);
          if (operacionId) await this.encolarEvento(manager, negocio, licencia, ahora,
            revocacion ? TipoEnvioCorreo.SUSPENSION_REVOCADA : TipoEnvioCorreo.LICENCIA_REACTIVADA,
            { operacionLicenciaId: operacionId });
        } else if (operacionId) {
          await this.encolarEvento(manager, negocio, licencia, ahora,
            TipoEnvioCorreo.LICENCIA_RENOVADA, { operacionLicenciaId: operacionId });
        }
      }
      return resultado;
    });
  }

  private resumirOperacion(licencia: Licencia, ahora: Date): ResultadoOperacionLicencia {
    // La vista se conserva para que la misma clave reproduzca el mismo HTTP, aun con otro reloj.
    // Solo fechas y versiones: no se persisten datos del actor ni secretos de correo.
    return { vista: this.vistaVigencia.crear(licencia, ahora),
      venceEn: licencia.venceEn?.toISOString() ?? null,
      suspensionSolicitadaEn: licencia.suspensionSolicitadaEn?.toISOString() ?? null,
      bloqueoProgramadoEn: licencia.bloqueoProgramadoEn?.toISOString() ?? null,
      suspendidaEn: licencia.suspendidaEn?.toISOString() ?? null,
      remanenteMs: licencia.remanenteMs, versionVencimiento: licencia.versionVencimiento,
      versionSuspension: licencia.versionSuspension };
  }

  private async operar<T>(
    actorId: number,
    licenciaId: number,
    operacion: (manager: Repository<Licencia>['manager'], actor: Usuario,
      licencia: Licencia, negocio: Negocio) => Promise<T>,
  ): Promise<T> {
    for (let intento = 1; intento <= MAX_INTENTOS_CONFLICTO_VISTA; intento++) {
      try {
        // Cada intento abre una transacción nueva: nunca reutiliza una vista ni
        // una entidad de licencia obtenida antes del rollback de MariaDB.
        // READ COMMITTED evita reutilizar una vista anterior al bloqueo de otra transición.
        return await this.licencias.manager.transaction('READ COMMITTED', async (manager) => {
          const actor = await manager.getRepository(Usuario).createQueryBuilder('actor')
            .setLock('pessimistic_read').where('actor.id = :id', { id: actorId }).getOne();
          if (!actor) throw new ForbiddenException('Acceso denegado.');
          this.autorizacion.exigir(actor.rol, Permiso.GESTIONAR_LICENCIA);
          // La prelectura descubre el negocio sin bloquear la licencia. Su fila
          // se relee bajo FOR UPDATE tras la barrera, dentro de READ COMMITTED.
          const referencia = await manager.getRepository(Licencia)
            .findOneBy({ id: licenciaId });
          if (!referencia) throw new NotFoundException('Licencia no disponible.');
          const negocio = await manager.getRepository(Negocio).createQueryBuilder('negocio')
            .setLock('pessimistic_write')
            .where('negocio.id = :id', { id: referencia.negocioId }).getOne();
          if (!negocio) throw new NotFoundException('Licencia no disponible.');
          const licencia = await manager.getRepository(Licencia).createQueryBuilder('licencia')
            .setLock('pessimistic_write').where('licencia.id = :id', { id: licenciaId }).getOne();
          // La ausencia del recurso es 404; nunca se filtra un error interno de TypeORM.
          if (!licencia || licencia.negocioId !== negocio.id) {
            throw new NotFoundException('Licencia no disponible.');
          }
          return operacion(manager, actor, licencia, negocio);
        });
      } catch (error) {
        // ER_CHECKREAD revierte el intento completo; se reevalúa el estado actual.
        // Cualquier otro error y el último conflicto se entregan al llamador.
        if (!this.esConflictoDeVista(error) || intento === MAX_INTENTOS_CONFLICTO_VISTA) {
          throw error;
        }
      }
    }
    throw new Error('No se pudo completar la operación de licencia.');
  }

  private esConflictoDeVista(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;
    const datos = error as { code?: string; errno?: number;
      driverError?: { code?: string; errno?: number } };
    return datos.driverError?.code === 'ER_CHECKREAD' || datos.code === 'ER_CHECKREAD'
      || datos.driverError?.errno === 1020 || datos.errno === 1020;
  }

  private async registrar(
    manager: Repository<Licencia>['manager'], actorId: number, licencia: Licencia,
    accion: string, antes: Record<string, unknown>, despues: Record<string, unknown>,
  ): Promise<void> {
    await this.auditoria.registrar(manager, {
      operacionId: randomUUID(), actorUsuarioId: actorId, negocioId: licencia.negocioId,
      usuarioId: null, licenciaId: licencia.id, accion,
      valoresAntes: antes, valoresDespues: despues,
    });
  }

  /** Materializa el bloqueo una sola vez, conservando el saldo al instante previsto. */
  private async congelarSiCorresponde(
    manager: Repository<Licencia>['manager'], actor: Usuario, licencia: Licencia,
    ahora: Date, negocio: Negocio,
  ): Promise<void> {
    const efectiva = licencia.bloqueoProgramadoEn;
    if (!efectiva || efectiva > ahora || licencia.congeladaEn != null) return;
    const anterior = licencia.venceEn;
    licencia.congeladaEn = new Date(efectiva);
    licencia.suspendidaEn = new Date(efectiva);
    licencia.remanenteMs = anterior === null
      ? null : String(Math.max(0, anterior.getTime() - efectiva.getTime()));
    // Si venció antes o exactamente al bloquear, el aviso natural tiene prioridad.
    const vencioPrimero = anterior !== null && anterior <= efectiva;
    if (!vencioPrimero) licencia.versionVencimiento = (licencia.versionVencimiento ?? 0) + 1;
    await manager.getRepository(Licencia).save(licencia);
    await this.invalidarAvisos(manager, licencia, true);
    await this.registrar(manager, actor.id, licencia, 'licencia_congelada',
      { venceEn: anterior?.toISOString() ?? null, congeladaEn: null },
      { venceEn: anterior?.toISOString() ?? null, congeladaEn: efectiva.toISOString(),
        remanenteMs: licencia.remanenteMs });
    if (vencioPrimero) {
      await this.descartarSuspensionPendiente(manager, licencia);
      await this.encolarEvento(manager, negocio, licencia, ahora,
        TipoEnvioCorreo.LICENCIA_VENCIDA,
        { versionVencimiento: licencia.versionVencimiento });
    } else if (licencia.plazoSuspensionDias !== 0) {
      await this.encolarEvento(manager, negocio, licencia, ahora,
        TipoEnvioCorreo.SUSPENSION_EFECTIVA,
        { versionSuspension: licencia.versionSuspension });
    }
  }

  /** Reutiliza el destinatario de la fila de negocio bloqueada por la operación. */
  private async encolarEvento(manager: Repository<Licencia>['manager'], negocio: Negocio,
    licencia: Licencia, ahora: Date, tipo: TipoEnvioCorreo,
    referencia: { versionVencimiento?: number; versionSuspension?: number;
      operacionLicenciaId?: string }): Promise<void> {
    if (!negocio.correoAdministrador || negocio.activadoEn === null) return;
    await this.bandeja.encolarEventoLicencia(manager, { negocioId: negocio.id,
      licenciaId: licencia.id, correoDestinatario: negocio.correoAdministrador,
      tipo, ahora, ...referencia });
  }

  private async descartarSuspensionPendiente(manager: Repository<Licencia>['manager'],
    licencia: Licencia): Promise<void> {
    // La revocación no puede deshacer correo entregado; retira solo trabajo recuperable.
    await manager.getRepository(EnvioCorreo).createQueryBuilder().update()
      .set({ estado: EstadoEnvioCorreo.DESCARTADO, arrendamientoId: null,
        arrendadoHasta: null, ultimoError: 'Suspensión sustituida.' })
      .where('licencia_id = :id AND tipo IN (:...tipos) AND estado IN (:...estados)', {
        id: licencia.id, tipos: [TipoEnvioCorreo.SUSPENSION_PROGRAMADA,
          TipoEnvioCorreo.SUSPENSION_EFECTIVA, TipoEnvioCorreo.SUSPENSION_INMEDIATA],
        estados: [EstadoEnvioCorreo.PENDIENTE, EstadoEnvioCorreo.FALLIDO,
          EstadoEnvioCorreo.TOMADO],
      }).execute();
  }

  private async invalidarAvisos(manager: Repository<Licencia>['manager'],
    licencia: Licencia, todos: boolean): Promise<void> {
    // Conserva confirmados e historial; retira solamente trabajos aún recuperables.
    const consulta = manager.getRepository(EnvioCorreo).createQueryBuilder().update()
      .set({ estado: EstadoEnvioCorreo.DESCARTADO, arrendamientoId: null,
        arrendadoHasta: null, ultimoError: 'Vencimiento sustituido o suspendido.' })
      .where('licencia_id = :id AND tipo IN (:...tipos) AND estado IN (:...estados)', {
        id: licencia.id, tipos: [TipoEnvioCorreo.AVISO_VENCIMIENTO,
          TipoEnvioCorreo.AVISO_PREVENTIVO,
          ...(todos ? [] : [TipoEnvioCorreo.LICENCIA_VENCIDA])],
        estados: [EstadoEnvioCorreo.PENDIENTE, EstadoEnvioCorreo.FALLIDO,
          EstadoEnvioCorreo.TOMADO],
      });
    if (!todos) consulta.andWhere('version_vencimiento <> :version',
      { version: licencia.versionVencimiento });
    await consulta.execute();
  }
}
