import { Transform, Type } from 'class-transformer';
import {
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsString,
  Max,
  Min,
  MaxLength,
} from 'class-validator';

/** Campos compartidos de recuperación y activación; el código fija el destinatario. */
export class CodigoContrasenaDto {
  @IsString({ message: 'El código debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El código es obligatorio' })
  codigo: string;

  // La política común valida los 12 caracteres y 72 bytes antes de generar el hash.
  @IsString({ message: 'La contraseña debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'La contraseña es obligatoria' })
  password: string;
}

/** Activación exige negocio y destinatario, sin permitir elegir rol ni usuario. */
export class ActivarCuentaDto extends CodigoContrasenaDto {
  /*@Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(4294967295)
  negocioId: number;*/

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(150)
  correo: string;

  // Se recortan espacios sin convertir números u objetos en nombres válidos.
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'El nombre debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El nombre es obligatorio' })
  @MaxLength(150, { message: 'El nombre no puede superar 150 caracteres' })
  nombre: string;
}
