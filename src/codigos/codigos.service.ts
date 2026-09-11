import { BadRequestException, Injectable } from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { DataSource, EntityManager } from 'typeorm';
import { AuditoriaService } from '../auditoria/auditoria.service';
import {
  CodigoAcceso,
  PropositoCodigoAcceso,
} from './entities/codigo-acceso.entity';

const DURACION_ACTIVACION_MS = 48 * 60 * 60 * 1000;
const DURACION_RECUPERACION_MS = 30 * 60 * 1000;
const MENSAJE_CODIGO_INVALIDO = 'Código inválido o no disponible.';

export interface EmitirCodigo {
  negocioId: number;
  usuarioId: number;
  emisorUsuarioId: number;
  proposito: PropositoCodigoAcceso;
  ahora: Date;
}

export interface ConsumirCodigo {
  codigo: string;
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
  constructor(private readonly auditoria: AuditoriaService) {}

  async emitir(
    manager: EntityManager,
    datos: EmitirCodigo,
  ): Promise<CodigoEmitido> {
    const codigo = randomBytes(32).toString('base64url');
    const codigoHash = this.hash(codigo);
    const duracion = datos.proposito === PropositoCodigoAcceso.RECUPERACION
      ? DURACION_RECUPERACION_MS
      : DURACION_ACTIVACION_MS;
    const expiraEn = new Date(datos.ahora.getTime() + duracion);
    const repositorio = manager.getRepository(CodigoAcceso);
    const entidad = repositorio.create({
      negocioId: datos.negocioId,
      usuarioId: datos.usuarioId,
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
      usuarioId: datos.usuarioId,
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
    return dataSource.transaction(async (manager) => {
      const repositorio = manager.getRepository(CodigoAcceso);
      // El bloqueo serializa consumo y futura reemisión sobre la misma fila.
      const codigo = await repositorio.createQueryBuilder('codigo')
        .addSelect('codigo.codigoHash')
        .setLock('pessimistic_write')
        .where('codigo.codigoHash = :codigoHash', {
          codigoHash: this.hash(datos.codigo),
        })
        .getOne();
      if (
        !codigo ||
        codigo.proposito !== datos.proposito ||
        codigo.consumidoEn !== null ||
        codigo.invalidadoEn !== null ||
        datos.ahora.getTime() >= codigo.expiraEn.getTime()
      ) {
        throw new BadRequestException(MENSAJE_CODIGO_INVALIDO);
      }

      const resultado = await operacion(manager, codigo);
      codigo.consumidoEn = new Date(datos.ahora);
      await repositorio.save(codigo);
      return resultado;
    });
  }

  private hash(codigo: string): string {
    return createHash('sha256').update(codigo).digest('hex');
  }
}
