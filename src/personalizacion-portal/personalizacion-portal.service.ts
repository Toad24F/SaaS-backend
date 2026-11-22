import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { AutorizacionService, Permiso } from '../auth/services/autorizacion.service';
import { RELOJ, type Reloj } from '../comun/reloj';
import { Negocio } from '../negocios/entities/negocio.entity';
import { Usuario } from '../usuarios/entities/usuario.entity';
import { PersonalizacionPortal } from './entities/personalizacion-portal.entity';
import { RecursoPortal } from './entities/recurso-portal.entity';
import { sanearLogoPortal } from './logo-portal';

const VIGENCIA_PROVISIONAL_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class PersonalizacionPortalService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    @Inject(RELOJ) private readonly reloj: Reloj,
    private readonly autorizacion: AutorizacionService,
  ) {}

  async guardarLogoProvisional(actorId: number, version: number, archivo: Buffer, mime: string) {
    const negocioId = this.negocioDelAdministrador(await this.db.getRepository(Usuario).findOneBy({ id: actorId }));
    if (!Number.isSafeInteger(version) || version < 0 || version > 0xffffffff) {
      throw new BadRequestException('La versión de personalización no es válida.');
    }

    // El trabajo del decodificador ocurre fuera de la transacción y sus bloqueos.
    const logo = await sanearLogoPortal(archivo, mime);
    const id = randomUUID();
    return this.db.transaction('READ COMMITTED', async (manager) => {
      const actor = await manager.findOne(Usuario, { where: { id: actorId }, lock: { mode: 'pessimistic_write' } });
      if (this.negocioDelAdministrador(actor) !== negocioId) {
        throw new ForbiddenException('El negocio de la cuenta cambió.');
      }

      // La fila padre serializa la revisión de versión incluso si aún no se publicó la marca.
      const negocio = await manager.findOne(Negocio, { where: { id: negocioId }, lock: { mode: 'pessimistic_write' } });
      if (!negocio) throw new ForbiddenException('Negocio no disponible.');
      const publicada = await manager.findOneBy(PersonalizacionPortal, { negocioId });
      if ((publicada?.version ?? 0) !== version) {
        throw new ConflictException('La versión de personalización cambió. Recarga y vuelve a intentarlo.');
      }

      // Crear un recurso separado mantiene intactos el logo activo y la versión publicada.
      const creadoEn = this.reloj.ahora();
      const expiraEn = new Date(creadoEn.getTime() + VIGENCIA_PROVISIONAL_MS);
      await manager.insert(RecursoPortal, { negocioId, id, ...logo, creadoEn, expiraEn });
      return { id, expiraEn };
    });
  }

  private negocioDelAdministrador(usuario: Usuario | null): number {
    if (!usuario?.activo || !usuario.activadoEn || usuario.negocioId === null) {
      throw new ForbiddenException('Cuenta de negocio no disponible.');
    }
    this.autorizacion.exigir(usuario.rol, Permiso.PERSONALIZAR_PORTAL);
    return usuario.negocioId;
  }
}
