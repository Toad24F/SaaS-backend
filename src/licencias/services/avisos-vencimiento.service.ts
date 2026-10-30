import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { transaccionIdentidad } from '../../comun/transaccion-identidad';
import { Rol } from '../../auth/enums/rol.enum';
import { BandejaCorreoService } from '../../correos/bandeja-correo.service';
import { EnvioCorreo, EstadoEnvioCorreo, TipoEnvioCorreo } from '../../correos/entities/envio-correo.entity';
import { Negocio } from '../../negocios/entities/negocio.entity';
import { Usuario } from '../../usuarios/entities/usuario.entity';
import { Licencia } from '../entities/licencia.entity';
import { umbralPreventivo } from './aviso-elegible';
import { claveAvisoLicencia } from './clave-aviso-licencia';

/** Detecta vencimientos; el ejecutor periódico que lo invoca llegará en T121. */
@Injectable()
export class AvisosVencimientoService {
  constructor(private readonly db: DataSource,
    private readonly bandeja: BandejaCorreoService) {}

  /** Encola vencimientos naturales; un bloqueo anterior conserva prioridad. */
  async detectarLimites(ahora: Date): Promise<number> {
    const candidatas = await this.db.getRepository(Licencia).createQueryBuilder('licencia')
      .select(['licencia.id AS id', 'licencia.negocioId AS negocioId'])
      .where('licencia.venceEn <= :ahora AND licencia.habilitadaEn IS NOT NULL', { ahora })
      .orderBy('licencia.id', 'ASC').getRawMany<{ id: number; negocioId: number }>();
    let creados = 0;
    for (const candidata of candidatas) {
      const creado = await transaccionIdentidad(this.db, async (manager) => {
        // Barrera de negocio antes de licencia, con releída después de esperar.
        const negocio = await manager.getRepository(Negocio).createQueryBuilder('negocio')
          .setLock('pessimistic_write').where('negocio.id = :id',
            { id: candidata.negocioId }).getOne();
        const licencia = await manager.getRepository(Licencia).createQueryBuilder('licencia')
          .setLock('pessimistic_write').where('licencia.id = :id', { id: candidata.id }).getOne();
        if (!negocio?.correoAdministrador || negocio.activadoEn === null || !licencia?.venceEn ||
          licencia.venceEn > ahora || licencia.versionVencimiento < 1 ||
          (licencia.bloqueoProgramadoEn !== null &&
            licencia.bloqueoProgramadoEn < licencia.venceEn) ||
          (licencia.congeladaEn !== null && licencia.congeladaEn < licencia.venceEn)) return false;
        const tipo = TipoEnvioCorreo.LICENCIA_VENCIDA;
        const clave = claveAvisoLicencia({ negocioId: negocio.id, licenciaId: licencia.id,
          tipo, versionVencimiento: licencia.versionVencimiento });
        const existente = await manager.getRepository(EnvioCorreo).findOneBy({ claveDedupe: clave });
        if (existente) return false;
        // El vencimiento retira el aviso de bloqueo futuro todavía no entregado.
        await manager.getRepository(EnvioCorreo).createQueryBuilder().update()
          .set({ estado: EstadoEnvioCorreo.DESCARTADO, arrendamientoId: null,
            arrendadoHasta: null, ultimoError: 'Vencimiento natural anterior.' })
          .where('licencia_id = :id AND tipo = :tipo AND estado IN (:...estados)', {
            id: licencia.id, tipo: TipoEnvioCorreo.SUSPENSION_PROGRAMADA,
            estados: [EstadoEnvioCorreo.PENDIENTE, EstadoEnvioCorreo.FALLIDO,
              EstadoEnvioCorreo.TOMADO],
          }).execute();
        await this.bandeja.encolarEventoLicencia(manager, { negocioId: negocio.id,
          licenciaId: licencia.id, correoDestinatario: negocio.correoAdministrador,
          tipo, versionVencimiento: licencia.versionVencimiento, ahora });
        return true;
      }, 'READ COMMITTED');
      if (creado) creados++;
    }
    return creados;
  }

  async detectar(ahora: Date): Promise<number> {
    const fin = new Date(ahora.getTime() + 15 * 24 * 60 * 60 * 1000);
    const candidatos = await this.db.getRepository(Licencia).createQueryBuilder('licencia')
      .select(['licencia.id AS id', 'licencia.negocioId AS negocioId'])
      .where('licencia.venceEn > :ahora AND licencia.venceEn <= :fin', { ahora, fin })
      .andWhere('licencia.habilitadaEn IS NOT NULL AND licencia.suspendidaEn IS NULL')
      .orderBy('licencia.id', 'ASC').getRawMany<{ id: number; negocioId: number }>();
    let creados = 0;
    for (const candidato of candidatos) {
      const creado = await transaccionIdentidad(this.db, async (manager) => {
        // Negocio es la barrera común; ambos se releen tras esperar el bloqueo.
        const negocio = await manager.getRepository(Negocio).createQueryBuilder('negocio')
          .setLock('pessimistic_write').where('negocio.id = :id',
            { id: candidato.negocioId }).getOne();
        const licencia = await manager.getRepository(Licencia).createQueryBuilder('licencia')
          .setLock('pessimistic_write').where('licencia.id = :id', { id: candidato.id }).getOne();
        if (!licencia || !negocio?.correoAdministrador || negocio.activadoEn === null) return false;
        const umbral = umbralPreventivo(licencia, ahora);
        if (umbral === null) return false;
        const admin = await manager.getRepository(Usuario).findOneBy({ negocioId: negocio.id,
          email: negocio.correoAdministrador, rol: Rol.ADMIN_NEGOCIO, activo: true });
        if (!admin?.activadoEn) return false;
        if (umbral === 7) {
          // El aviso de quince sin entregar ya describiría una ventana equivocada.
          await manager.getRepository(EnvioCorreo).createQueryBuilder().update()
            .set({ estado: EstadoEnvioCorreo.DESCARTADO, arrendamientoId: null,
              arrendadoHasta: null, ultimoError: 'Umbral preventivo sustituido.' })
            .where('licencia_id = :id AND version_vencimiento = :version AND tipo = :tipo '
              + 'AND umbral_dias = 15 AND estado IN (:...estados)', {
              id: licencia.id, version: licencia.versionVencimiento,
              tipo: TipoEnvioCorreo.AVISO_PREVENTIVO,
              estados: [EstadoEnvioCorreo.PENDIENTE, EstadoEnvioCorreo.FALLIDO,
                EstadoEnvioCorreo.TOMADO],
            }).execute();
        }
        const clave = claveAvisoLicencia({ negocioId: negocio.id, licenciaId: licencia.id,
          tipo: TipoEnvioCorreo.AVISO_PREVENTIVO,
          versionVencimiento: licencia.versionVencimiento, umbralDias: umbral });
        const existente = await manager.getRepository(EnvioCorreo).findOneBy({ claveDedupe: clave });
        if (existente) return false;
        await this.bandeja.encolarEventoLicencia(manager, { negocioId: negocio.id,
          licenciaId: licencia.id, correoDestinatario: admin.email,
          tipo: TipoEnvioCorreo.AVISO_PREVENTIVO,
          versionVencimiento: licencia.versionVencimiento, umbralDias: umbral, ahora });
        return true;
      }, 'READ COMMITTED');
      if (creado) creados++;
    }
    return creados;
  }
}
