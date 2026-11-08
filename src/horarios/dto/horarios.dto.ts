import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsInt, IsOptional, IsString, Matches, Max, Min,
  ValidateNested } from 'class-validator';

/** El ID de la fila es opcional en altas, pero conserva identidad en edición. */
export class FranjaSemanaDto {
  @IsOptional() @IsInt() @Min(1) id?: number;
  @IsInt() @Min(0) @Max(6) diaSemana: number;
  @IsInt() @Min(0) orden: number;
  @IsOptional() @IsInt() @Min(1) sucursalId?: number | null;
  @IsOptional() @IsInt() @Min(0) @Max(1439) inicioMinutos?: number | null;
  @IsOptional() @IsInt() @Min(1) @Max(1440) finMinutos?: number | null;
  @IsBoolean() activo: boolean;
}

export class GuardarSemanaDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => FranjaSemanaDto)
  franjas: FranjaSemanaDto[];
}

/** Fechas civiles explícitas: la consulta no infiere días desde el reloj del servidor. */
export class ConsultarAtencionDto {
  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) desde: string;
  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) hasta: string;
}
