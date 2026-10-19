import { BadRequestException, ConflictException, Injectable,
  NotFoundException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { BloqueoTemporal } from '../disponibilidad/entities/bloqueo-temporal.entity';
import type { ResultadoReservaPublica } from './contratos';
import { CoordinacionReservaPublicaService } from './coordinacion-reserva-publica.service';
import { IntentoReservaPublica } from './entities/intento-reserva-publica.entity';
import { SesionReservaPublica } from './entities/sesion-reserva-publica.entity';
import { IntentosReservaPublicaService } from './intentos-reserva-publica.service';

export type ResolucionIntento = { estado: 'registrado'; resultado: ResultadoReservaPublica } |
  { estado: 'no_registrado' };

/** Resolución interna bajo el mismo orden de filas que el escritor. */
@Injectable()
export class ResolucionReservaPublicaService {
  constructor(private readonly coordinacion: CoordinacionReservaPublicaService,
    private readonly intentos: IntentosReservaPublicaService) {}

  async resolver(negocioId: number, titularHash: string, clave: string,
    apartadoId: number): Promise<ResolucionIntento> {
    if (typeof clave !== 'string' || !/^[A-Za-z0-9_-]{16,64}$/.test(clave) ||
      !Number.isSafeInteger(apartadoId) || apartadoId < 1) {
      throw new BadRequestException('Intento inválido.');
    }
    // transaccion reintenta deadlocks completos y traduce espera agotada a
    // 503. Nunca interpreta una fila aún bloqueada como ausencia definitiva.
    return this.coordinacion.transaccion(clave, async (manager) => {
      const sesion = await this.coordinacion.bloquearSesion(manager, negocioId, titularHash);
      const repo = manager.getRepository(IntentoReservaPublica);
      let intento = await repo.createQueryBuilder('i').setLock('pessimistic_write')
        .where('i.negocioId=:negocioId AND i.sesionId=:sesionId AND i.clave=:clave',
          { negocioId, sesionId: sesion.id, clave }).getOne();
      if (intento && intento.apartadoId !== apartadoId) {
        throw new ConflictException('Clave de intento incompatible.');
      }
      if (intento?.estado === 'registrado') {
        return { estado: 'registrado', resultado:
          await this.intentos.proyectarRegistradoEnTransaccion(manager, intento) };
      }
      if (intento?.estado === 'no_registrado') return { estado: 'no_registrado' };
      const apartado = await manager.getRepository(BloqueoTemporal).findOneBy({
        id: apartadoId, negocioId, sesionId: sesion.id, titularHash });
      if (!apartado) throw new NotFoundException('Intento no disponible.');
      if (!intento) {
        // La fila terminal ocupa la clave antes de soltar sesión. Una
        // preparación tardía encontrará no_registrado y no podrá escribir.
        intento = await repo.save(repo.create({ negocioId, sesionId: sesion.id,
          clave, apartadoId, estado: 'no_registrado', formularioHash: null,
          citaId: null, causaPublica: 'envio_no_registrado' }));
      } else {
        if (intento.citaId !== null) throw new Error('Intento incompleto.');
        await repo.update({ id: intento.id, negocioId }, {
          estado: 'no_registrado', causaPublica: 'envio_no_registrado' });
      }
      // Solo se libera el apartado si sigue siendo el puntero de esta sesión.
      // Una generación nueva o un apartado ajeno jamás se toca.
      if (sesion.apartadoActualId === apartadoId &&
        sesion.generacion === apartado.generacion && apartado.liberadoEn === null) {
        await this.liberarActual(manager, sesion, apartado);
      }
      return { estado: 'no_registrado' };
    });
  }

  private async liberarActual(manager: EntityManager, sesion: SesionReservaPublica,
    apartado: BloqueoTemporal): Promise<void> {
    const ahora = await this.coordinacion.bloquearRecursos(manager, { negocioId: sesion.negocioId,
      usuarioIds: [apartado.personalId], sucursalIds: [apartado.sucursalId],
      servicioIds: [apartado.servicioId], personalIds: [apartado.personalId],
      apartadoIds: [apartado.id] });
    const actual = await manager.getRepository(SesionReservaPublica).findOneBy({
      id: sesion.id, negocioId: sesion.negocioId });
    const bloqueo = await manager.getRepository(BloqueoTemporal).findOneBy({
      id: apartado.id, negocioId: sesion.negocioId, sesionId: sesion.id,
      titularHash: sesion.titularHash });
    if (!actual || !bloqueo || actual.apartadoActualId !== bloqueo.id ||
      actual.generacion !== bloqueo.generacion || bloqueo.liberadoEn !== null) return;
    // No se requiere licencia vigente para resolver un envío incierto.
    await manager.getRepository(BloqueoTemporal).update({ id: bloqueo.id,
      negocioId: sesion.negocioId }, { liberadoEn: ahora });
    await manager.getRepository(SesionReservaPublica).update({ id: sesion.id,
      negocioId: sesion.negocioId }, { apartadoActualId: null });
  }
}
