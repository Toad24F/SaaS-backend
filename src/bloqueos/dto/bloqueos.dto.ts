import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Matches, Max,
  MaxLength, Min, ValidateBy, ValidateIf } from 'class-validator';
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

const enteroConsulta = ({ value }: { value: unknown }) =>
  typeof value === 'string' && /^[1-9]\d*$/.test(value) ? Number(value) : value;
const diaCivil = (valor: unknown) => typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor)
  && Number.isFinite(Date.parse(`${valor}T00:00:00Z`))
  && new Date(`${valor}T00:00:00Z`).toISOString().slice(0, 10) === valor;

/** La consulta de pantalla no cambia la lectura interna completa del motor. */
export class ConsultarBloqueosPaginaDto {
  @IsOptional() @Transform(enteroConsulta) @IsInt() @Min(1) @Max(4294967295) pagina?: number;
  @IsOptional() @Transform(enteroConsulta) @IsInt() @Min(1) @Max(100) limite?: number;
  @IsOptional() @IsIn(['vigentes_proximos', 'anteriores', 'todos']) vigencia?: 'vigentes_proximos' | 'anteriores' | 'todos';
  @IsOptional() @IsString() @MaxLength(500) motivo?: string;
  @IsOptional() @IsIn(TIPOS_BLOQUEO) tipo?: TipoBloqueo;
  @IsOptional() @Transform(enteroConsulta) @IsInt() @Min(1) personalId?: number;
  @IsOptional() @Transform(enteroConsulta) @IsInt() @Min(1) sucursalId?: number;
  @IsOptional() @ValidateBy({ name: 'diaCivil', validator: { validate: diaCivil,
    defaultMessage: () => 'Fecha civil inválida.' } }) desde?: string;
  @IsOptional() @ValidateBy({ name: 'diaCivil', validator: { validate: diaCivil,
    defaultMessage: () => 'Fecha civil inválida.' } }) hasta?: string;
}
