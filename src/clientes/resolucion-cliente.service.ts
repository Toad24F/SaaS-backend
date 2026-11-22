import { ConflictException, Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { bloquearNegocioAgenda } from '../comun/bloqueos-coordinados';
import { Cliente } from '../disponibilidad/entities/cliente.entity';
import type { DatosCliente } from './clientes.entrada';
import { normalizarIdentidadCliente, normalizarNombreCliente } from './identidad-cliente';

type IdentidadCliente = ReturnType<typeof normalizarIdentidadCliente>;

/** Resuelve una ficha con el negocio autorizado y el reloj del llamador. */
@Injectable()
export class ResolucionClienteService {
  async resolverEnTransaccion(manager: EntityManager, negocioId: number, datos: DatosCliente, ahora: Date) {
    if (!manager.queryRunner?.isTransactionActive) {
      throw new Error('La resolución de cliente requiere una transacción activa.');
    }

    const { nombreNormalizado, telefono } = normalizarIdentidadCliente(datos.nombreCompleto, datos.telefono);
    // El negocio serializa altas. Si el llamador ya tomó recursos de agenda, debe mantener
    // esta misma barrera desde antes de esos recursos; aquí se reutiliza dentro de su transacción.
    await bloquearNegocioAgenda(manager, negocioId);
    const coincidencias = await this.buscarCoincidencias(manager, negocioId, { nombreNormalizado, telefono }, { bloquear: true });
    if (coincidencias.length > 1) throw new ConflictException('No se pudo resolver la ficha del cliente.');
    if (coincidencias.length === 1) return { ficha: coincidencias[0], creada: false };

    const fichas = manager.getRepository(Cliente);
    const ficha = await fichas.save(fichas.create({
      negocioId, nombreCompleto: datos.nombreCompleto.trim(), nombreNormalizado: Buffer.from(nombreNormalizado),
      telefono, version: 1, creadoEn: ahora,
    }));
    return { ficha, creada: true };
  }

  /** Lectura de identidad bajo la barrera de negocio mantenida por el llamador. */
  async buscarCoincidencias(manager: EntityManager, negocioId: number,
    { nombreNormalizado, telefono }: IdentidadCliente, opciones: { excluirId?: number; bloquear?: boolean } = {}): Promise<Cliente[]> {
    // Acotar por el índice de negocio y teléfono. Releer la fuente mientras los escritores
    // previos puedan dejar el dato derivado vacío o desactualizado.
    const consulta = manager.getRepository(Cliente).createQueryBuilder('cliente')
      .where('cliente.negocioId = :negocioId AND cliente.telefono = :telefono', { negocioId, telefono })
      .andWhere('cliente.fusionadoEnId IS NULL');
    if (opciones.excluirId !== undefined) consulta.andWhere('cliente.id <> :excluirId', { excluirId: opciones.excluirId });
    if (opciones.bloquear) consulta.setLock('pessimistic_write');
    const candidatas = await consulta.orderBy('cliente.id', 'ASC').getMany();
    // El filtro indexado puede incluir teléfonos heredados equivalentes por colación.
    return candidatas.filter((ficha) =>
      ficha.telefono === telefono && normalizarNombreCliente(ficha.nombreCompleto) === nombreNormalizado);
  }
}
