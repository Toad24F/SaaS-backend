import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min, ValidateBy } from 'class-validator';
import { EstadoEnvioCorreo, TipoEnvioCorreo } from '../entities/envio-correo.entity';

const enteroDeConsulta = ({ value }: { value: unknown }) =>
  typeof value === 'string' && /^[1-9]\d*$/.test(value) ? Number(value) : value;
const fechaUtc = (valor: unknown) => {
  if (typeof valor !== 'string' || !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(valor)) return false;
  const fecha = new Date(`${valor}T00:00:00.000Z`);
  return Number.isFinite(fecha.getTime()) && fecha.toISOString().slice(0, 10) === valor;
};

/** Una página de envíos usa días UTC completos y no acepta conversiones implícitas. */
export class ConsultarEnviosDto {
  @IsOptional() @Transform(enteroDeConsulta) @IsInt() @Min(1) @Max(4294967295)
  pagina?: number;

  @IsOptional() @Transform(enteroDeConsulta) @IsInt() @Min(1) @Max(100)
  limite?: number;

  @IsOptional() @IsEnum(EstadoEnvioCorreo)
  estado?: EstadoEnvioCorreo;

  @IsOptional() @IsEnum(TipoEnvioCorreo)
  tipo?: TipoEnvioCorreo;

  // Validar el calendario impide que 30 de febrero se normalice silenciosamente a marzo.
  @IsOptional() @ValidateBy({ name: 'fechaUtc', validator: {
    validate: fechaUtc, defaultMessage: () => 'La fecha debe ser un día UTC válido.',
  } })
  desde?: string;

  @IsOptional() @ValidateBy({ name: 'fechaUtc', validator: {
    validate: fechaUtc, defaultMessage: () => 'La fecha debe ser un día UTC válido.',
  } })
  hasta?: string;
}
