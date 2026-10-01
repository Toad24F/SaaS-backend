import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

/** Valida la PK de ruta; el servicio verifica pertenencia con la cuenta persistida. */
export class ServicioIdDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(4294967295)
  id: number;
}
