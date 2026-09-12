import { Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerGuard,
} from '@nestjs/throttler';
import type { ThrottlerModuleOptions, ThrottlerStorage } from '@nestjs/throttler';
import type { ExecutionContext } from '@nestjs/common';

/** La ruta y el nombre del throttler no fragmentan el contador común de la IP. */
export function claveCompartidaIntentos(ip: string): string {
  return ip;
}

/** Hace que login y validación de códigos consuman la misma cuota de la IP. */
@Injectable()
export class LimiteIntentosGuard extends ThrottlerGuard {
  constructor(
    @InjectThrottlerOptions() opciones: ThrottlerModuleOptions,
    @InjectThrottlerStorage() almacenamiento: ThrottlerStorage,
    reflector: Reflector,
  ) {
    super(opciones, almacenamiento, reflector);
  }

  protected generateKey(
    _contexto: ExecutionContext,
    ip: string,
    _nombre: string,
  ): string {
    return claveCompartidaIntentos(ip);
  }
}
