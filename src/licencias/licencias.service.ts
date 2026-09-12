import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { AutorizacionService, Permiso } from '../auth/services/autorizacion.service';
import { Usuario } from '../usuarios/entities/usuario.entity';
import { Licencia } from './entities/licencia.entity';
import { CalendarioLicenciasService } from './services/calendario-licencias.service';

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
      if (licencia.suspendidaEn !== null) return;
      if (licencia.venceEn !== null && ahora >= licencia.venceEn) {
        throw new BadRequestException('Una licencia vencida debe renovarse antes de suspenderse.');
      }
      licencia.suspendidaEn = new Date(ahora);
      await manager.getRepository(Licencia).save(licencia);
      await this.registrar(manager, actor.id, licencia, 'licencia_suspendida',
        { suspendidaEn: null, venceEn: licencia.venceEn?.toISOString() ?? null },
        { suspendidaEn: ahora.toISOString(), venceEn: licencia.venceEn?.toISOString() ?? null });
    });
  }

  async reactivar(actorId: number, licenciaId: number, ahora: Date): Promise<void> {
    await this.operar(actorId, licenciaId, async (manager, actor, licencia) => {
      if (licencia.suspendidaEn === null) return;
      const suspendidaEn = licencia.suspendidaEn;
      const venceAnterior = licencia.venceEn;
      // En pendientes solo se quita la marca; nunca se inventa tiempo de licencia.
      licencia.venceEn = venceAnterior === null ? null : new Date(
        venceAnterior.getTime() + ahora.getTime() - suspendidaEn.getTime(),
      );
      licencia.suspendidaEn = null;
      await manager.getRepository(Licencia).save(licencia);
      await this.registrar(manager, actor.id, licencia, 'licencia_reactivada',
        { suspendidaEn: suspendidaEn.toISOString(), venceEn: venceAnterior?.toISOString() ?? null },
        { suspendidaEn: null, venceEn: licencia.venceEn?.toISOString() ?? null });
    });
  }

  async renovar(actorId: number, licenciaId: number, ahora: Date): Promise<void> {
    await this.operar(actorId, licenciaId, async (manager, actor, licencia) => {
      if (licencia.habilitadaEn === null || licencia.venceEn === null) {
        throw new BadRequestException('La licencia pendiente no puede renovarse.');
      }
      const anterior = licencia.venceEn;
      const base = licencia.suspendidaEn !== null || ahora < anterior ? anterior : ahora;
      licencia.venceEn = this.calendario.sumarAnios(base);
      await manager.getRepository(Licencia).save(licencia);
      await this.registrar(manager, actor.id, licencia, 'licencia_renovada',
        { venceEn: anterior.toISOString(), suspendidaEn: licencia.suspendidaEn?.toISOString() ?? null },
        { venceEn: licencia.venceEn.toISOString(), suspendidaEn: licencia.suspendidaEn?.toISOString() ?? null });
    });
  }

  private async operar(
    actorId: number,
    licenciaId: number,
    operacion: (manager: Repository<Licencia>['manager'], actor: Usuario, licencia: Licencia) => Promise<void>,
  ): Promise<void> {
    await this.licencias.manager.transaction(async (manager) => {
      const actor = await manager.getRepository(Usuario).findOneBy({ id: actorId });
      if (!actor) throw new ForbiddenException('Acceso denegado.');
      this.autorizacion.exigir(actor.rol, Permiso.GESTIONAR_LICENCIA);
      const licencia = await manager.getRepository(Licencia).createQueryBuilder('licencia')
        .setLock('pessimistic_write').where('licencia.id = :id', { id: licenciaId }).getOneOrFail();
      await operacion(manager, actor, licencia);
    });
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
}
