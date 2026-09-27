import { Injectable } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import type { Reloj } from '../../comun/reloj';
import { RELOJ } from '../../comun/reloj';
import { LimiteIntentos } from '../entities/limite-intentos.entity';
import { Inject } from '@nestjs/common';

type RegistroLimite = Awaited<ReturnType<ThrottlerStorage['increment']>>;

/** Persiste el contador de Throttler bajo bloqueo para compartirlo entre procesos. */
@Injectable()
export class LimiteIntentosStorage implements ThrottlerStorage {
  constructor(
    @InjectRepository(LimiteIntentos)
    private readonly repositorio: Repository<LimiteIntentos>,
    @Inject(RELOJ) private readonly reloj: Reloj,
  ) {}

  async increment(
    origen: string,
    ttl: number,
    limite: number,
    duracionBloqueo: number,
    _nombre: string,
  ): Promise<RegistroLimite> {
    if (!origen.trim() || origen.length > 45) {
      throw new Error('El origen del límite de intentos no es válido.');
    }

    // La primera inserción concurrente puede producir duplicado o deadlock;
    // cada reintento abre una transacción nueva y relee el contador confirmado.
    const maxIntentos = 8;
    for (let intento = 0; intento < maxIntentos; intento += 1) {
      try {
        return await this.repositorio.manager.transaction(async (manager) => {
          const repo = manager.getRepository(LimiteIntentos);
          const ahora = this.reloj.ahora();
          let fila = await repo.createQueryBuilder('limite')
            .setLock('pessimistic_write')
            .where('limite.origen = :origen', { origen })
            .getOne();

          if (!fila) {
            fila = repo.create({
              origen,
              ventanaInicio: ahora,
              intentos: 1,
              bloqueadoHasta: null,
            });
            await repo.save(fila);
            return this.resultado(fila, ahora, ttl);
          }

          if (fila.bloqueadoHasta && ahora < fila.bloqueadoHasta) {
            // Consultar durante el bloqueo no incrementa ni desplaza su final.
            return this.resultado(fila, ahora, ttl);
          }

          const ventanaTermino = ahora.getTime() >= fila.ventanaInicio.getTime() + ttl;
          const bloqueoTermino = fila.bloqueadoHasta !== null && ahora >= fila.bloqueadoHasta;
          if (ventanaTermino || bloqueoTermino) {
            fila.ventanaInicio = ahora;
            fila.intentos = 1;
            fila.bloqueadoHasta = null;
          } else {
            fila.intentos += 1;
            if (fila.intentos > limite) {
              fila.bloqueadoHasta = new Date(ahora.getTime() + duracionBloqueo);
            }
          }
          await repo.save(fila);
          return this.resultado(fila, ahora, ttl);
        });
      } catch (error) {
        const codigo = (error as { driverError?: { code?: string } }).driverError?.code
          ?? (error as { code?: string }).code;
        if (!['ER_DUP_ENTRY', 'ER_LOCK_DEADLOCK'].includes(codigo ?? '') ||
          intento === maxIntentos - 1) throw error;
      }
    }
    throw new Error('No fue posible actualizar el límite de intentos.');
  }

  private resultado(fila: LimiteIntentos, ahora: Date, ttl: number): RegistroLimite {
    return {
      totalHits: fila.intentos,
      timeToExpire: Math.max(0, fila.ventanaInicio.getTime() + ttl - ahora.getTime()),
      isBlocked: Boolean(fila.bloqueadoHasta && ahora < fila.bloqueadoHasta),
      timeToBlockExpire: fila.bloqueadoHasta
        ? Math.max(0, fila.bloqueadoHasta.getTime() - ahora.getTime())
        : 0,
    };
  }
}
