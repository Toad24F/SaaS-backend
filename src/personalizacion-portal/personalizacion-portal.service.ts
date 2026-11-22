import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { DataSource, type EntityManager } from 'typeorm';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { AutorizacionService, Permiso } from '../auth/services/autorizacion.service';
import { RELOJ, type Reloj } from '../comun/reloj';
import { Negocio } from '../negocios/entities/negocio.entity';
import { Usuario } from '../usuarios/entities/usuario.entity';
import { COLORES_PREDETERMINADOS_PORTAL, type ColoresPortal } from './colores-portal';
import { PersonalizacionPortal } from './entities/personalizacion-portal.entity';
import { RecursoPortal } from './entities/recurso-portal.entity';
import { sanearLogoPortal } from './logo-portal';
import { leerVersionPortal, MAX_VERSION_PORTAL, validarPublicacionPortal, validarVersionPortal } from './personalizacion-portal.entradas';

const VIGENCIA_PROVISIONAL_MS = 24 * 60 * 60 * 1000;
const MAX_NEGOCIOS_POR_LIMPIEZA = 100;

function proyectarMarca(fila: PersonalizacionPortal | null) {
  const colores = fila ? { fondo: fila.fondo, texto: fila.texto, acento: fila.acento } : COLORES_PREDETERMINADOS_PORTAL;
  return { version: fila?.version ?? 0, colores, logoId: fila?.logoId ?? null };
}

@Injectable()
export class PersonalizacionPortalService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    @Inject(RELOJ) private readonly reloj: Reloj,
    private readonly autorizacion: AutorizacionService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async consultar(actorId: number) {
    const negocioId = this.negocioDelAdministrador(await this.db.manager.findOneBy(Usuario, { id: actorId }));
    return { ...await this.consultarMarca(this.db.manager, negocioId), predeterminados: COLORES_PREDETERMINADOS_PORTAL };
  }

  async consultarMarca(manager: EntityManager, negocioId: number) {
    return proyectarMarca(await manager.findOneBy(PersonalizacionPortal, { negocioId }));
  }

  async guardarLogoProvisional(actorId: number, version: number, archivo: Buffer, mime: string) {
    const negocioId = this.negocioDelAdministrador(await this.db.manager.findOneBy(Usuario, { id: actorId }));
    validarVersionPortal(version);

    // El trabajo del decodificador ocurre fuera de la transacción y sus bloqueos.
    const logo = await sanearLogoPortal(archivo, mime);
    const id = randomUUID();
    return this.conVersion(actorId, version, async (manager, negocioActual) => {
      if (negocioActual !== negocioId) {
        throw new ForbiddenException('El negocio de la cuenta cambió.');
      }

      // Crear un recurso separado mantiene intactos el logo activo y la versión publicada.
      const creadoEn = this.reloj.ahora();
      const expiraEn = new Date(creadoEn.getTime() + VIGENCIA_PROVISIONAL_MS);
      await manager.insert(RecursoPortal, { negocioId, id, ...logo, creadoEn, expiraEn });
      return { id, expiraEn };
    });
  }

  publicar(actorId: number, entrada: unknown) {
    const { version, colores, logoId } = validarPublicacionPortal(entrada);
    return this.guardarMarca(actorId, version, colores, logoId, 'personalizacion_portal_publicada');
  }

  restaurar(actorId: number, entrada: unknown) {
    const version = leerVersionPortal(entrada);
    return this.guardarMarca(actorId, version, COLORES_PREDETERMINADOS_PORTAL, null, 'personalizacion_portal_restaurada');
  }

  async limpiarProvisionalesVencidos(ahora: Date): Promise<void> {
    const negocios = await this.db.query(`SELECT DISTINCT r.negocio_id AS id FROM recursos_portal r
      LEFT JOIN personalizacion_portal p ON p.negocio_id = r.negocio_id AND p.logo_id = r.id
      WHERE r.expira_en <= ? AND p.negocio_id IS NULL ORDER BY r.negocio_id LIMIT ?`,
    [ahora, MAX_NEGOCIOS_POR_LIMPIEZA]) as { id: number }[];

    for (const { id } of negocios) {
      await this.db.transaction('READ COMMITTED', async (manager) => {
        // Tras esperar a un publicador vuelve a comprobar la referencia antes de borrar.
        if (!await this.bloquearNegocio(manager, id)) return;
        await manager.query(`DELETE r FROM recursos_portal r
          LEFT JOIN personalizacion_portal p ON p.negocio_id = r.negocio_id AND p.logo_id = r.id
          WHERE r.negocio_id = ? AND r.expira_en <= ? AND p.negocio_id IS NULL`, [id, ahora]);
      });
    }
  }

  private guardarMarca(actorId: number, version: number, colores: ColoresPortal, logoId: string | null, accion: string) {
    return this.conVersion(actorId, version, async (manager, negocioId, anterior) => {
      const ahora = this.reloj.ahora();
      if (logoId !== null && logoId !== anterior?.logoId) {
        // Solo el logo vigente se puede conservar después de su caducidad provisional.
        const recurso = await manager.findOne(RecursoPortal, { where: { negocioId, id: logoId },
          select: { expiraEn: true } });
        if (!recurso || recurso.expiraEn <= ahora) throw new NotFoundException('Logo no disponible.');
      }
      if (version === MAX_VERSION_PORTAL) throw new ConflictException('La versión de personalización alcanzó su límite.');
      const siguiente = { version: version + 1, ...colores, logoId };
      if (anterior) await manager.update(PersonalizacionPortal, { negocioId }, siguiente);
      else await manager.insert(PersonalizacionPortal, { negocioId, ...siguiente });

      // El commit publica logo, colores, versión y auditoría juntos. La auditoría guarda solo la proyección.
      const publicada = { version: siguiente.version, colores, logoId };
      await this.auditoria.registrar(manager, { operacionId: randomUUID(), actorUsuarioId: actorId, negocioId,
        usuarioId: null, licenciaId: null, accion, ocurridoEn: ahora,
        valoresAntes: proyectarMarca(anterior), valoresDespues: publicada });
      return publicada;
    });
  }

  private conVersion<T>(actorId: number, version: number,
    escribir: (manager: EntityManager, negocioId: number, actual: PersonalizacionPortal | null) => Promise<T>) {
    return this.db.transaction('READ COMMITTED', async (manager) => {
      const actor = await manager.findOne(Usuario, { where: { id: actorId }, lock: { mode: 'pessimistic_write' } });
      const negocioId = this.negocioDelAdministrador(actor);
      // La fila padre serializa incluso la primera publicación, cuando aún no hay configuración.
      if (!await this.bloquearNegocio(manager, negocioId)) throw new ForbiddenException('Negocio no disponible.');
      const actual = await manager.findOneBy(PersonalizacionPortal, { negocioId });
      if ((actual?.version ?? 0) !== version) {
        throw new ConflictException('La versión de personalización cambió. Recarga y vuelve a intentarlo.');
      }
      return escribir(manager, negocioId, actual);
    });
  }

  private bloquearNegocio(manager: EntityManager, id: number) {
    return manager.findOne(Negocio, { where: { id }, select: { id: true }, lock: { mode: 'pessimistic_write' } });
  }

  private negocioDelAdministrador(usuario: Usuario | null): number {
    if (!usuario?.activo || !usuario.activadoEn || usuario.inhabilitadoEn || usuario.negocioId === null) {
      throw new ForbiddenException('Cuenta de negocio no disponible.');
    }
    this.autorizacion.exigir(usuario.rol, Permiso.PERSONALIZAR_PORTAL);
    return usuario.negocioId;
  }
}
