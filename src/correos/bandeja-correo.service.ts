import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { CodigoAcceso, PropositoCodigoAcceso } from '../codigos/entities/codigo-acceso.entity';
import { Licencia } from '../licencias/entities/licencia.entity';
import { Usuario } from '../usuarios/entities/usuario.entity';
import { Rol } from '../auth/enums/rol.enum';
import { EnvioCorreo, EstadoEnvioCorreo, TipoEnvioCorreo } from './entities/envio-correo.entity';

interface SolicitudBase { negocioId: number; ahora: Date }
export interface EncolarCodigo extends SolicitudBase { codigoAccesoId: string }
export interface EncolarAviso extends SolicitudBase {
  licenciaId: number;
  usuarioId: number;
  versionVencimiento: number;
}
type ReferenciaEnvio = Pick<EnvioCorreo, 'negocioId' | 'tipo' | 'correoDestinatario' |
  'codigoAccesoId' | 'licenciaId' | 'versionVencimiento' | 'claveDedupe'>;

/** Registra pendientes en la transacción de dominio sin depender del transporte. */
@Injectable()
export class BandejaCorreoService {
  async encolarCodigo(manager: EntityManager, datos: EncolarCodigo): Promise<EnvioCorreo> {
    this.validarTransaccion(manager, datos);
    const codigo = await manager.getRepository(CodigoAcceso).createQueryBuilder('codigo')//bloquea la fila para evitar que otro proceso encole el mismo código al mismo tiempo
      .setLock('pessimistic_write')
      .where('codigo.id = :id AND codigo.negocioId = :negocioId', {
        id: datos.codigoAccesoId, negocioId: datos.negocioId,
      }).getOne();
    // El destinatario procede de la emisión persistida, nunca de un correo del cliente.
    if (!codigo || codigo.legadoFase1 || !codigo.correoDestinatario ||//valida que el código exista, no sea legado, tenga correo destinatario y no esté consumido o invalidado
      !codigo.emisionId || !codigo.nonce || !codigo.claveVersion ||
      codigo.consumidoEn !== null || codigo.invalidadoEn !== null ||
      datos.ahora.getTime() >= codigo.expiraEn.getTime()) {
      throw new ConflictException('El código no está disponible para envío.');
    }
    const tipo = codigo.proposito === PropositoCodigoAcceso.ACTIVACION_ADMIN
      ? TipoEnvioCorreo.ACTIVACION_ADMIN : TipoEnvioCorreo.RECUPERACION;//determina el tipo de correo según el propósito del código
    return this.guardar(manager, {
      negocioId: codigo.negocioId, tipo, correoDestinatario: codigo.correoDestinatario,
      codigoAccesoId: codigo.id, licenciaId: null, versionVencimiento: null,
      claveDedupe: `negocio:${codigo.negocioId}:codigo:${codigo.id}`,
    }, datos.ahora);
  }

  async encolarAviso(manager: EntityManager, datos: EncolarAviso): Promise<EnvioCorreo> {//esta función encola un aviso de vencimiento de licencia para un administrador de negocio específico
    this.validarTransaccion(manager, datos);
    if (!Number.isSafeInteger(datos.versionVencimiento) || datos.versionVencimiento < 1) {
      throw new BadRequestException('La versión de vencimiento debe ser un entero positivo.');
    }
    const licencia = await manager.getRepository(Licencia).createQueryBuilder('licencia')//bloquea la fila de licencia para evitar que otro proceso encole un aviso para la misma licencia al mismo tiempo
      .setLock('pessimistic_write')
      .where('licencia.id = :id AND licencia.negocioId = :negocioId', {
        id: datos.licenciaId, negocioId: datos.negocioId,
      }).getOne();
    const usuario = await manager.getRepository(Usuario).findOneBy({
      id: datos.usuarioId, negocioId: datos.negocioId, rol: Rol.ADMIN_NEGOCIO,
    });//busca al usuario administrador de negocio correspondiente al aviso de vencimientoS
    if (!licencia || !usuario || usuario.activadoEn === null || !usuario.activo) {
      throw new ConflictException('La licencia o su administrador no están disponibles para envío.');
    }//valida que la licencia y el usuario existan, que el usuario esté activado y activo
    // La selección de vencimientos elegibles y su versión se conectará en T116–T118.
    return this.guardar(manager, {
      negocioId: datos.negocioId, tipo: TipoEnvioCorreo.AVISO_VENCIMIENTO,
      correoDestinatario: usuario.email, codigoAccesoId: null, licenciaId: licencia.id,
      versionVencimiento: datos.versionVencimiento,
      claveDedupe: `negocio:${datos.negocioId}:licencia:${licencia.id}:version:${datos.versionVencimiento}`,
    }, datos.ahora);//guarda el aviso de vencimiento en la base de datos con la información correspondiente
  }

  private validarTransaccion(manager: EntityManager, datos: SolicitudBase): void {
    // No abre ni confirma una transacción propia: el rollback debe incluir el dominio.
    if (!manager.queryRunner?.isTransactionActive) {
      throw new BadRequestException('Encolar requiere una transacción activa del llamador.');
    }//valida que la transacción esté activa y que los datos de negocioId y ahora sean válidos
    if (!Number.isSafeInteger(datos.negocioId) || datos.negocioId < 1 ||
      !(datos.ahora instanceof Date) || !Number.isFinite(datos.ahora.getTime())) {
      throw new BadRequestException('Negocio o fecha de encolado inválidos.');
    }//valida que el negocioId sea un entero positivo y que la fecha de encolado sea una instancia de Date válida
  }

  private async guardar(manager: EntityManager, referencia: ReferenciaEnvio,
    ahora: Date): Promise<EnvioCorreo> {//guarda un envío de correo en la base de datos, asegurando que no haya duplicados mediante el uso de una clave de deduplicación
    const repositorio = manager.getRepository(EnvioCorreo);
    // La referencia ya está bloqueada: los encolados del mismo dominio se serializan.
    // La lectura actual ve el pendiente confirmado por el ganador aun con REPEATABLE READ.
    const existente = await repositorio.createQueryBuilder('envio').setLock('pessimistic_write')
      .where('envio.claveDedupe = :clave', { clave: referencia.claveDedupe }).getOne();
    if (existente) return existente;
    const entidad = repositorio.create({//crea una nueva entidad de envío de correo con los datos proporcionados y la fecha actual
      ...referencia, estado: EstadoEnvioCorreo.PENDIENTE, intentos: 0,
      proximoIntentoEn: new Date(ahora), arrendamientoId: null, arrendadoHasta: null,
      confirmadoEn: null, ultimoError: null,
    });
    return repositorio.save(entidad);
  }
}
