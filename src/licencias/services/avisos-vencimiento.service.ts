import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { transaccionIdentidad } from '../../comun/transaccion-identidad';
import { Rol } from '../../auth/enums/rol.enum';
import { BandejaCorreoService } from '../../correos/bandeja-correo.service';
import { EnvioCorreo, EstadoEnvioCorreo, TipoEnvioCorreo } from '../../correos/entities/envio-correo.entity';
import { Negocio } from '../../negocios/entities/negocio.entity';
import { Usuario } from '../../usuarios/entities/usuario.entity';
import { Licencia } from '../entities/licencia.entity';
import { avisoElegible } from './aviso-elegible';
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
    const fin = new Date(ahora.getTime() + 48 * 60 * 60 * 1000);
    const candidatos = await this.db.getRepository(Licencia).createQueryBuilder('licencia')
      .select('licencia.id', 'id')
      .where('licencia.venceEn > :ahora AND licencia.venceEn <= :fin', { ahora, fin })
      .andWhere('licencia.habilitadaEn IS NOT NULL AND licencia.suspendidaEn IS NULL')
      .orderBy('licencia.id', 'ASC').getRawMany<{ id: number }>();
    let creados = 0;
    for (const candidato of candidatos) {
      const creado = await transaccionIdentidad(this.db, async (manager) => {
        // El bloqueo vuelve a leer la licencia tras una renovación o suspensión concurrente.
        const licencia = await manager.getRepository(Licencia).createQueryBuilder('licencia')
          .setLock('pessimistic_write').where('licencia.id = :id', { id: candidato.id }).getOne();
        if (!licencia || !avisoElegible(licencia, ahora)) return false;
        const negocio = await manager.getRepository(Negocio).findOneBy({ id: licencia.negocioId });
        if (!negocio?.correoAdministrador || negocio.activadoEn === null) return false;
        const admin = await manager.getRepository(Usuario).findOneBy({ negocioId: negocio.id,
          email: negocio.correoAdministrador, rol: Rol.ADMIN_NEGOCIO, activo: true });
        if (!admin?.activadoEn) return false;
        const clave = `negocio:${negocio.id}:licencia:${licencia.id}:version:${licencia.versionVencimiento}`;
        const existente = await manager.getRepository(EnvioCorreo).createQueryBuilder('envio')
          .setLock('pessimistic_write').where('envio.claveDedupe = :clave', { clave }).getOne();
        if (existente) return false;
        await this.bandeja.encolarAviso(manager, { negocioId: negocio.id,
          licenciaId: licencia.id, usuarioId: admin.id,
          versionVencimiento: licencia.versionVencimiento, ahora });
        return true;
      });
      if (creado) creados++;
    }
    return creados;
  }
}
