import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { DataSource, EntityManager } from 'typeorm';
import { AuditoriaService } from '../auditoria/auditoria.service';
import {
  CodigoAcceso,
  PropositoCodigoAcceso,
} from './entities/codigo-acceso.entity';
import { Usuario } from '../usuarios/entities/usuario.entity';
import { AltaAdministrador, EstadoAltaAdministrador } from '../altas/entities/alta-administrador.entity';
import { DerivadorCodigo } from './derivador-codigo';

const DURACION_ACTIVACION_MS = 48 * 60 * 60 * 1000;
const DURACION_RECUPERACION_MS = 30 * 60 * 1000;
const MENSAJE_CODIGO_INVALIDO = 'Código inválido o no disponible.';

export interface EmitirCodigo {
  negocioId: number;
  usuarioId?: number;
  altaAdministradorId?: number;
  legadoFase1?: boolean;
  emisorUsuarioId: number;
  proposito: PropositoCodigoAcceso;
  ahora: Date;
}

export interface ConsumirCodigo {
  codigo: string;
  correo?: string;
  proposito: PropositoCodigoAcceso;
  ahora: Date;
}

export interface CodigoEmitido {
  codigo: string;
  expiraEn: Date;
}

/** Emite y consume códigos sin persistir ni auditar nunca el valor utilizable. */
@Injectable()
export class CodigosService {
  constructor(
    private readonly auditoria: AuditoriaService,
    private readonly derivador: DerivadorCodigo = new DerivadorCodigo(),
  ) { }

  async emitir(
    manager: EntityManager,
    datos: EmitirCodigo,
  ): Promise<CodigoEmitido> {
    const altaId = datos.altaAdministradorId ?? null;
    const usuarioId = datos.usuarioId ?? null;
    if ((altaId === null) === (usuarioId === null)) {
      throw new BadRequestException('El código requiere un destinatario exclusivo.');
    }// La recuperación requiere una cuenta; la activación de administrador requiere un alta pendiente.
    if (altaId !== null && datos.proposito !== PropositoCodigoAcceso.ACTIVACION_ADMIN) {
      throw new BadRequestException('La recuperación requiere una cuenta.');
    }// La activación de administrador requiere un alta pendiente.
    // La ruta histórica sobre cuenta subsiste solo hasta sustituir el alta HTTP.
    const legadoFase1 = altaId === null && (
      datos.legadoFase1 === true ||
      datos.proposito === PropositoCodigoAcceso.ACTIVACION_ADMIN ||
      !this.derivador.tieneClaveActiva()
    );
    const alta = altaId === null ? null : await manager.getRepository(AltaAdministrador)
      .findOneBy({ id: altaId, negocioId: datos.negocioId });//busca la invitacion en la base de datos
    const usuario = usuarioId === null ? null : await manager.getRepository(Usuario)
      .findOneBy({ id: usuarioId, negocioId: datos.negocioId });//busca la cuenta en la base de datos
    if (altaId !== null && (!alta || alta.estado !== EstadoAltaAdministrador.PENDIENTE)) {
      throw new ConflictException('La invitación no está disponible.');
    }
    if (usuarioId !== null && !usuario) throw new ConflictException('La cuenta no está disponible.');
    const version = alta?.correoVersion ?? usuario?.correoVersion ?? 1;
    const correo = alta?.correo ?? usuario?.email ?? null;
    const emisionId = legadoFase1 ? null : randomUUID();
    const nonce = legadoFase1 ? null : randomBytes(16).toString('hex');
    const claveVersion = legadoFase1 ? null : this.derivador.versionActiva;
    const codigo = legadoFase1 ? randomBytes(32).toString('base64url') : this.derivador.derivar({
      emisionId: emisionId!, nonce: nonce!, claveVersion: claveVersion!,
      proposito: datos.proposito, negocioId: datos.negocioId,
      destinatarioTipo: altaId === null ? 'usuario' : 'alta',
      destinatarioId: altaId ?? usuarioId!, destinatarioVersion: version, correo: correo!,
    });// Deriva un código HMAC a partir de los metadatos y la clave activa, o genera uno aleatorio 
    const codigoHash = this.hash(codigo);
    const duracion = datos.proposito === PropositoCodigoAcceso.RECUPERACION
      ? DURACION_RECUPERACION_MS
      : DURACION_ACTIVACION_MS;
    const expiraEn = new Date(datos.ahora.getTime() + duracion);
    const repositorio = manager.getRepository(CodigoAcceso);
    const entidad = repositorio.create({
      negocioId: datos.negocioId,
      usuarioId,
      altaAdministradorId: altaId,
      destinatarioVersion: version,
      correoDestinatario: legadoFase1 ? null : correo,
      emisionId, nonce, claveVersion, legadoFase1,
      emisorUsuarioId: datos.emisorUsuarioId,
      proposito: datos.proposito,
      codigoHash,
      emitidoEn: new Date(datos.ahora),
      expiraEn,
      consumidoEn: null,
      invalidadoEn: null,
    });
    await repositorio.save(entidad);
    await this.auditoria.registrar(manager, {
      operacionId: randomUUID(),
      actorUsuarioId: datos.emisorUsuarioId,
      negocioId: datos.negocioId,
      usuarioId,
      altaAdministradorId: altaId,
      licenciaId: null,
      accion: 'codigo_emitido',
      valoresAntes: null,
      // Solo metadatos no secretos; el código y su hash quedan excluidos.
      valoresDespues: {
        proposito: datos.proposito,
        expiraEn: expiraEn.toISOString(),
      },
    });
    return { codigo, expiraEn };
  }

  async consumir<T>(
    dataSource: DataSource,
    datos: ConsumirCodigo,
    operacion: (manager: EntityManager, codigo: CodigoAcceso) => Promise<T>,
  ): Promise<T> {
    //busca el codigo con el hash del codigo que se le pasa, si no lo encuentra lanza un error
    return dataSource.transaction(async (manager) => {
      const repositorio = manager.getRepository(CodigoAcceso);
      const referencia = await repositorio.createQueryBuilder('codigo')
        .addSelect('codigo.codigoHash')
        .where('codigo.codigoHash = :codigoHash', {
          codigoHash: this.hash(datos.codigo),
        })
        .getOne();
      if (!referencia) throw new BadRequestException(MENSAJE_CODIGO_INVALIDO);

      // Bloquea invitación o cuenta antes del código y revalida destinatario.
      const destino = referencia.altaAdministradorId !== null
        ? await manager.getRepository(AltaAdministrador).createQueryBuilder('alta')
          .setLock('pessimistic_write')
          .where('alta.id = :id AND alta.negocioId = :negocioId', {// Bloquea la fila de alta para evitar que se modifique mientras se consume el código.
            id: referencia.altaAdministradorId, negocioId: referencia.negocioId,
          }).getOne()
        : await manager.getRepository(Usuario).createQueryBuilder('usuario')
          .setLock('pessimistic_write')
          .where('usuario.id = :id AND usuario.negocioId = :negocioId', {
            id: referencia.usuarioId, negocioId: referencia.negocioId,
          }).getOne();
      if (!destino) throw new BadRequestException(MENSAJE_CODIGO_INVALIDO);
      const codigo = await repositorio.createQueryBuilder('codigo')
        .addSelect('codigo.codigoHash')
        .setLock('pessimistic_write')//bloquea el registro de codigo para que no se pueda modificar mientras se consume
        .where('codigo.id = :id', { id: referencia.id })
        .getOne();
      if (
        !codigo ||
        codigo.proposito !== datos.proposito ||//verifica que el proposito del codigo sea el correcto
        codigo.consumidoEn !== null ||//verifica que el codigo no haya sido consumido
        codigo.invalidadoEn !== null ||//verifica que el codigo no haya sido invalidado
        datos.ahora.getTime() >= codigo.expiraEn.getTime()//verifica que el codigo no haya expirado
      ) {
        throw new BadRequestException(MENSAJE_CODIGO_INVALIDO);
      }
      if (!codigo.legadoFase1) {//verifica que el codigo no sea un codigo legado, si es asi valida que el correo del alta o usuario coincida con el correo del codigo
        const correo = datos.correo?.trim().toLowerCase();
        const vigente = destino instanceof AltaAdministrador
          ? destino.estado === EstadoAltaAdministrador.PENDIENTE &&
          destino.correoVersion === codigo.destinatarioVersion && destino.correo === correo
          : destino.correoVersion === codigo.destinatarioVersion &&
          destino.email === correo && destino.activadoEn !== null;
        if (!correo || !vigente || correo !== codigo.correoDestinatario ||
          !codigo.emisionId || !codigo.nonce || !codigo.claveVersion) {
          throw new BadRequestException(MENSAJE_CODIGO_INVALIDO);
        }
        const reconstruido = this.derivador.derivar({
          emisionId: codigo.emisionId, nonce: codigo.nonce,
          claveVersion: codigo.claveVersion, proposito: codigo.proposito,
          negocioId: codigo.negocioId,
          destinatarioTipo: codigo.altaAdministradorId === null ? 'usuario' : 'alta',
          destinatarioId: codigo.altaAdministradorId ?? codigo.usuarioId!,
          destinatarioVersion: codigo.destinatarioVersion, correo,
        });
        if (!timingSafeEqual(Buffer.from(this.hash(reconstruido), 'hex'),
          Buffer.from(codigo.codigoHash, 'hex'))) {
          throw new BadRequestException(MENSAJE_CODIGO_INVALIDO);
        }
      }
      //ejecuta la operacion que se le pasa como parametro, que puede ser activar administrador o recuperar contrasena
      const resultado = await operacion(manager, codigo);
      codigo.consumidoEn = new Date(datos.ahora);//marca el codigo como consumido
      await repositorio.save(codigo);//guarda el codigo consumido en la base de datos
      return resultado;
    });
  }

  async reemplazar(
    dataSource: DataSource,
    datos: EmitirCodigo,
  ): Promise<CodigoEmitido> {
    return dataSource.transaction((manager) => this.reemplazarConManager(manager, datos));
  }

  /** Comparte autorización, bloqueo de cuenta, reemplazo y auditoría en la misma transacción. */
  async reemplazarConManager(manager: EntityManager, datos: EmitirCodigo): Promise<CodigoEmitido> {
    const altaId = datos.altaAdministradorId ?? null;
    const usuario = altaId !== null ? null : await manager.getRepository(Usuario)
      .createQueryBuilder('usuario')
      .setLock('pessimistic_write')
      .where('usuario.id = :id AND usuario.negocioId = :negocioId', {
        id: datos.usuarioId,
        negocioId: datos.negocioId,
      })
      .getOne();
    const alta = altaId === null ? null : await manager.getRepository(AltaAdministrador)
      .createQueryBuilder('alta').setLock('pessimistic_write')
      .where('alta.id = :id AND alta.negocioId = :negocioId', {
        id: altaId, negocioId: datos.negocioId,
      }).getOne();
    if (altaId !== null && (!alta || alta.estado !== EstadoAltaAdministrador.PENDIENTE)) {
      throw new ConflictException('La invitación no está disponible.');
    }
    if (altaId === null && !usuario) throw new ConflictException('La cuenta no está disponible.');
    if (
      altaId === null && datos.proposito !== PropositoCodigoAcceso.RECUPERACION &&
      usuario!.activadoEn !== null
    ) {
      throw new ConflictException('La cuenta ya fue activada.');
    }

    const repositorio = manager.getRepository(CodigoAcceso);
    const anterior = await repositorio.createQueryBuilder('codigo')
      .setLock('pessimistic_write')
      .where('codigo.negocioId = :negocioId', { negocioId: datos.negocioId })
      .andWhere(altaId === null ? 'codigo.usuarioId = :usuarioId' :
        'codigo.altaAdministradorId = :altaId',
        altaId === null ? { usuarioId: datos.usuarioId } : { altaId })
      .andWhere('codigo.proposito = :proposito', { proposito: datos.proposito })
      .andWhere('codigo.consumidoEn IS NULL')
      .andWhere('codigo.invalidadoEn IS NULL')
      .getOne();
    if (!anterior) throw new ConflictException('No existe un código pendiente para reemplazar.');

    // Invalidación y nueva emisión comparten la transacción y conservan destinatario.
    anterior.invalidadoEn = new Date(datos.ahora);
    await repositorio.save(anterior);
    return this.emitir(manager, datos);
  }

  /** Invalida el código vigente, si existe, y emite el siguiente en el mismo manager. */
  async emitirInvalidandoAnterior(
    manager: EntityManager,
    datos: EmitirCodigo,
  ): Promise<CodigoEmitido> {
    const repositorio = manager.getRepository(CodigoAcceso);
    const anterior = await repositorio.createQueryBuilder('codigo')
      .setLock('pessimistic_write')
      .where('codigo.negocioId = :negocioId', { negocioId: datos.negocioId })
      .andWhere(datos.altaAdministradorId === undefined ? 'codigo.usuarioId = :usuarioId' :
        'codigo.altaAdministradorId = :altaId',
        datos.altaAdministradorId === undefined ? { usuarioId: datos.usuarioId } :
          { altaId: datos.altaAdministradorId })
      .andWhere('codigo.proposito = :proposito', { proposito: datos.proposito })
      .andWhere('codigo.consumidoEn IS NULL AND codigo.invalidadoEn IS NULL')
      .getOne();
    if (anterior) {
      anterior.invalidadoEn = new Date(datos.ahora);
      await repositorio.save(anterior);
    }
    return this.emitir(manager, datos);
  }

  private hash(codigo: string): string {
    return createHash('sha256').update(codigo).digest('hex');
  }
}
