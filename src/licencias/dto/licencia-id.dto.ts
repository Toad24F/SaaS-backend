import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

/** Valida la PK de licencia; el ID no concede permisos ni permite cambiar pertenencia. */
export class LicenciaIdDto {
  @Type(() => Number)
  @IsInt({ message: 'El ID debe ser un entero' })
  @Min(1, { message: 'El ID debe ser positivo' })
  @Max(4294967295, { message: 'El ID está fuera de rango' })
  id: number;
}
