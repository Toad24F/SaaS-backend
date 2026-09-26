import { Injectable } from '@nestjs/common';
import { BadRequestException } from '@nestjs/common';
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
  altaAdministradorId?: number | null;
  recursoTipo?: string | null;
  recursoId?: number | null;
  accion: string;
  valoresAntes: ValoresAuditoria | null;
  valoresDespues: ValoresAuditoria | null;
}

const CLAVE_SECRETA = /password|contrasena|contraseña|codigo|token|secret|hash|credencial/i;

function validarSinSecretos(valor: unknown, vistos = new Set<object>()): void {
  if (!valor || typeof valor !== 'object') return;
  if (vistos.has(valor)) throw new BadRequestException('Valores de auditoría cíclicos.');
  vistos.add(valor);
  // Recorre también arreglos y objetos anidados antes de escribir el evento.
  for (const [clave, contenido] of Object.entries(valor)) {
    if (CLAVE_SECRETA.test(clave)) {
      throw new BadRequestException('La auditoría no admite secretos.');
    }
    validarSinSecretos(contenido, vistos);
  }
  vistos.delete(valor);
}

/** Guarda usando el manager del caso de uso para compartir commit o rollback. */
@Injectable()
export class AuditoriaService {
  async registrar(
    manager: EntityManager,
    datos: RegistrarAuditoria,
  ): Promise<EventoAuditoria> {
    validarSinSecretos(datos.valoresAntes);
    validarSinSecretos(datos.valoresDespues);
    const repositorio = manager.getRepository(EventoAuditoria);
    const evento = repositorio.create(datos as DeepPartial<EventoAuditoria>);
    return repositorio.save(evento);
  }
}
