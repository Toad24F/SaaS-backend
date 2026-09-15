import { Transform, Type } from 'class-transformer';
import { IsEmail, IsInt, IsNotEmpty, IsString, Max, MaxLength, Min } from 'class-validator';

/** Valida el rango de la PK sin otorgar acceso al usuario identificado. */
export class RecepcionistaIdDto {
  @Type(() => Number)
  @IsInt({ message: 'El ID debe ser un entero' })
  @Min(1, { message: 'El ID debe ser positivo' })
  @Max(4294967295, { message: 'El ID está fuera de rango' })
  id: number;
}

/** El administrador aporta identidad y clave; negocio y rol se derivan en el servicio. */
export class CrearRecepcionistaDto {
  // Se recortan espacios antes de validar, sin convertir números en texto aceptable.
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsEmail({}, { message: 'El correo debe ser válido' })
  @MaxLength(150, { message: 'El correo no puede superar 150 caracteres' })
  emailRecepcionista: string;

  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString({ message: 'El nombre debe ser texto' })
  @IsNotEmpty({ message: 'El nombre es obligatorio' })
  @MaxLength(150, { message: 'El nombre no puede superar 150 caracteres' })
  nombre: string;

  // La política compartida del servicio exige entre 12 caracteres y 72 bytes UTF-8.
  @IsString({ message: 'La contraseña debe ser texto' })
  @IsNotEmpty({ message: 'La contraseña es obligatoria' })
  password: string;
}

/** Restablecimiento administrativo: solo acepta la nueva clave. */
export class RestablecerContrasenaRecepcionistaDto {
  @IsString({ message: 'La nueva contraseña debe ser texto' })
  @IsNotEmpty({ message: 'La nueva contraseña es obligatoria' })
  nuevaPassword: string;
}
