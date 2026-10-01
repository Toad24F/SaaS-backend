import { Transform, Type } from 'class-transformer';
import { ArrayUnique, IsArray, IsEmail, IsInt, IsNotEmpty, IsString, Max,
  MaxLength, Min, ValidateIf } from 'class-validator';

const recortar = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;

/** La PK de ruta no autoriza por sí sola; el servicio comprueba negocio y rol. */
export class ProfesionalIdDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(4294967295)
  id: number;
}

/** Datos de cuenta completa; tenant, rol y estado los fija el servidor. */
export class CrearProfesionalDto {
  @Transform(recortar)
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  nombre: string;

  @Transform(recortar)
  @IsEmail()
  @MaxLength(150)
  correo: string;

  // La política bcrypt compartida verifica longitud y bytes en el servicio.
  @IsString()
  @IsNotEmpty()
  password: string;
}

/** La edición solo toca identidad y credenciales; el perfil no las duplica. */
export class EditarProfesionalDto {
  @Transform(recortar)
  @ValidateIf((_objeto, valor) => valor !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  nombre?: string;

  @Transform(recortar)
  @ValidateIf((_objeto, valor) => valor !== undefined)
  @IsEmail()
  @MaxLength(150)
  correo?: string;

  @ValidateIf((_objeto, valor) => valor !== undefined)
  @IsString()
  @IsNotEmpty()
  password?: string;
}

/** Reemplaza exactamente el conjunto de sucursales, incluido el conjunto vacío. */
export class AsignarSucursalesDto {
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(4294967295, { each: true })
  sucursalIds: number[];
}
