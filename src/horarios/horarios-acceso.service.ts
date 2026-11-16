import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AutorizacionService, Permiso } from '../auth/services/autorizacion.service';
import { Personal } from '../profesionales/entities/personal.entity';
import { Usuario } from '../usuarios/entities/usuario.entity';
import { EntradaSemana, HorariosService } from './horarios.service';
import { AtencionService } from './atencion.service';

/** Deriva el negocio y la propiedad de registros actuales, nunca del cuerpo HTTP. */
@Injectable()
export class HorariosAccesoService {
  constructor(@InjectRepository(Personal) private readonly perfiles: Repository<Personal>,
    private readonly autorizacion: AutorizacionService,
    private readonly horarios: HorariosService,
    private readonly atencion: AtencionService) {}

  private async negocioAutorizado(actorId: number, personalId: number,
    permiso: Permiso): Promise<number> {
    const actor = await this.perfiles.manager.getRepository(Usuario).findOneBy({ id: actorId });
    if (!actor || !actor.activo || !actor.activadoEn || actor.negocioId === null) {
      throw new ForbiddenException('Cuenta no disponible.');
    }
    const perfil = await this.perfiles.findOneBy({ id: personalId,
      negocioId: actor.negocioId });
    if (!perfil) throw new NotFoundException('Profesional no disponible.');
    this.autorizacion.exigirSobreRecurso({ id: actor.id, rol: actor.rol,
      negocioId: actor.negocioId }, permiso,
    { negocioId: perfil.negocioId, usuarioId: perfil.id });
    return perfil.negocioId;
  }

  async consultarSemana(actorId: number, personalId: number) {
    const negocioId = await this.negocioAutorizado(actorId, personalId, Permiso.CONSULTAR_HORARIO);
    return this.horarios.consultarSemana(negocioId, personalId);
  }

  async consultarAtencion(actorId: number, personalId: number, desde: string, hasta: string) {
    const negocioId = await this.negocioAutorizado(actorId, personalId, Permiso.CONSULTAR_HORARIO);
    return this.atencion.consultar(actorId, negocioId, personalId, desde, hasta);
  }

  async guardarSemana(actorId: number, personalId: number,
    franjas: EntradaSemana[], desde: string) {
    const negocioId = await this.negocioAutorizado(actorId, personalId, Permiso.GESTIONAR_HORARIO);
    return this.horarios.guardarSemana(negocioId, personalId, franjas, desde, actorId);
  }

}
