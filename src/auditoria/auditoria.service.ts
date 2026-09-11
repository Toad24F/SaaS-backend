import { Injectable } from '@nestjs/common';
import type { DeepPartial, EntityManager } from 'typeorm';
import {
  EventoAuditoria,
  ValoresAuditoria,
} from './entities/evento-auditoria.entity';

export interface RegistrarAuditoria {
  operacionId: string;
  actorUsuarioId: number;
  negocioId: number | null;
  usuarioId: number | null;
  licenciaId: number | null;
  accion: string;
  valoresAntes: ValoresAuditoria | null;
  valoresDespues: ValoresAuditoria | null;
}

/** Guarda usando el manager del caso de uso para compartir commit o rollback. */
@Injectable()
export class AuditoriaService {
  async registrar(
    manager: EntityManager,
    datos: RegistrarAuditoria,
  ): Promise<EventoAuditoria> {
    const repositorio = manager.getRepository(EventoAuditoria);
    const evento = repositorio.create(datos as DeepPartial<EventoAuditoria>);
    return repositorio.save(evento);
  }
}
