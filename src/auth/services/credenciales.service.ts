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
import { BandejaCorreoService } from '../../correos/bandeja-correo.service';
import { CodigoAcceso } from '../../codigos/entities/codigo-acceso.entity';
import { EnvioCorreo, EstadoEnvioCorreo } from '../../correos/entities/envio-correo.entity';
import { createHash } from 'node:crypto';
import { transaccionIdentidad } from '../../comun/transaccion-identidad';

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
    private readonly bandeja: BandejaCorreoService = new BandejaCorreoService(),
  ) { }

  async autorizarRecuperacion(datos: {
    actorUsuarioId: number; administradorId: number; ahora: Date;
  }) {
    return transaccionIdentidad(this.usuarios.manager, async (manager) => {
      const actor = await manager.getRepository(Usuario).createQueryBuilder('actor').setLock('pessimistic_read')
        .where('actor.id = :id', { id: datos.actorUsuarioId }).getOne();
      const destino = await manager.getRepository(Usuario).createQueryBuilder('usuario')
        .setLock('pessimistic_write').where('usuario.id = :id', { id: datos.administradorId }).getOne();
      if (!actor || !actor.activo || actor.activadoEn === null || !destino || destino.negocioId === null) throw new ForbiddenException('Acceso denegado.');
      this.autorizacion.exigirRecuperacionAdministrador(actor.rol, destino.rol);
      if (destino.activadoEn === null) throw new BadRequestException('La cuenta no puede recuperar contraseña.');
      const codigo = await this.codigos.emitirInvalidandoAnterior(manager, {
        negocioId: destino.negocioId, usuarioId: destino.id,
        emisorUsuarioId: actor.id, proposito: PropositoCodigoAcceso.RECUPERACION,
        ahora: datos.ahora,
      });
      // Código y bandeja se confirman juntos sin modificar inactividad ni suspensión.
      const referencias = await manager.getRepository(CodigoAcceso).find({
        where: { negocioId: destino.negocioId, usuarioId: destino.id, proposito: PropositoCodigoAcceso.RECUPERACION },
        order: { id: 'DESC' },
      });
      const anteriores = referencias.slice(1).map((referencia) => referencia.id);
      if (anteriores.length) await manager.getRepository(EnvioCorreo).createQueryBuilder().update().set({
        estado: EstadoEnvioCorreo.DESCARTADO, arrendamientoId: null, arrendadoHasta: null,
        ultimoError: 'Código sustituido.',
      }).where('negocio_id = :negocioId', { negocioId: destino.negocioId })
        .andWhere('codigo_acceso_id IN (:...anteriores)', { anteriores })
        .andWhere("estado IN ('pendiente','fallido','tomado')").execute();
      const envio = await this.bandeja.encolarCodigo(manager, {
        negocioId: destino.negocioId, codigoAccesoId: referencias[0].id, ahora: datos.ahora,
      });
      // La autorización se audita sin cambiar activo, activación ni licencia.
      await this.auditoria.registrar(manager, {
        operacionId: randomUUID(), actorUsuarioId: actor.id, negocioId: destino.negocioId,
        usuarioId: destino.id, licenciaId: null, accion: 'recuperacion_autorizada',
        valoresAntes: null, valoresDespues: { expiraEn: codigo.expiraEn.toISOString() },
      });
      return { negocioId: destino.negocioId, administradorId: destino.id,
        envioId: envio.id, estadoEnvio: envio.estado, expiraEn: codigo.expiraEn };
    });
  }

  async recuperarContrasena(datos: { codigo: string; nuevaPassword: string; ahora: Date }): Promise<void> {
    const passwordHash = await this.contrasenas.generarHash(datos.nuevaPassword);// La validación de la política de contraseñas se hace en generarHash.
    // Recuperación conserva código/contraseña. El correo de emisión se obtiene
    // por hash y consumir revalida su versión y destinatario actuales bajo bloqueo.
    const referencia = await this.usuarios.manager.getRepository(CodigoAcceso).createQueryBuilder('codigo')
      .where('codigo.codigoHash = :hash', { hash: createHash('sha256').update(datos.codigo).digest('hex') }).getOne();
    await this.codigos.consumir(this.usuarios.manager.connection, {
      correo: referencia?.correoDestinatario ?? undefined,
      codigo: datos.codigo, proposito: PropositoCodigoAcceso.RECUPERACION, ahora: datos.ahora,// La validación de la vigencia y el propósito del código se hace en consumir.
    }, async (manager, codigo) => {
      // Recuperación siempre tiene cuenta, incluso mientras convive con la activación por invitación.
      if (codigo.usuarioId === null) throw new BadRequestException('Código inválido o no disponible.');
      const usuario = await manager.getRepository(Usuario).findOneByOrFail({ id: codigo.usuarioId });// Recuperar exige administrador activado; mantiene cualquier inactividad.
      if (usuario.rol !== Rol.ADMIN_NEGOCIO || usuario.activadoEn === null) {
        throw new BadRequestException('La cuenta no puede recuperar contraseña.');
      }
      await manager.getRepository(Usuario).update(usuario.id, { passwordHash });// Se actualiza el hash de la contraseña.
      await this.sesiones.revocarTodasConManager(manager, usuario.id, datos.ahora);// Todas las sesiones, incluida la actual, se invalidan con el cambio.
    });
  }

  async cambiarContrasena(datos: {// El cambio de contraseña requiere la contraseña actual y revoca todas las sesiones, incluida la actual.
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
