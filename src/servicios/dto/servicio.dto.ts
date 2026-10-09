import { Transform } from 'class-transformer';
import { IsInt, IsNotEmpty, IsString, Matches, Max, MaxLength, Min, ValidateIf } from 'class-validator';

// Acepta números JSON y texto decimal; conserva dos decimales sin usar coma flotante en SQL.
const normalizarCosto = ({ value }: { value: unknown }) =>
  typeof value === 'number' && Number.isFinite(value) ? String(value) : value;
const normalizarNombre = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** Campos editables; negocio y estado son propiedad del servidor. */
export class CrearServicioDto {
  @Transform(normalizarNombre)
  @IsString({ message: 'nombre debe ser texto' })
  @IsNotEmpty({ message: 'nombre es obligatorio' })
  @MaxLength(150, { message: 'nombre supera 150 caracteres' })
  nombre: string;

  @Transform(normalizarCosto)
  @IsString({ message: 'costo debe ser decimal' })
  @Matches(/^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/,
    { message: 'costo debe ser no negativo con máximo dos decimales' })
  costo: string;

  @IsInt({ message: 'duracionMinutos debe ser entero' })
  @Min(1, { message: 'duracionMinutos debe ser positivo' })
  @Max(4294967295, { message: 'duracionMinutos está fuera de rango' })
  duracionMinutos: number;

  // El texto se recorta, puede omitirse y nunca proviene de una columna de tenant.
  @Transform(normalizarNombre)
  @ValidateIf((_objeto, valor) => valor !== undefined)
  @IsString({ message: 'descripcion debe ser texto' })
  descripcion?: string;
}

/** Edición parcial: cada campo presente conserva las reglas del alta. */
export class EditarServicioDto {
  @Transform(normalizarNombre)
  @ValidateIf((_objeto, valor) => valor !== undefined)
  @IsString({ message: 'nombre debe ser texto' })
  @IsNotEmpty({ message: 'nombre es obligatorio' })
  @MaxLength(150, { message: 'nombre supera 150 caracteres' })
  nombre?: string;

  @Transform(normalizarCosto)
  @ValidateIf((_objeto, valor) => valor !== undefined)
  @IsString({ message: 'costo debe ser decimal' })
  @Matches(/^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/,
    { message: 'costo debe ser no negativo con máximo dos decimales' })
  costo?: string;

  @ValidateIf((_objeto, valor) => valor !== undefined)
  @IsInt({ message: 'duracionMinutos debe ser entero' })
  @Min(1, { message: 'duracionMinutos debe ser positivo' })
  @Max(4294967295, { message: 'duracionMinutos está fuera de rango' })
  duracionMinutos?: number;

  @Transform(normalizarNombre)
  @ValidateIf((_objeto, valor) => valor !== undefined)
  @IsString({ message: 'descripcion debe ser texto' })
  descripcion?: string;
}
