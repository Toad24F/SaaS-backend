import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsInt, IsOptional, IsString, Matches, Max, Min,
  ValidateNested } from 'class-validator';
import { ProfesionalIdDto } from '../../profesionales/dto/profesionales.dto';

/** El ID de la fila es opcional en altas, pero conserva identidad en edición. */
export class FranjaSemanaDto {
  @IsOptional() @IsInt() @Min(1) id?: number;
  @IsInt() @Min(0) @Max(6) diaSemana: number;
  @IsInt() @Min(0) orden: number;
  @IsOptional() @IsInt() @Min(1) sucursalId?: number | null;
  @IsOptional() @IsInt() @Min(0) @Max(1439) inicioMinutos?: number | null;
  @IsOptional() @IsInt() @Min(1) @Max(1440) finMinutos?: number | null;
  @IsOptional() @IsInt() @Min(0) @Max(1439) descansoInicioMinutos?: number | null;
  @IsOptional() @IsInt() @Min(1) @Max(1440) descansoFinMinutos?: number | null;
  @IsBoolean() activo: boolean;
}

export class GuardarSemanaDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => FranjaSemanaDto)
  franjas: FranjaSemanaDto[];
}

export class FechaExcepcionDto extends ProfesionalIdDto {
  @IsString() fecha: string;
}

/** La excepción usa franjas completas; [] representa cierre explícito. */
export class FranjaExcepcionDto {
  @IsOptional() @IsInt() @Min(1) id?: number;
  @IsInt() @Min(0) orden: number;
  @IsInt() @Min(0) @Max(1439) inicioMinutos: number;
  @IsInt() @Min(1) @Max(1440) finMinutos: number;
  @IsOptional() @IsInt() @Min(0) @Max(1439) descansoInicioMinutos?: number | null;
  @IsOptional() @IsInt() @Min(1) @Max(1440) descansoFinMinutos?: number | null;
}

export class GuardarExcepcionDto {
  @IsInt() @Min(1) sucursalId: number;
  @IsArray() @ValidateNested({ each: true }) @Type(() => FranjaExcepcionDto)
  franjas: FranjaExcepcionDto[];
}

export class RetirarExcepcionDto {
  @Type(() => Number) @IsInt() @Min(1) sucursalId: number;
}

/** Fechas civiles explícitas: la consulta no infiere días desde el reloj del servidor. */
export class ConsultarAtencionDto {
  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) desde: string;
  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) hasta: string;
}
