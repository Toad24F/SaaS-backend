import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { EnvioCorreo, EstadoEnvioCorreo, TipoEnvioCorreo } from '../correos/entities/envio-correo.entity';
import { AutorizacionService, Permiso } from '../auth/services/autorizacion.service';
import { Usuario } from '../usuarios/entities/usuario.entity';
import { Licencia } from './entities/licencia.entity';
import { CalendarioLicenciasService } from './services/calendario-licencias.service';

const MAX_INTENTOS_CONFLICTO_VISTA = 3;
const GRACIA_SUSPENSION_MS = 48 * 60 * 60 * 1000;

/** Serializa suspensión, reactivación y renovación sobre una misma licencia. */
@Injectable()
export class LicenciasService {
  constructor(
    @InjectRepository(Licencia) private readonly licencias: Repository<Licencia>,
    private readonly autorizacion: AutorizacionService,
    private readonly calendario: CalendarioLicenciasService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async suspender(actorId: number, licenciaId: number, ahora: Date): Promise<void> {
    await this.operar(actorId, licenciaId, async (manager, actor, licencia) => {
      if (licencia.suspensionSolicitadaEn != null || licencia.congeladaEn != null
        || licencia.suspendidaEn !== null) return;
      if (licencia.venceEn !== null && ahora >= licencia.venceEn) {
        // Una entrada válida incompatible con el estado actual es un conflicto (409).
        throw new ConflictException('Una licencia vencida debe renovarse antes de suspenderse.');
      }
      licencia.suspensionSolicitadaEn = new Date(ahora);
      // Las licencias iniciales se bloquean de inmediato; una habilitada recibe 48 horas.
      licencia.bloqueoProgramadoEn = licencia.venceEn === null
        ? new Date(ahora) : new Date(ahora.getTime() + GRACIA_SUSPENSION_MS);
      await manager.getRepository(Licencia).save(licencia);
      await this.registrar(manager, actor.id, licencia, 'licencia_suspendida',
        { suspendidaEn: null, venceEn: licencia.venceEn?.toISOString() ?? null },
        { suspensionSolicitadaEn: ahora.toISOString(),
          bloqueoProgramadoEn: licencia.bloqueoProgramadoEn.toISOString(),
          venceEn: licencia.venceEn?.toISOString() ?? null });
    });
  }

  /** Congela a la hora prevista original, aunque el procesador llegue tarde. */
  async materializarSuspension(actorId: number, licenciaId: number, ahora: Date): Promise<void> {
    await this.operar(actorId, licenciaId, async (manager, actor, licencia) => {
      await this.congelarSiCorresponde(manager, actor, licencia, ahora);
    });
  }

  async reactivar(actorId: number, licenciaId: number, ahora: Date): Promise<void> {
    await this.operar(actorId, licenciaId, async (manager, actor, licencia) => {
      if (licencia.suspensionSolicitadaEn == null && licencia.congeladaEn == null
        && licencia.suspendidaEn === null) return;
      // Si el proceso programado se retrasó, aplica primero la congelación original en esta transacción.
      await this.congelarSiCorresponde(manager, actor, licencia, ahora);
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
      } else {
        // Cancelar la gracia también sustituye la elegibilidad de avisos pendientes.
        licencia.versionVencimiento = (licencia.versionVencimiento ?? 0) + 1;
      }
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
    });
  }

  async renovar(actorId: number, licenciaId: number, ahora: Date): Promise<void> {
    await this.operar(actorId, licenciaId, async (manager, actor, licencia) => {
      // Una renovación posterior al límite debe actualizar el remanente ya congelado.
      await this.congelarSiCorresponde(manager, actor, licencia, ahora);
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
    });
  }

  private async operar(
    actorId: number,
    licenciaId: number,
    operacion: (manager: Repository<Licencia>['manager'], actor: Usuario, licencia: Licencia) => Promise<void>,
  ): Promise<void> {
    for (let intento = 1; intento <= MAX_INTENTOS_CONFLICTO_VISTA; intento++) {
      try {
        // Cada intento abre una transacción nueva: nunca reutiliza una vista ni
        // una entidad de licencia obtenida antes del rollback de MariaDB.
        await this.licencias.manager.transaction(async (manager) => {
          const actor = await manager.getRepository(Usuario).findOneBy({ id: actorId });
          if (!actor) throw new ForbiddenException('Acceso denegado.');
          this.autorizacion.exigir(actor.rol, Permiso.GESTIONAR_LICENCIA);
          const licencia = await manager.getRepository(Licencia).createQueryBuilder('licencia')
            .setLock('pessimistic_write').where('licencia.id = :id', { id: licenciaId }).getOne();
          // La ausencia del recurso es 404; nunca se filtra un error interno de TypeORM.
          if (!licencia) throw new NotFoundException('Licencia no disponible.');
          await operacion(manager, actor, licencia);
        });
        return;
      } catch (error) {
        // ER_CHECKREAD revierte el intento completo; se reevalúa el estado actual.
        // Cualquier otro error y el último conflicto se entregan al llamador.
        if (!this.esConflictoDeVista(error) || intento === MAX_INTENTOS_CONFLICTO_VISTA) {
          throw error;
        }
      }
    }
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
    manager: Repository<Licencia>['manager'], actor: Usuario, licencia: Licencia, ahora: Date,
  ): Promise<void> {
    const efectiva = licencia.bloqueoProgramadoEn;
    if (!efectiva || efectiva > ahora || licencia.congeladaEn != null) return;
    const anterior = licencia.venceEn;
    licencia.congeladaEn = new Date(efectiva);
    licencia.suspendidaEn = new Date(efectiva);
    licencia.remanenteMs = anterior === null
      ? null : String(Math.max(0, anterior.getTime() - efectiva.getTime()));
    // La suspensión efectiva invalida la elegibilidad aunque venceEn se conserve.
    licencia.versionVencimiento = (licencia.versionVencimiento ?? 0) + 1;
    await manager.getRepository(Licencia).save(licencia);
    await this.invalidarAvisos(manager, licencia, true);
    await this.registrar(manager, actor.id, licencia, 'licencia_congelada',
      { venceEn: anterior?.toISOString() ?? null, congeladaEn: null },
      { venceEn: anterior?.toISOString() ?? null, congeladaEn: efectiva.toISOString(),
        remanenteMs: licencia.remanenteMs });
  }

  private async invalidarAvisos(manager: Repository<Licencia>['manager'],
    licencia: Licencia, todos: boolean): Promise<void> {
    // Conserva confirmados e historial; retira solamente trabajos aún recuperables.
    const consulta = manager.getRepository(EnvioCorreo).createQueryBuilder().update()
      .set({ estado: EstadoEnvioCorreo.DESCARTADO, arrendamientoId: null,
        arrendadoHasta: null, ultimoError: 'Vencimiento sustituido o suspendido.' })
      .where('licencia_id = :id AND tipo = :tipo AND estado IN (:...estados)', {
        id: licencia.id, tipo: TipoEnvioCorreo.AVISO_VENCIMIENTO,
        estados: [EstadoEnvioCorreo.PENDIENTE, EstadoEnvioCorreo.FALLIDO,
          EstadoEnvioCorreo.TOMADO],
      });
    if (!todos) consulta.andWhere('version_vencimiento <> :version',
      { version: licencia.versionVencimiento });
    await consulta.execute();
  }
}
