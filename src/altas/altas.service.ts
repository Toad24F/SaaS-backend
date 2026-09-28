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
import { isEmail } from 'class-validator';
import { AltaAdministrador, EstadoAltaAdministrador } from './entities/alta-administrador.entity';
import { ReservaCorreoService } from './reserva-correo.service';
import { BandejaCorreoService } from '../correos/bandeja-correo.service';
import { CodigoAcceso } from '../codigos/entities/codigo-acceso.entity';
import { EstadoEnvioCorreo } from '../correos/entities/envio-correo.entity';

export interface CrearNegocio {
  actorUsuarioId: number;
  nombre: string;
  identificadorPublico: string;
  emailAdministrador: string;
  rfc: string;
  limiteSucursales?: number;
  ahora: Date;
}

export interface AltaNegocioCreada {
  negocioId: number;
  altaAdministradorId: number;
  licenciaId: number;
  envioId: string;
  estadoEnvio: EstadoEnvioCorreo;
  expiraEn: Date;
}

/** Confirma la invitación y su entrega pendiente sin crear cuentas incompletas. */
@Injectable()
export class AltasService {
  constructor(
    @InjectRepository(Negocio)
    private readonly negocios: Repository<Negocio>,
    private readonly autorizacion: AutorizacionService,
    private readonly codigos: CodigosService,
    private readonly auditoria: AuditoriaService,
    private readonly reservaCorreo: ReservaCorreoService,
    private readonly bandejaCorreo: BandejaCorreoService,
  ) { }

  async crearNegocio(datos: CrearNegocio): Promise<AltaNegocioCreada> {
    // Valida también llamadas internas: no depende exclusivamente de los DTO HTTP.
    const nombre = typeof datos.nombre === 'string' ? datos.nombre.trim() : '';
    const slug = typeof datos.identificadorPublico === 'string' ? datos.identificadorPublico.trim().toLowerCase() : '';
    const email = typeof datos.emailAdministrador === 'string' ? datos.emailAdministrador.trim().toLowerCase() : '';
    const rfc = typeof datos.rfc === 'string' ? datos.rfc.trim().toUpperCase() : '';
    const limiteSucursales = datos.limiteSucursales === undefined ? 1 : datos.limiteSucursales;
    if (!nombre || nombre.length > 150 || !slug || slug.length > 100 ||
      !isEmail(email) || email.length > 150 || !rfc || rfc.length > 13 ||
      !Number.isInteger(limiteSucursales) || limiteSucursales < 1 || limiteSucursales > 4294967295 ||
      !(datos.ahora instanceof Date) || !Number.isFinite(datos.ahora.getTime())) {
      throw new BadRequestException('Identidad del negocio, correo, RFC, cupo o fecha inválidos.');
    }

    try {
      return await this.negocios.manager.transaction(async (manager) => {
        // El rol se obtiene del estado actual: el cliente no puede declararse superadmin.
        const actor = await manager.getRepository(Usuario)
          .createQueryBuilder('usuario')
          .setLock('pessimistic_read')
          .where('usuario.id = :id', { id: datos.actorUsuarioId })
          .getOne();
        if (!actor || !actor.activo || actor.activadoEn === null) throw new ForbiddenException('Acceso denegado.');
        this.autorizacion.exigir(actor.rol, Permiso.CREAR_NEGOCIO);

        const negocio = await manager.getRepository(Negocio).save(
          manager.getRepository(Negocio).create({
            nombre,
            slug,
            rfc,
            correoAdministrador: email,
            limiteSucursalesActivas: limiteSucursales,
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
        // La invitación es el destinatario inicial. La cuenta se creará al activar (T037).
        const alta = await manager.getRepository(AltaAdministrador).save(
          manager.getRepository(AltaAdministrador).create({
            negocioId: negocio.id,
            correo: email,
            correoVersion: 1,
            estado: EstadoAltaAdministrador.PENDIENTE,
            usuarioCreadoId: null,
            activadoEn: null,
          }),
        );
        // Reserva, emisión y bandeja usan el mismo manager: cualquier fallo revierte el conjunto.
        await this.reservaCorreo.reservarAlta(manager, {
          altaId: alta.id, negocioId: negocio.id, correo: email,
        });
        const codigo = await this.codigos.emitir(manager, {
          negocioId: negocio.id,
          altaAdministradorId: alta.id,
          emisorUsuarioId: actor.id,
          proposito: PropositoCodigoAcceso.ACTIVACION_ADMIN,
          ahora: datos.ahora,
        });
        // Obtiene la referencia persistida por su invitación exclusiva, sin exponer el valor.
        const referencia = await manager.getRepository(CodigoAcceso).findOneByOrFail({
          negocioId: negocio.id, altaAdministradorId: alta.id,
        });
        const envio = await this.bandejaCorreo.encolarCodigo(manager, {
          negocioId: negocio.id, codigoAccesoId: referencia.id, ahora: datos.ahora,
        });

        // Registra IDs y estado, nunca el código utilizable ni su hash.
        await this.auditoria.registrar(manager, {
          operacionId: randomUUID(),
          actorUsuarioId: actor.id,
          negocioId: negocio.id,
          usuarioId: null,
          altaAdministradorId: alta.id,
          licenciaId: licencia.id,
          accion: 'negocio_creado',
          valoresAntes: null,
          valoresDespues: {
            nombre: negocio.nombre,
            identificadorPublico: negocio.slug,
            licenciaAnualHabilitada: false,
            administradorActivado: false,
            limiteSucursales,
          },
        });

        return {
          negocioId: negocio.id,
          altaAdministradorId: alta.id,
          licenciaId: licencia.id,
          envioId: envio.id,
          estadoEnvio: envio.estado,
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
        legadoFase1: true,
      });
    });
  }
}
