import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsString, Max, Min } from 'class-validator';

/** Solo admite claves; la identidad del usuario procede de la sesión validada. */
export class CambiarContrasenaDto {
  @IsString({ message: 'La contraseña actual debe ser texto' })
  @IsNotEmpty({ message: 'La contraseña actual es obligatoria' })
  passwordActual: string;

  // La política compartida del servicio exige 12 caracteres y un máximo de 72 bytes.
  @IsString({ message: 'La nueva contraseña debe ser texto' })
  @IsNotEmpty({ message: 'La nueva contraseña es obligatoria' })
  nuevaPassword: string;
}

/** Valida el rango de la PK; el servicio verifica que corresponda a un administrador. */
export class AdministradorIdDto {
  @Type(() => Number)
  @IsInt({ message: 'El ID debe ser un entero' })
  @Min(1, { message: 'El ID debe ser positivo' })
  @Max(4294967295, { message: 'El ID está fuera de rango' })
  id: number;
}
