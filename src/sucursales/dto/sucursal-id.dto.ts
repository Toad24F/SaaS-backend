import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

/** La ruta valida la PK; la pertenencia se comprueba en el servicio con el actor. */
export class SucursalIdDto {
  @Type(() => Number)
  @IsInt({ message: 'id debe ser entero' })
  @Min(1, { message: 'id debe ser positivo' })
  @Max(4294967295, { message: 'id está fuera de rango' })
  id: number;
}
