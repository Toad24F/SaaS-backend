import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
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
import { PoliticaAccesoLicenciaService } from '../licencias/services/politica-acceso-licencia.service';
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

export interface InvitarRecepcionista {
  actorUsuarioId: number;
  emailRecepcionista: string;
  ahora: Date;
}

export interface InvitacionRecepcionistaCreada {
  usuarioId: number;
  negocioId: number;
  codigo: string;
  expiraEn: Date;
}

/** Coordina el alta completa; ninguna entidad se confirma por separado. */
@Injectable()
export class AltasService {
  constructor(
    @InjectRepository(Negocio)
    private readonly negocios: Repository<Negocio>,
    private readonly autorizacion: AutorizacionService,
    private readonly codigos: CodigosService,
    private readonly auditoria: AuditoriaService,
    private readonly politicaLicencia: PoliticaAccesoLicenciaService,
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

  async invitarRecepcionista(
    datos: InvitarRecepcionista,
  ): Promise<InvitacionRecepcionistaCreada> {
    const email = datos.emailRecepcionista.trim().toLowerCase();
    if (!email) throw new BadRequestException('El correo es obligatorio.');

    try {
      return await this.negocios.manager.transaction(async (manager) => {
        const actor = await manager.getRepository(Usuario)
          .createQueryBuilder('usuario')
          .setLock('pessimistic_read')
          .where('usuario.id = :id', { id: datos.actorUsuarioId })
          .getOne();
        if (!actor || actor.negocioId === null) {
          throw new ForbiddenException('Acceso denegado.');
        }

        // El tenant sale de la cuenta persistida; cualquier negocio enviado se ignora.
        this.autorizacion.exigirNegocioPropio(
          actor.rol,
          actor.negocioId,
          actor.negocioId,
        );
        const [negocio, licencia] = await Promise.all([
          manager.getRepository(Negocio).findOneByOrFail({ id: actor.negocioId }),
          manager.getRepository(Licencia).findOneByOrFail({ negocioId: actor.negocioId }),
        ]);
        const acceso = this.politicaLicencia.evaluarAccesoUsuario({
          cuentaActiva: actor.activo,
          cuentaActivada: actor.activadoEn !== null,
          negocioActivado: negocio.activadoEn !== null,
          licencia,
          ahora: datos.ahora,
        });
        if (!acceso.permitido) {
          throw new ForbiddenException('Acceso denegado por el estado de la cuenta o licencia.');
        }

        // Reservar primero el correo garantiza unicidad global antes de emitir el código.
        const recepcionista = await manager.getRepository(Usuario).save(
          manager.getRepository(Usuario).create({
            negocioId: actor.negocioId,
            nombre: null,
            email,
            passwordHash: null,
            rol: Rol.RECEPCIONISTA,
            activo: true,
            activadoEn: null,
          }),
        );
        const codigo = await this.codigos.emitir(manager, {
          negocioId: actor.negocioId,
          usuarioId: recepcionista.id,
          emisorUsuarioId: actor.id,
          proposito: PropositoCodigoAcceso.ACTIVACION_RECEPCIONISTA,
          ahora: datos.ahora,
        });
        return {
          usuarioId: recepcionista.id,
          negocioId: actor.negocioId,
          codigo: codigo.codigo,
          expiraEn: codigo.expiraEn,
        };
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
}
