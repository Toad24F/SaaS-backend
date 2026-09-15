import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import type { EntityManager } from 'typeorm';
import { IsNull, Repository } from 'typeorm';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { Sesion } from '../auth/entities/sesion.entity';
import { Rol } from '../auth/enums/rol.enum';
import { PoliticaContrasenasService } from '../auth/services/politica-contrasenas.service';
import { Usuario } from './entities/usuario.entity';

export interface CrearRecepcionista {
  actorUsuarioId: number;
  nombre: string;
  email: string;
  password: string;
  ahora: Date;
}

@Injectable()
export class UsuariosService {
  constructor(
    @InjectRepository(Usuario)
    private readonly usuarioRepository: Repository<Usuario>,
    private readonly contrasenas: PoliticaContrasenasService = new PoliticaContrasenasService(),
    private readonly auditoria: AuditoriaService = new AuditoriaService(),
  ) {}

  // Busca el usuario con los datos de su negocio para validar estado.
  async findByEmailWithNegocio(email: string): Promise<Usuario | null> {
    return this.usuarioRepository.findOne({
      where: { email },
      relations: { negocio: true },
    });
  }

  async findById(id: number): Promise<Usuario | null> {
    return this.usuarioRepository.findOne({
      where: { id },
      relations: { negocio: true },
    });
  }

  /** Consulta administrativa global: su ruta exige superadmin antes de invocarla. */
  async buscarAdministrador(usuarioId: number): Promise<Usuario> {
    const usuario = await this.usuarioRepository.findOneBy({ id: usuarioId, rol: Rol.ADMIN_NEGOCIO });
    if (!usuario) throw new NotFoundException('Administrador no disponible.');
    return usuario;
  }

  /** Lista exclusivamente cuentas de recepción pertenecientes al tenant recibido. */
  listarRecepcionistas(negocioId: number): Promise<Usuario[]> {
    return this.usuarioRepository.find({
      where: { negocioId, rol: Rol.RECEPCIONISTA },
      order: { id: 'ASC' },
    });
  }

  async buscarRecepcionista(negocioId: number, usuarioId: number): Promise<Usuario> {
    const usuario = await this.usuarioRepository.findOneBy({
      id: usuarioId,
      negocioId,
      rol: Rol.RECEPCIONISTA,
    });
    if (!usuario) throw new NotFoundException('Usuario no disponible.');
    return usuario;
  }

  /**
   * Crea una cuenta completa. El actor persistido decide negocio y rol; el cliente
   * nunca puede asignarlos. Cuenta y auditoría comparten la misma transacción.
   */
  async crearRecepcionista(datos: CrearRecepcionista): Promise<Usuario> {
    const nombre = datos.nombre.trim().replace(/\s+/g, ' ');
    const email = datos.email.trim().toLowerCase();
    if (!nombre || !email) {
      throw new BadRequestException('Nombre y correo son obligatorios.');
    }
    const passwordHash = await this.contrasenas.generarHash(datos.password);

    try {
      return await this.usuarioRepository.manager.transaction(async (manager) => {
        const actor = await this.buscarActorAdministrador(manager, datos.actorUsuarioId);
        const repositorio = manager.getRepository(Usuario);
        const recepcionista = await repositorio.save(repositorio.create({
          negocioId: actor.negocioId,
          nombre,
          email,
          passwordHash,
          rol: Rol.RECEPCIONISTA,
          activo: true,
          activadoEn: new Date(datos.ahora),
        }));

        // La evidencia excluye deliberadamente contraseña y hash.
        await this.auditoria.registrar(manager, {
          operacionId: randomUUID(),
          actorUsuarioId: actor.id,
          negocioId: actor.negocioId,
          usuarioId: recepcionista.id,
          licenciaId: null,
          accion: 'recepcionista_creado',
          valoresAntes: null,
          valoresDespues: {
            nombre,
            email,
            rol: Rol.RECEPCIONISTA,
            activo: true,
            activadoEn: datos.ahora.toISOString(),
          },
        });
        return recepcionista;
      });
    } catch (error) {
      const codigo = (error as { driverError?: { code?: string } }).driverError?.code
        ?? (error as { code?: string }).code;
      if (codigo === 'ER_DUP_ENTRY') {
        throw new ConflictException('El correo ya está registrado.');
      }
      throw error;
    }
  }

  async desactivarRecepcionista(
    actorId: number,
    usuarioId: number,
    ahora = new Date(),
  ): Promise<void> {
    await this.cambiarAccesoRecepcionista(actorId, usuarioId, false, ahora);
  }

  async reactivarRecepcionista(
    actorId: number,
    usuarioId: number,
    ahora = new Date(),
  ): Promise<void> {
    await this.cambiarAccesoRecepcionista(actorId, usuarioId, true, ahora);
  }

  /**
   * Serializa la transición sobre la fila destino. Los retornos idempotentes no
   * escriben auditoría; al desactivar, sesiones, cuenta y evento confirman juntos.
   */
  private async cambiarAccesoRecepcionista(
    actorId: number,
    usuarioId: number,
    activo: boolean,
    ahora: Date,
  ): Promise<void> {
    await this.usuarioRepository.manager.transaction(async (manager) => {
      const actor = await this.buscarActorAdministrador(manager, actorId);
      const destino = await manager.getRepository(Usuario).createQueryBuilder('usuario')
        .setLock('pessimistic_write')
        .where(
          'usuario.id = :usuarioId AND usuario.negocioId = :negocioId AND usuario.rol = :rol',
          { usuarioId, negocioId: actor.negocioId, rol: Rol.RECEPCIONISTA },
        )
        .getOne();
      if (!destino) throw new NotFoundException('Usuario no disponible.');
      this.exigirRecepcionistaCompleto(destino);
      if (destino.activo === activo) return;

      await manager.getRepository(Usuario).update(destino.id, { activo });
      if (!activo) {
        await manager.getRepository(Sesion).update(
          { usuarioId: destino.id, revocadaEn: IsNull() },
          { revocadaEn: new Date(ahora) },
        );
      }
      await this.auditoria.registrar(manager, {
        operacionId: randomUUID(),
        actorUsuarioId: actor.id,
        negocioId: actor.negocioId,
        usuarioId: destino.id,
        licenciaId: null,
        accion: activo ? 'recepcionista_reactivado' : 'recepcionista_desactivado',
        valoresAntes: { activo: destino.activo },
        valoresDespues: { activo },
      });
    });
  }

  /** Revalida rol y pertenencia desde la base antes de autorizar una mutación. */
  private async buscarActorAdministrador(manager: EntityManager, actorId: number): Promise<Usuario> {
    const actor = await manager.getRepository(Usuario).createQueryBuilder('actor')
      .setLock('pessimistic_read')
      .where('actor.id = :actorId', { actorId })
      .getOne();
    if (!actor || actor.rol !== Rol.ADMIN_NEGOCIO || actor.negocioId === null) {
      throw new ForbiddenException('Acceso denegado.');
    }
    return actor;
  }

  /** Impide que datos históricos pendientes entren al flujo de acceso vigente. */
  private exigirRecepcionistaCompleto(usuario: Usuario): void {
    if (!usuario.nombre?.trim() || !usuario.passwordHash || usuario.activadoEn === null) {
      throw new ConflictException('La cuenta de recepción está incompleta.');
    }
  }
}
