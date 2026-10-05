import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { transaccionIdentidad } from '../../comun/transaccion-identidad';
import { Rol } from '../../auth/enums/rol.enum';
import { BandejaCorreoService } from '../../correos/bandeja-correo.service';
import { EnvioCorreo } from '../../correos/entities/envio-correo.entity';
import { Negocio } from '../../negocios/entities/negocio.entity';
import { Usuario } from '../../usuarios/entities/usuario.entity';
import { Licencia } from '../entities/licencia.entity';
import { avisoElegible } from './aviso-elegible';

/** Detecta vencimientos; el ejecutor periódico que lo invoca llegará en T121. */
@Injectable()
export class AvisosVencimientoService {
  constructor(private readonly db: DataSource,
    private readonly bandeja: BandejaCorreoService) {}

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
