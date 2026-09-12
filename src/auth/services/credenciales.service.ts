import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import { AuditoriaService } from '../../auditoria/auditoria.service';
import { CodigosService } from '../../codigos/codigos.service';
import { PropositoCodigoAcceso } from '../../codigos/entities/codigo-acceso.entity';
import { Usuario } from '../../usuarios/entities/usuario.entity';
import { Rol } from '../enums/rol.enum';
import { AutorizacionService } from './autorizacion.service';
import { PoliticaContrasenasService } from './politica-contrasenas.service';
import { SesionesService } from './sesiones.service';

/** Coordina recuperación y cambio sin alterar activación, cuenta o licencia. */
@Injectable()
export class CredencialesService {
  constructor(
    @InjectRepository(Usuario) private readonly usuarios: Repository<Usuario>,
    private readonly codigos: CodigosService,
    private readonly autorizacion: AutorizacionService,
    private readonly contrasenas: PoliticaContrasenasService,
    private readonly sesiones: SesionesService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async autorizarRecuperacion(datos: {
    actorUsuarioId: number; administradorId: number; ahora: Date;
  }) {
    return this.usuarios.manager.transaction(async (manager) => {
      const actor = await manager.getRepository(Usuario).findOneBy({ id: datos.actorUsuarioId });
      const destino = await manager.getRepository(Usuario).createQueryBuilder('usuario')
        .setLock('pessimistic_write').where('usuario.id = :id', { id: datos.administradorId }).getOne();
      if (!actor || !destino || destino.negocioId === null) throw new ForbiddenException('Acceso denegado.');
      this.autorizacion.exigirRecuperacionAdministrador(actor.rol, destino.rol);
      const codigo = await this.codigos.emitirInvalidandoAnterior(manager, {
        negocioId: destino.negocioId, usuarioId: destino.id,
        emisorUsuarioId: actor.id, proposito: PropositoCodigoAcceso.RECUPERACION,
        ahora: datos.ahora,
      });
      // La autorización se audita sin cambiar activo, activación ni licencia.
      await this.auditoria.registrar(manager, {
        operacionId: randomUUID(), actorUsuarioId: actor.id, negocioId: destino.negocioId,
        usuarioId: destino.id, licenciaId: null, accion: 'recuperacion_autorizada',
        valoresAntes: null, valoresDespues: { expiraEn: codigo.expiraEn.toISOString() },
      });
      return codigo;
    });
  }

  async recuperarContrasena(datos: { codigo: string; nuevaPassword: string; ahora: Date }): Promise<void> {
    const passwordHash = await this.contrasenas.generarHash(datos.nuevaPassword);
    await this.codigos.consumir(this.usuarios.manager.connection, {
      codigo: datos.codigo, proposito: PropositoCodigoAcceso.RECUPERACION, ahora: datos.ahora,
    }, async (manager, codigo) => {
      const usuario = await manager.getRepository(Usuario).findOneByOrFail({ id: codigo.usuarioId });
      if (usuario.rol !== Rol.ADMIN_NEGOCIO || usuario.activadoEn === null) {
        throw new BadRequestException('La cuenta no puede recuperar contraseña.');
      }
      await manager.getRepository(Usuario).update(usuario.id, { passwordHash });
      await this.sesiones.revocarTodasConManager(manager, usuario.id, datos.ahora);
    });
  }

  async cambiarContrasena(datos: {
    usuarioId: number; passwordActual: string; nuevaPassword: string; ahora: Date;
  }): Promise<void> {
    const passwordHash = await this.contrasenas.generarHash(datos.nuevaPassword);
    await this.usuarios.manager.transaction(async (manager) => {
      const usuario = await manager.getRepository(Usuario).createQueryBuilder('usuario')
        .addSelect('usuario.passwordHash').setLock('pessimistic_write')
        .where('usuario.id = :id', { id: datos.usuarioId }).getOne();
      if (!usuario?.passwordHash || !await this.contrasenas.comparar(datos.passwordActual, usuario.passwordHash)) {
        throw new BadRequestException('La contraseña actual no es válida.');
      }
      await manager.getRepository(Usuario).update(usuario.id, { passwordHash });
      // Todas las sesiones, incluida la actual, se invalidan con el cambio.
      await this.sesiones.revocarTodasConManager(manager, usuario.id, datos.ahora);
    });
  }
}
