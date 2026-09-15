import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { Rol } from '../auth/enums/rol.enum';
import { AutorizacionService, Permiso } from '../auth/services/autorizacion.service';
import { CodigosService } from '../codigos/codigos.service';
import { PropositoCodigoAcceso } from '../codigos/entities/codigo-acceso.entity';
import { Licencia } from '../licencias/entities/licencia.entity';
import { Negocio } from '../negocios/entities/negocio.entity';
import { Usuario } from '../usuarios/entities/usuario.entity';

export interface CrearNegocio {
  actorUsuarioId: number;
  nombre: string;
  identificadorPublico: string;
  emailAdministrador: string;
  ahora: Date;
}

export interface AltaNegocioCreada {
  negocioId: number;
  administradorId: number;
  licenciaId: number;
  codigo: string;
  expiraEn: Date;
}

/** Coordina el alta del negocio; recepción ya no reserva cuentas por código. */
@Injectable()
export class AltasService {
  constructor(
    @InjectRepository(Negocio)
    private readonly negocios: Repository<Negocio>,
    private readonly autorizacion: AutorizacionService,
    private readonly codigos: CodigosService,
    private readonly auditoria: AuditoriaService,
  ) { }

  async crearNegocio(datos: CrearNegocio): Promise<AltaNegocioCreada> {
    const nombre = datos.nombre.trim();
    const slug = datos.identificadorPublico.trim().toLowerCase();
    const email = datos.emailAdministrador.trim().toLowerCase();
    if (!nombre || !slug || !email) {
      throw new BadRequestException('Nombre, identificador y correo son obligatorios.');
    }

    try {
      return await this.negocios.manager.transaction(async (manager) => {
        // El rol se obtiene del estado actual: el cliente no puede declararse superadmin.
        const actor = await manager.getRepository(Usuario)
          .createQueryBuilder('usuario')
          .setLock('pessimistic_read')
          .where('usuario.id = :id', { id: datos.actorUsuarioId })
          .getOne();
        if (!actor) throw new ForbiddenException('Acceso denegado.');
        this.autorizacion.exigir(actor.rol, Permiso.CREAR_NEGOCIO);

        const negocio = await manager.getRepository(Negocio).save(
          manager.getRepository(Negocio).create({
            nombre,
            slug,
            // El correo inicial del administrador funciona también como contacto.
            emailContacto: email,
            telefonoContacto: null,
            activadoEn: null,
          }),
        );
        const licencia = await manager.getRepository(Licencia).save(
          manager.getRepository(Licencia).create({
            negocioId: negocio.id,
            habilitadaEn: null,
            venceEn: null,
            suspendidaEn: null,
          }),
        );
        const administrador = await manager.getRepository(Usuario).save(
          manager.getRepository(Usuario).create({
            negocioId: negocio.id,
            nombre: null,
            email,
            passwordHash: null,
            rol: Rol.ADMIN_NEGOCIO,
            activo: true,
            activadoEn: null,
          }),
        );
        const codigo = await this.codigos.emitir(manager, {
          negocioId: negocio.id,
          usuarioId: administrador.id,
          emisorUsuarioId: actor.id,
          proposito: PropositoCodigoAcceso.ACTIVACION_ADMIN,
          ahora: datos.ahora,
        });

        // Registra IDs y estado, nunca el código utilizable ni su hash.
        await this.auditoria.registrar(manager, {
          operacionId: randomUUID(),
          actorUsuarioId: actor.id,
          negocioId: negocio.id,
          usuarioId: administrador.id,
          licenciaId: licencia.id,
          accion: 'negocio_creado',
          valoresAntes: null,
          valoresDespues: {
            nombre: negocio.nombre,
            identificadorPublico: negocio.slug,
            licenciaAnualHabilitada: false,
            administradorActivado: false,
          },
        });

        return {
          negocioId: negocio.id,
          administradorId: administrador.id,
          licenciaId: licencia.id,
          codigo: codigo.codigo,
          expiraEn: codigo.expiraEn,
        };
      });
    } catch (error) {
      const codigo = (error as { driverError?: { code?: string } }).driverError?.code
        ?? (error as { code?: string }).code;
      if (codigo === 'ER_DUP_ENTRY') {
        throw new ConflictException('El identificador o correo ya está registrado.');
      }
      throw error;
    }
  }

  /** Revalida emisor y destinatario bajo bloqueo sin activar ni modificar la licencia. */
  async reemitirCodigoInicial(datos: { actorUsuarioId: number; negocioId: number; ahora: Date }) {
    return this.negocios.manager.transaction(async (manager) => {
      const actor = await manager.getRepository(Usuario).createQueryBuilder('actor')
        .setLock('pessimistic_read').where('actor.id = :id', { id: datos.actorUsuarioId }).getOne();
      if (!actor || actor.rol !== Rol.SUPERADMIN) throw new ForbiddenException('Acceso denegado.');
      // La cuenta se obtiene por negocio y rol; se bloquea antes de reemplazar su código.
      const administrador = await manager.getRepository(Usuario).createQueryBuilder('usuario')
        .setLock('pessimistic_write')
        .where('usuario.negocioId = :negocioId AND usuario.rol = :rol', {
          negocioId: datos.negocioId, rol: Rol.ADMIN_NEGOCIO,
        }).getOne();
      if (!administrador) throw new NotFoundException('Administrador no disponible.');
      return this.codigos.reemplazarConManager(manager, {
        negocioId: datos.negocioId, usuarioId: administrador.id, emisorUsuarioId: actor.id,
        proposito: PropositoCodigoAcceso.ACTIVACION_ADMIN, ahora: datos.ahora,
      });
    });
  }
}
