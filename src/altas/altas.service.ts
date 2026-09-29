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
import type { EntityManager } from 'typeorm';
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
import { EnvioCorreo, EstadoEnvioCorreo } from '../correos/entities/envio-correo.entity';
import { transaccionIdentidad } from '../comun/transaccion-identidad';

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
  async reemitirCodigoInicial(datos: { actorUsuarioId: number; negocioId: number; ahora: Date; soloInvitacion?: boolean }) {
    return transaccionIdentidad(this.negocios.manager, async (manager) => {
      await this.autorizarGestion(manager, datos);
      const alta = await this.bloquearInvitacion(manager, datos.negocioId);
      if (alta) {
        if (alta.estado !== EstadoAltaAdministrador.PENDIENTE) throw new ConflictException('La invitación ya fue activada.');
        // Reemisión conserva el destinatario y su versión; únicamente renueva el código.
        return this.reemplazarInvitacion(manager, alta, datos);
      }
      // Compatibilidad con registros históricos: nunca crea una cuenta pendiente nueva.
      if (datos.soloInvitacion) throw new ConflictException('Invitación no disponible.');
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

  /// Reemplaza el correo del destinatario inicial sin activar ni crear cuentas.
  async corregirCorreoInicial(datos: { actorUsuarioId: number; negocioId: number; ahora: Date; nuevoCorreo: string }) {
    const correo = typeof datos.nuevoCorreo === 'string' ? datos.nuevoCorreo.trim().toLowerCase() : '';//normaliza el correo a minúsculas y sin espacios
    if (!isEmail(correo) || correo.length > 150) throw new BadRequestException('El correo no es válido.');//verifica que el correo sea válido y no exceda los 150 caracteres
    return transaccionIdentidad(this.negocios.manager, async (manager) => {//Reintenta conflictos sin conservar escrituras parciales.
      await this.autorizarGestion(manager, datos);
      const alta = await this.bloquearInvitacion(manager, datos.negocioId);
      if (!alta) throw new NotFoundException('Invitación no disponible.');
      if (alta.estado !== EstadoAltaAdministrador.PENDIENTE) throw new ConflictException('La invitación ya fue activada.');
      // Mismo correo normalizado es una operación sin cambios, códigos ni auditorías nuevas.
      if (alta.correo === correo) return this.estadoInvitacion(manager, alta);
      const anteriorVersion = alta.correoVersion;
      await this.reservaCorreo.corregirAlta(manager, {
        altaId: alta.id, negocioId: alta.negocioId, nuevoCorreo: correo,
      });
      alta.correo = correo;
      alta.correoVersion += 1;
      const resultado = await this.reemplazarInvitacion(manager, alta, datos);
      await this.auditoria.registrar(manager, {//registra la corrección del correo en la auditoría, incluyendo los valores antes y después de la operación
        operacionId: randomUUID(), actorUsuarioId: datos.actorUsuarioId, negocioId: alta.negocioId,
        usuarioId: null, licenciaId: null, altaAdministradorId: alta.id,
        accion: 'destinatario_corregido', valoresAntes: { versionDestinatario: anteriorVersion },
        valoresDespues: { versionDestinatario: alta.correoVersion },
      });
      return resultado;
    });
  }

  private async autorizarGestion(manager: EntityManager, datos: { actorUsuarioId: number; negocioId: number; ahora: Date }) {
    if (!(datos.ahora instanceof Date) || !Number.isFinite(datos.ahora.getTime())) throw new BadRequestException('Fecha inválida.');
    const actor = await manager.getRepository(Usuario).createQueryBuilder('actor').setLock('pessimistic_read')
      .where('actor.id = :id', { id: datos.actorUsuarioId }).getOne();
    if (!actor || !actor.activo || actor.activadoEn === null || actor.rol !== Rol.SUPERADMIN) throw new ForbiddenException('Acceso denegado.');
    if (!await manager.getRepository(Negocio).findOneBy({ id: datos.negocioId })) throw new NotFoundException('Negocio no encontrado.');
  }//verifica que el actor sea un superadministrador activo y que el negocio exista antes de permitir la acción

  private bloquearInvitacion(manager: EntityManager, negocioId: number) {
    // Todas las transiciones de la invitación toman este bloqueo antes del código.
    return manager.getRepository(AltaAdministrador).createQueryBuilder('alta').setLock('pessimistic_write')
      .where('alta.negocioId = :negocioId', { negocioId }).getOne();
  }//bloquea la invitación del administrador para el negocio especificado, evitando cambios concurrentes mientras se procesa la invitación

  private async reemplazarInvitacion(manager: EntityManager, alta: AltaAdministrador,
    datos: { actorUsuarioId: number; ahora: Date }) {//reemite un nuevo código de acceso para la invitación del administrador, invalidando cualquier código anterior y encolando el envío de correo correspondiente
    const emitido = await this.codigos.emitirInvalidandoAnterior(manager, {
      negocioId: alta.negocioId, altaAdministradorId: alta.id, emisorUsuarioId: datos.actorUsuarioId,
      proposito: PropositoCodigoAcceso.ACTIVACION_ADMIN, ahora: datos.ahora,
    });
    const referencias = await manager.getRepository(CodigoAcceso).find({
      where: { negocioId: alta.negocioId, altaAdministradorId: alta.id }, order: { id: 'DESC' },
    });
    const nuevo = referencias[0];
    const anteriores = referencias.slice(1).map((codigo) => codigo.id);
    if (anteriores.length) {
      // Descarta trabajos pendientes, fallidos o tomados y revoca su token de lease.
      // Un correo ya enviado conserva su evidencia; el código sustituido deja de servir.
      await manager.getRepository(EnvioCorreo).createQueryBuilder().update().set({
        estado: EstadoEnvioCorreo.DESCARTADO, arrendamientoId: null, arrendadoHasta: null,
        ultimoError: 'Código o destinatario sustituido.',
      }).where('negocio_id = :id', { id: alta.negocioId })
        .andWhere('codigo_acceso_id IN (:...anteriores)', { anteriores })
        .andWhere('estado IN (:...estados)', { estados: ['pendiente', 'fallido', 'tomado'] }).execute();
    }
    const envio = await this.bandejaCorreo.encolarCodigo(manager, {
      negocioId: alta.negocioId, codigoAccesoId: nuevo.id, ahora: datos.ahora,
    });
    return {
      negocioId: alta.negocioId, altaAdministradorId: alta.id,
      envioId: envio.id, estadoEnvio: envio.estado, expiraEn: emitido.expiraEn
    };
  }

  private async estadoInvitacion(manager: EntityManager, alta: AltaAdministrador) {//devuelve el estado actual de la invitación del administrador, incluyendo el envío de correo y la expiración del código de acceso
    const codigo = await manager.getRepository(CodigoAcceso).findOne({
      where: { negocioId: alta.negocioId, altaAdministradorId: alta.id }, order: { id: 'DESC' },
    });
    if (!codigo) throw new ConflictException('No existe una emisión para la invitación.');
    const envio = await manager.getRepository(EnvioCorreo).findOneByOrFail({ negocioId: alta.negocioId, codigoAccesoId: codigo.id });
    return {
      negocioId: alta.negocioId, altaAdministradorId: alta.id,
      envioId: envio.id, estadoEnvio: envio.estado, expiraEn: codigo.expiraEn
    };
  }
}
