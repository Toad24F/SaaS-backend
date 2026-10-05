import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Matches, Max,
  MaxLength, Min, ValidateIf } from 'class-validator';
import { TIPOS_BLOQUEO, type TipoBloqueo } from '../validar-bloqueo';

// El DTO exige los campos de alcance incluso cuando el cliente elige null.
export class CrearBloqueoDto {
  @ValidateIf((_, valor) => valor !== null) @IsInt() @Min(1) personalId: number | null;
  @ValidateIf((_, valor) => valor !== null) @IsInt() @Min(1) sucursalId: number | null;
  @IsIn(TIPOS_BLOQUEO) tipo: TipoBloqueo;
  @IsString() @IsNotEmpty() @MaxLength(500) motivo: string;
  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) fechaInicio: string;
  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) fechaFin: string;
  @ValidateIf((_, valor) => valor !== null) @IsInt() @Min(0) @Max(1439)
  inicioMinutos: number | null;
  @ValidateIf((_, valor) => valor !== null) @IsInt() @Min(1) @Max(1440)
  finMinutos: number | null;
}

/** PATCH conserva los campos omitidos; null cambia explícitamente el alcance. */
export class EditarBloqueoDto {
  @IsOptional() @IsInt() @Min(1) personalId?: number | null;
  @IsOptional() @IsInt() @Min(1) sucursalId?: number | null;
  @IsOptional() @IsIn(TIPOS_BLOQUEO) tipo?: TipoBloqueo;
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(500) motivo?: string;
  @IsOptional() @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) fechaInicio?: string;
  @IsOptional() @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) fechaFin?: string;
  @IsOptional() @IsInt() @Min(0) @Max(1439) inicioMinutos?: number | null;
  @IsOptional() @IsInt() @Min(1) @Max(1440) finMinutos?: number | null;
}

export class BloqueoIdDto { @Type(() => Number) @IsInt() @Min(1) id: number }

/** Filtros por destinatario efectivo; null en la fila continúa siendo aplicable. */
export class ConsultarBloqueosDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) personalId?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) sucursalId?: number;
}
