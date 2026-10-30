import { BadRequestException } from '@nestjs/common';
import { IsInt, Max, Min, ValidateIf } from 'class-validator';

const CLAVE_OPACA = /^[A-Za-z0-9_-]{16,64}$/;

/** El cuerpo de suspensión solo admite el plazo; null no equivale a omisión. */
export class SolicitarSuspensionDto {
  @ValidateIf((_objeto, valor: unknown) => valor !== undefined)
  @IsInt()
  @Min(0)
  @Max(30)
  plazoDias?: number;
}

/** Normaliza la omisión a dos días antes de calcular la huella idempotente. */
export function validarPlazoSuspension(valor: unknown): number {
  if (valor === undefined) return 2;
  if (typeof valor !== 'number' || !Number.isInteger(valor) || valor < 0 || valor > 30) {
    throw new BadRequestException('El plazo de suspensión debe ser un entero de 0 a 30 días.');
  }
  return valor;
}

/** La clave usa ASCII sin espacios para conservar comparación binaria estable. */
export function validarClaveOperacionLicencia(valor: unknown): string {
  if (typeof valor !== 'string' || !CLAVE_OPACA.test(valor)) {
    throw new BadRequestException('La clave de operación debe tener 16 a 64 caracteres opacos.');
  }
  return valor;
}
