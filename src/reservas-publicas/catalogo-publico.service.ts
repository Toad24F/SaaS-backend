import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { RELOJ, type Reloj } from '../comun/reloj';
import { ResolverNegocioPublicoService } from './resolver-negocio-publico.service';
import type { FiltrosCatalogoPublico } from './entradas-publicas';
import { proyectarPreciosPublicos } from './proyeccion-precios-publicos';
import { PersonalizacionPortalService } from '../personalizacion-portal/personalizacion-portal.service';
import { normalizarIdLogo } from '../personalizacion-portal/personalizacion-portal.entradas';
import { RecursoPortal } from '../personalizacion-portal/entities/recurso-portal.entity';

interface FilaOferta {
  servicioId: number; servicioNombre: string; costo: string; duracionMinutos: number;
  descripcion: string | null;
  sucursalId: number; sucursalNombre: string; direccion: string; zonaHoraria: string;
  telefono: string; indicaciones: string | null;
  personalId: number; personalNombre: string; especialidad: string | null;
}

@Injectable()
export class CatalogoPublicoService {
  constructor(@InjectDataSource() private readonly db: DataSource,
    @Inject(RELOJ) private readonly reloj: Reloj,
    private readonly negocios: ResolverNegocioPublicoService,
    private readonly personalizacion: PersonalizacionPortalService) {}

  /** Autoriza y proyecta una instantánea de combinaciones activas del negocio. */
  async consultar(slug: string, filtros: FiltrosCatalogoPublico) {
    const ahora = this.reloj.ahora();
    return this.db.transaction('REPEATABLE READ', async (manager) => {
      const negocio = await this.negocios.resolverEnContexto(manager, slug, ahora);
      // Cada JOIN usa negocio_id y cada estado activo: una selección parcial
      // nunca convierte un servicio o una sucursal en oferta pública.
      // La marca se comprueba además del estado para excluir retiradas recuperables.
      const filas = await manager.query(`SELECT
        s.id AS servicioId, s.nombre AS servicioNombre, s.costo AS costo,
        s.duracion_minutos AS duracionMinutos, s.descripcion AS descripcion,
        su.id AS sucursalId, su.nombre AS sucursalNombre,
        su.direccion AS direccion, su.zona_horaria AS zonaHoraria,
        su.telefono AS telefono, su.notas_llegada AS indicaciones,
        u.id AS personalId, u.nombre AS personalNombre, p.especialidad AS especialidad
        FROM personal_servicios_sucursales pss
        JOIN personal_sucursales ps ON ps.negocio_id=pss.negocio_id
          AND ps.personal_id=pss.personal_id AND ps.sucursal_id=pss.sucursal_id
        JOIN personal_servicios pv ON pv.negocio_id=pss.negocio_id
          AND pv.personal_id=pss.personal_id AND pv.servicio_id=pss.servicio_id
        JOIN personal p ON p.negocio_id=pss.negocio_id AND p.id=pss.personal_id
        JOIN usuarios u ON u.negocio_id=p.negocio_id AND u.id=p.id
        JOIN sucursales su ON su.negocio_id=pss.negocio_id AND su.id=pss.sucursal_id
        JOIN servicios s ON s.negocio_id=pss.negocio_id AND s.id=pss.servicio_id
        WHERE pss.negocio_id=? AND pss.activo=1 AND ps.activo=1
          AND pv.activo=1 AND u.activo=1 AND u.activado_en IS NOT NULL
          AND u.inhabilitado_en IS NULL AND su.inhabilitado_en IS NULL
          AND s.inhabilitado_en IS NULL
          AND u.rol='profesional' AND su.activo=1 AND s.activo=1
        ORDER BY s.nombre,s.id,su.nombre,su.id,u.nombre,u.id`,
      [negocio.id]) as FilaOferta[];
      // Las etapas solo avanzan con selecciones compatibles. Los IDs ajenos
      // producen listas vacías en la etapa siguiente sin revelar sus nombres.
      const servicios = [...new Map(filas.map((fila) => [fila.servicioId,
        { id: fila.servicioId, nombre: fila.servicioNombre, costo: fila.costo,
          duracionMinutos: fila.duracionMinutos,
          ...(fila.descripcion ? { descripcion: fila.descripcion } : {}) }])).values()];
      const deServicio = filtros.servicioId === undefined ? [] :
        filas.filter((fila) => fila.servicioId === filtros.servicioId);
      const sucursales = [...new Map(deServicio.map((fila) => [fila.sucursalId,
        { id: fila.sucursalId, nombre: fila.sucursalNombre,
          direccion: fila.direccion, zonaHoraria: fila.zonaHoraria,
          ...(negocio.mostrarContactoPublico ? { telefono: fila.telefono,
            ...(fila.indicaciones ? { indicaciones: fila.indicaciones } : {}) } : {}) }])).values()];
      const deSucursal = filtros.sucursalId === undefined ? [] :
        deServicio.filter((fila) => fila.sucursalId === filtros.sucursalId);
      const profesionales = [...new Map(deSucursal.map((fila) => [fila.personalId,
        { id: fila.personalId, nombre: fila.personalNombre,
          ...(fila.especialidad ? { especialidad: fila.especialidad } : {}) }])).values()];
      // La marca se lee en la misma instantánea que el slug, la licencia y la oferta.
      const { acento, logoId } = await this.personalizacion.consultarMarca(manager, negocio.id);
      const resultado = { negocio: { slug: negocio.slug, nombre: negocio.nombre,
        ...(negocio.categoria ? { categoria: negocio.categoria } : {}),
        ...(negocio.mostrarContactoPublico && negocio.telefono ?
          { telefono: negocio.telefono } : {}) },
        marca: { acento, ...(logoId ? { logoUrl: `/publico/negocios/${encodeURIComponent(negocio.slug)}/logos/${logoId}` } : {}) },
        servicios, sucursales, profesionales };
      // Oferta y visibilidad proceden de la misma instantánea del negocio.
      return proyectarPreciosPublicos(resultado, negocio.mostrarPreciosPublicos ?? true);
    });
  }

  async consultarLogo(slug: string, id: string) {
    const logoId = normalizarIdLogo(id);
    if (!logoId) throw new NotFoundException('Logo no disponible.');
    const ahora = this.reloj.ahora();
    return this.db.transaction('REPEATABLE READ', async (manager) => {
      const negocio = await this.negocios.resolverEnContexto(manager, slug, ahora);
      // La referencia publicada y el binario se leen bajo la misma instantánea.
      const recurso = await manager.getRepository(RecursoPortal).createQueryBuilder('recurso')
        .innerJoin('personalizacion_portal', 'marca', 'marca.negocio_id = recurso.negocio_id AND marca.logo_id = recurso.id')
        .select(['recurso.contenido', 'recurso.mime'])
        .where({ negocioId: negocio.id, id: logoId }).getOne();
      if (!recurso) throw new NotFoundException('Logo no disponible.');
      return { contenido: recurso.contenido, mime: recurso.mime };
    });
  }
}
