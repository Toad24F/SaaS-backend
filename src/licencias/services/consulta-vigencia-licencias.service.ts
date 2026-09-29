import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Licencia } from '../entities/licencia.entity';
import { EstadoAccesoLicencia, PoliticaAccesoLicenciaService } from './politica-acceso-licencia.service';
import { VistaVigenciaLicenciaService } from './vista-vigencia-licencia.service';

/** Resuelve la licencia por identidad del token o por ID exclusivo de superadmin. */
@Injectable()
export class ConsultaVigenciaLicenciasService {
  constructor(
    @InjectRepository(Licencia) private readonly licencias: Repository<Licencia>,
    private readonly politica: PoliticaAccesoLicenciaService,
    private readonly vista: VistaVigenciaLicenciaService,
  ) {}

  async propia(negocioId: number, ahora: Date) {
    const licencia = await this.licencias.findOneBy({ negocioId });
    if (!licencia) throw new NotFoundException('Licencia no disponible.');
    // La consulta informa vigencia, pero no abre una ruta alternativa después del bloqueo.
    if (this.politica.estado(licencia, ahora) !== EstadoAccesoLicencia.VIGENTE) {
      throw new UnauthorizedException('Acceso actual no disponible.');
    }
    return this.vista.crear(licencia, ahora);
  }

  async porId(id: number, ahora: Date) {
    const licencia = await this.licencias.findOneBy({ id });
    if (!licencia) throw new NotFoundException('Licencia no disponible.');
    return this.vista.crear(licencia, ahora);
  }
}
