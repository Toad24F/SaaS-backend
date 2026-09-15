import { Transform, Type } from 'class-transformer';
import { IsEmail, IsInt, Max, MaxLength, Min } from 'class-validator';

/** La invitación solo permite el correo; rol y pertenencia se asignan en el servidor. */
export class InvitarRecepcionistaDto {
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  @IsEmail({}, { message: 'El correo del recepcionista no es válido' })
  @MaxLength(150, { message: 'El correo no puede superar 150 caracteres' })
  emailRecepcionista: string;
}

/** Valida el rango de la PK sin otorgar acceso al usuario identificado. */
export class RecepcionistaIdDto {
  @Type(() => Number)
  @IsInt({ message: 'El ID debe ser un entero' })
  @Min(1, { message: 'El ID debe ser positivo' })
  @Max(4294967295, { message: 'El ID está fuera de rango' })
  id: number;
}
