import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

/** Valida el rango de la PK sin otorgar acceso al usuario identificado. */
export class RecepcionistaIdDto {
  @Type(() => Number)
  @IsInt({ message: 'El ID debe ser un entero' })
  @Min(1, { message: 'El ID debe ser positivo' })
  @Max(4294967295, { message: 'El ID está fuera de rango' })
  id: number;
}
