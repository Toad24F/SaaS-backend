import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { Rol } from '../auth/enums/rol.enum';
import { PoliticaContrasenasService } from '../auth/services/politica-contrasenas.service';
import { CodigosService } from '../codigos/codigos.service';
import { PropositoCodigoAcceso } from '../codigos/entities/codigo-acceso.entity';
import { Licencia } from '../licencias/entities/licencia.entity';
import { CalendarioLicenciasService } from '../licencias/services/calendario-licencias.service';
import { PoliticaAccesoLicenciaService } from '../licencias/services/politica-acceso-licencia.service';
import { Negocio } from '../negocios/entities/negocio.entity';
import { Usuario } from '../usuarios/entities/usuario.entity';
import {
  AltaAdministrador,
  EstadoAltaAdministrador,
} from './entities/alta-administrador.entity';
import { ReservaCorreoService } from './reserva-correo.service';

export interface ActivarCuenta {
  codigo: string;
  correo?: string;
  nombre: string;
  password: string;
  ahora: Date;
}

/** Solo el primer administrador se activa por código y habilita la licencia. */
@Injectable()
export class ActivacionesService {
  constructor(
    @InjectRepository(Usuario) private readonly usuarios: Repository<Usuario>,
    private readonly codigos: CodigosService,
    private readonly contrasenas: PoliticaContrasenasService,
    private readonly politicaLicencia: PoliticaAccesoLicenciaService,
    private readonly calendario: CalendarioLicenciasService,
    private readonly auditoria: AuditoriaService,
    private readonly reservaCorreo: ReservaCorreoService = new ReservaCorreoService(),
  ) {}

  async activarAdministrador(datos: ActivarCuenta) {
    const { nombre, passwordHash } = await this.prepararCredenciales(datos);
    return this.codigos.consumir(
      this.usuarios.manager.connection,
      {
        //Cuenta, reserva y consumo comparten la transacción.
        codigo: datos.codigo,
        correo: datos.correo,
        proposito: PropositoCodigoAcceso.ACTIVACION_ADMIN,
        ahora: datos.ahora,
      },
      async (manager, codigo) => {
        // La pertenencia se toma exclusivamente del código persistido.
        if (codigo.altaAdministradorId !== null) {
          // Consumir ya bloqueó invitación y código y validó correo, versión y vigencia.
          // Se crean credenciales completas, se transfiere la reserva y se inicia el año
          // en ese mismo manager: incluso el consumo posterior se revierte ante un fallo.
          const alta = await manager
            .getRepository(AltaAdministrador)
            .findOneByOrFail({
              id: codigo.altaAdministradorId,
              negocioId: codigo.negocioId,
            });
          const licencia = await manager
            .getRepository(Licencia)
            .createQueryBuilder('licencia')
            .setLock('pessimistic_write')
            .where('licencia.negocioId = :id', { id: codigo.negocioId })
            .getOneOrFail();
          const negocio = await manager
            .getRepository(Negocio)
            .createQueryBuilder('negocio')
            .setLock('pessimistic_write')
            .where('negocio.id = :id', { id: codigo.negocioId })
            .getOneOrFail();
          //bloquea el negocio y la licencia para que no se puedan modificar mientras se activa el administrador
          if (
            alta.estado !== EstadoAltaAdministrador.PENDIENTE ||
            negocio.activadoEn !== null ||
            !this.politicaLicencia.puedeActivarAdministrador(
              licencia,
              datos.ahora,
            )
          ) {
            throw new BadRequestException('La cuenta no puede activarse.');
          } //verifica que el alta este pendiente, que el negocio no este activado y que la licencia pueda activar un administrador
          const usuario = await manager.getRepository(Usuario).save(
            manager.getRepository(Usuario).create({
              negocioId: codigo.negocioId,
              nombre,
              email: alta.correo,
              passwordHash,
              rol: Rol.ADMIN_NEGOCIO,
              activo: true,
              activadoEn: new Date(datos.ahora),
              creadoEn: new Date(datos.ahora),
              correoVersion: alta.correoVersion,
            }),
          ); //crea un nuevo usuario con el correo del alta, el nombre y la contraseña proporcionados, y lo activa como administrador del negocio
          await this.reservaCorreo.transferirAUsuario(manager, {
            altaId: alta.id,
            negocioId: codigo.negocioId,
            usuarioId: usuario.id,
          });
          const venceEn = this.calendario.sumarAnios(datos.ahora);
          await manager.getRepository(AltaAdministrador).update(alta.id, {
            estado: EstadoAltaAdministrador.ACTIVADA,
            usuarioCreadoId: usuario.id,
            activadoEn: new Date(datos.ahora),
          }); //actualiza el alta para marcarlo como activado, asignarle el id del usuario creado y la fecha de activacion
          await manager
            .getRepository(Negocio)
            .update(negocio.id, { activadoEn: new Date(datos.ahora) });
          // La activación inicia el primer vencimiento y establece su versión persistida.
          await manager.getRepository(Licencia).update(licencia.id, {
            habilitadaEn: new Date(datos.ahora),
            venceEn,
            versionVencimiento: (licencia.versionVencimiento ?? 0) + 1,
          });
          await this.auditoria.registrar(manager, {
            //registra la auditoria de la activacion del administrador
            operacionId: randomUUID(),
            actorUsuarioId: usuario.id,
            negocioId: codigo.negocioId,
            usuarioId: usuario.id,
            altaAdministradorId: alta.id,
            licenciaId: licencia.id,
            accion: 'administrador_activado',
            valoresAntes: { activadoEn: null },
            valoresDespues: {
              activadoEn: datos.ahora.toISOString(),
              venceEn: venceEn.toISOString(),
            },
          });
          return {
            id: usuario.id,
            negocioId: usuario.negocioId,
            nombre: usuario.nombre,
            email: usuario.email,
            rol: usuario.rol,
            activo: usuario.activo,
            activadoEn: usuario.activadoEn,
          };
        }
        // Este controlador histórico solo procesa códigos ligados a cuenta.
        if (codigo.usuarioId === null)
          throw new BadRequestException('Código inválido o no disponible.');
        const usuario = await manager
          .getRepository(Usuario)
          .findOneByOrFail({ id: codigo.usuarioId }); //busca el usuario con el id de usuario si no lo encuentra lanza un error
        if (
          datos.correo !== undefined &&
          datos.correo.trim().toLowerCase() !== usuario.email
        ) {
          throw new BadRequestException('Código inválido o no disponible.');
        }
        const licencia = await manager
          .getRepository(Licencia)
          .createQueryBuilder('licencia') //consulta la licencia del negocio con el id de negocio del codigo, si no lo encuentra lanza un error
          .setLock('pessimistic_write') //bloquea el registro de licencia para que no se pueda modificar mientras se consume el codigo
          .where('licencia.negocioId = :negocioId', {
            negocioId: codigo.negocioId,
          })
          .getOneOrFail();
        if (
          usuario.rol !== Rol.ADMIN_NEGOCIO || //verifica que el rol del usuario sea admin_negocio
          usuario.activadoEn !== null || //verifica que el usuario no este activado
          !this.politicaLicencia.puedeActivarAdministrador(
            licencia,
            datos.ahora,
          ) //verifica que la licencia pueda activar un administrador|
        ) {
          throw new BadRequestException('La cuenta no puede activarse.');
        }

        const venceEn = this.calendario.sumarAnios(datos.ahora); //calcula la fecha de vencimiento de la licencia sumando un año a la fecha actual
        // Cuenta, negocio y primer año cambian juntos o se revierten juntos.
        await manager.getRepository(Usuario).update(usuario.id, {
          //actualiza el usuario con el nombre, hash de la contraseña y la fecha de activacion
          nombre,
          passwordHash,
          activadoEn: new Date(datos.ahora),
          creadoEn: new Date(datos.ahora),
        });
        await manager.getRepository(Negocio).update(codigo.negocioId, {
          //actualiza el negocio con la fecha de activacion
          activadoEn: new Date(datos.ahora),
        });
        await manager.getRepository(Licencia).update(licencia.id, {
          //actualiza la licencia con la fecha de habilitacion y la fecha de vencimiento
          // La versión cambia junto con la fecha para invalidar cualquier vista temporal previa.
          habilitadaEn: new Date(datos.ahora),
          venceEn,
          versionVencimiento: (licencia.versionVencimiento ?? 0) + 1,
        });
        await this.auditoria.registrar(manager, {
          //registra la auditoria de la activacion del administrador
          operacionId: randomUUID(),
          actorUsuarioId: usuario.id,
          negocioId: codigo.negocioId,
          usuarioId: usuario.id,
          licenciaId: licencia.id,
          accion: 'administrador_activado',
          valoresAntes: { activadoEn: null },
          valoresDespues: {
            activadoEn: datos.ahora.toISOString(),
            venceEn: venceEn.toISOString(),
          },
        });
        return {
          id: usuario.id,
          negocioId: usuario.negocioId,
          nombre,
          email: usuario.email,
          rol: usuario.rol,
          activo: usuario.activo,
          activadoEn: new Date(datos.ahora),
        };
      },
    );
  }

  private async prepararCredenciales(datos: ActivarCuenta) {
    //prepara el nombre y el hash de la contraseña del usuario a partir de los datos proporcionados, validando que sean correctos
    const nombre = typeof datos.nombre === 'string' ? datos.nombre.trim() : '';
    if (
      !nombre ||
      nombre.length > 150 ||
      typeof datos.password !== 'string' ||
      !(datos.ahora instanceof Date) ||
      !Number.isFinite(datos.ahora.getTime())
    ) {
      throw new BadRequestException('Nombre, contraseña o fecha inválidos.');
    }
    return {
      nombre,
      passwordHash: await this.contrasenas.generarHash(datos.password),
    };
  }
}
