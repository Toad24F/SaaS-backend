import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { RELOJ, type Reloj } from '../comun/reloj';
import { Negocio } from '../negocios/entities/negocio.entity';
import { Licencia } from '../licencias/entities/licencia.entity';
import { PoliticaAccesoLicenciaService } from '../licencias/services/politica-acceso-licencia.service';

/** Proyección mínima del negocio autorizada para el portal. */
export interface NegocioPublicoAutorizado {
  id: number;
  slug: string;
  nombre: string;
}

@Injectable()
export class ResolverNegocioPublicoService {
  constructor(@InjectDataSource() private readonly db: DataSource,
    @Inject(RELOJ) private readonly reloj: Reloj,
    private readonly politica: PoliticaAccesoLicenciaService) {}

  /** Slug, activación y licencia se leen en una instantánea; 404 uniforme
   * impide distinguir negocios ajenos, pendientes o suspendidos. */
  async resolver(slug: string): Promise<NegocioPublicoAutorizado> {
    // El alta histórica admite identificadores sin una gramática de guiones;
    // la búsqueda exacta conserva esos enlaces y el URL se escapa al emitir cookie.
    if (typeof slug !== 'string' || !slug || slug.length > 100 ||
      [...slug].some((caracter) => caracter.charCodeAt(0) < 32 ||
        caracter.charCodeAt(0) === 127)) {
      throw new NotFoundException('Portal no disponible para reservar.');
    }
    const ahora = this.reloj.ahora();
    return this.db.transaction('REPEATABLE READ', async (manager) => {
      const negocio = await manager.getRepository(Negocio).findOneBy({ slug });
      if (!negocio) throw new NotFoundException('Portal no disponible para reservar.');
      const licencia = await manager.getRepository(Licencia)
        .findOneBy({ negocioId: negocio.id });
      if (!licencia || !this.politica.puedeAceptarReserva(
        negocio.activadoEn !== null, licencia, ahora)) {
        throw new NotFoundException('Portal no disponible para reservar.');
      }
      return { id: negocio.id, slug: negocio.slug, nombre: negocio.nombre };
    });
  }
}
