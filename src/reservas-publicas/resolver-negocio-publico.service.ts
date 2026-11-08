import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { RELOJ, type Reloj } from '../comun/reloj';
import { Negocio } from '../negocios/entities/negocio.entity';
import { Licencia } from '../licencias/entities/licencia.entity';
import { PoliticaAccesoLicenciaService } from '../licencias/services/politica-acceso-licencia.service';

/** Proyección mínima del negocio autorizada para el portal. */
export interface NegocioPublicoAutorizado {
  id: number;
  slug: string;
  nombre: string;
  categoria?: string | null;
  telefono?: string | null;
  mostrarContactoPublico?: boolean;
  mostrarPreciosPublicos?: boolean;
}

@Injectable()
export class ResolverNegocioPublicoService {
  constructor(@InjectDataSource() private readonly db: DataSource,
    @Inject(RELOJ) private readonly reloj: Reloj,
    private readonly politica: PoliticaAccesoLicenciaService) {}

  /** Slug, activación y licencia se leen en una instantánea; 404 uniforme
   * impide distinguir negocios ajenos, pendientes o suspendidos. */
  async resolver(slug: string): Promise<NegocioPublicoAutorizado> {
    const ahora = this.reloj.ahora();
    return this.db.transaction('REPEATABLE READ', (manager) =>
      this.resolverEnContexto(manager, slug, ahora));
  }

  /** Reutiliza la misma instantánea para autorizar el catálogo y leer su oferta. */
  async resolverEnContexto(manager: EntityManager, slug: string,
    ahora: Date): Promise<NegocioPublicoAutorizado> {
    const negocio = await this.buscarNegocio(manager, slug);
    const licencia = await manager.getRepository(Licencia)
      .findOneBy({ negocioId: negocio.id });
    if (!licencia || !this.politica.puedeAceptarReserva(
      negocio.activadoEn !== null, licencia, ahora)) {
      throw new NotFoundException('Portal no disponible para reservar.');
    }
    return { id: negocio.id, slug: negocio.slug, nombre: negocio.nombre,
      categoria: negocio.categoria, telefono: negocio.telefonoContacto,
      mostrarContactoPublico: negocio.mostrarContactoPublico,
      mostrarPreciosPublicos: negocio.mostrarPreciosPublicos };
  }

  /** Relee la opción vigente tras el commit público, sin exigir licencia para
   * la recuperación propia de una reserva que ya existe. */
  async mostrarPreciosVigentes(negocioId: number): Promise<boolean> {
    const negocio = await this.db.getRepository(Negocio).findOneBy({ id: negocioId });
    if (!negocio) throw new NotFoundException('Portal no disponible para reservar.');
    return negocio.mostrarPreciosPublicos;
  }

  /** Liberación y recuperación propias siguen disponibles si venció la licencia.
   * Una escritura nueva debe autorizar la licencia dentro de su transacción. */
  async resolverParaLiberar(slug: string): Promise<NegocioPublicoAutorizado> {
    return this.db.transaction('REPEATABLE READ', async (manager) => {
      const negocio = await this.buscarNegocio(manager, slug);
      return { id: negocio.id, slug: negocio.slug, nombre: negocio.nombre };
    });
  }

  private async buscarNegocio(manager: EntityManager, slug: string): Promise<Negocio> {
    // El alta histórica admite identificadores sin una gramática de guiones;
    // la búsqueda exacta conserva esos enlaces y el URL se escapa al emitir cookie.
    if (typeof slug !== 'string' || !slug || slug.length > 100 ||
      [...slug].some((caracter) => caracter.charCodeAt(0) < 32 ||
        caracter.charCodeAt(0) === 127)) {
      throw new NotFoundException('Portal no disponible para reservar.');
    }
    const negocio = await manager.getRepository(Negocio).findOneBy({ slug });
    if (!negocio) throw new NotFoundException('Portal no disponible para reservar.');
    return negocio;
  }
}
