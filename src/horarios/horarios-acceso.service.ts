import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AutorizacionService, Permiso } from '../auth/services/autorizacion.service';
import { Personal } from '../profesionales/entities/personal.entity';
import { Usuario } from '../usuarios/entities/usuario.entity';
import { EntradaExcepcion, EntradaSemana, HorariosService } from './horarios.service';
import { AtencionService } from './atencion.service';

/** Deriva el negocio y la propiedad de registros actuales, nunca del cuerpo HTTP. */
@Injectable()
export class HorariosAccesoService {
  constructor(@InjectRepository(Personal) private readonly perfiles: Repository<Personal>,
    private readonly autorizacion: AutorizacionService,
    private readonly horarios: HorariosService,
    private readonly atencion: AtencionService) {}

  private async negocioAutorizado(actorId: number, personalId: number): Promise<number> {
    const actor = await this.perfiles.manager.getRepository(Usuario).findOneBy({ id: actorId });
    if (!actor || !actor.activo || !actor.activadoEn || actor.negocioId === null) {
      throw new ForbiddenException('Cuenta no disponible.');
    }
    const perfil = await this.perfiles.findOneBy({ id: personalId,
      negocioId: actor.negocioId });
    if (!perfil) throw new NotFoundException('Profesional no disponible.');
    this.autorizacion.exigirSobreRecurso({ id: actor.id, rol: actor.rol,
      negocioId: actor.negocioId }, Permiso.GESTIONAR_HORARIO,
    { negocioId: perfil.negocioId, usuarioId: perfil.id });
    return perfil.negocioId;
  }

  async consultarSemana(actorId: number, personalId: number) {
    const negocioId = await this.negocioAutorizado(actorId, personalId);
    return this.horarios.consultarSemana(negocioId, personalId);
  }

  async consultarAtencion(actorId: number, personalId: number, desde: string, hasta: string) {
    const negocioId = await this.negocioAutorizado(actorId, personalId);
    return this.atencion.consultar(actorId, negocioId, personalId, desde, hasta);
  }

  async guardarSemana(actorId: number, personalId: number,
    franjas: EntradaSemana[], desde: string) {
    const negocioId = await this.negocioAutorizado(actorId, personalId);
    return this.horarios.guardarSemana(negocioId, personalId, franjas, desde);
  }

  async consultarExcepciones(actorId: number, personalId: number) {
    const negocioId = await this.negocioAutorizado(actorId, personalId);
    return this.horarios.consultarExcepciones(negocioId, personalId);
  }

  async guardarExcepcion(actorId: number, personalId: number, fecha: string,
    sucursalId: number, franjas: EntradaExcepcion[], desde: string) {
    const negocioId = await this.negocioAutorizado(actorId, personalId);
    return this.horarios.guardarExcepcion(negocioId, personalId, fecha,
      sucursalId, franjas, desde);
  }

  async retirarExcepcion(actorId: number, personalId: number, fecha: string,
    sucursalId: number, desde: string) {
    const negocioId = await this.negocioAutorizado(actorId, personalId);
    return this.horarios.retirarExcepcion(negocioId, personalId, fecha,
      sucursalId, desde);
  }
}
