import { Transform, Type } from 'class-transformer';
import { IsEmail, IsInt, IsNotEmpty, IsString, Max, MaxLength, Min } from 'class-validator';

/** El alta solo admite identidad del negocio y correo del administrador pendiente. */
export class CrearNegocioDto {
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString({ message: 'El nombre debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El nombre es obligatorio' })
  @MaxLength(150, { message: 'El nombre no puede superar 150 caracteres' })
  nombre: string;

  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  @IsString({ message: 'El identificador público debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El identificador público es obligatorio' })
  @MaxLength(100, { message: 'El identificador público no puede superar 100 caracteres' })
  identificadorPublico: string;

  // Normaliza antes de validar; los límites coinciden con las columnas SQL.
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  @IsEmail({}, { message: 'El correo del administrador no es válido' })
  @MaxLength(150, { message: 'El correo no puede superar 150 caracteres' })
  emailAdministrador: string;
}

/** Rechaza IDs no enteros, no positivos o fuera del rango de INT UNSIGNED. */
export class NegocioIdDto {
  @Type(() => Number)
  @IsInt({ message: 'El ID del negocio debe ser un entero' })
  @Min(1, { message: 'El ID del negocio debe ser positivo' })
  @Max(4294967295, { message: 'El ID del negocio está fuera de rango' })
  id: number;
}
