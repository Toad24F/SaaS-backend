import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, Length, Matches, MaxLength, ValidateBy } from 'class-validator';

/** Comprueba un identificador IANA real, sin aceptar desfases numéricos. */
function zonaIana(valor: unknown): boolean {
  if (typeof valor !== 'string' || !/^(UTC|[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)+)$/.test(valor)) return false;
  try { new Intl.DateTimeFormat('en-US', { timeZone: valor }); return true; }
  catch { return false; }
}

/** Limita el enlace opcional a HTTPS de Google Maps o su acortador oficial. */
function enlaceGoogleMaps(valor: unknown): boolean {
  if (typeof valor !== 'string') return false;
  try {
    const url = new URL(valor);
    if (url.protocol !== 'https:' || url.username || url.password) return false;
    const host = url.hostname.toLowerCase();
    if (host === 'maps.app.goo.gl') return url.pathname.length > 1;
    if (host === 'goo.gl') return url.pathname.startsWith('/maps/');
    return /^(?:(?:www|maps)\.)?google\.(?:com(?:\.[a-z]{2})?|[a-z]{2}|co\.[a-z]{2})$/.test(host) &&
      (host.startsWith('maps.') || url.pathname.startsWith('/maps'));
  } catch { return false; }
}

/** Solo datos editables de ubicación; negocio y estado los determina el servidor. */
export class CrearSucursalDto {
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString({ message: 'nombre debe ser texto' })
  @IsNotEmpty({ message: 'nombre es obligatorio' })
  @MaxLength(150, { message: 'nombre supera 150 caracteres' })
  nombre: string;

  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString({ message: 'direccion debe ser texto' })
  @IsNotEmpty({ message: 'direccion es obligatoria' })
  @MaxLength(255, { message: 'direccion supera 255 caracteres' })
  direccion: string;

  // El formato admite prefijo internacional y separadores comunes sin letras.
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString({ message: 'telefono debe ser texto' })
  @Length(7, 20, { message: 'telefono debe tener entre 7 y 20 caracteres' })
  @Matches(/^(?=(?:\D*\d){7,}\D*$)\+?[0-9][0-9 ()-]*[0-9]$/,
    { message: 'telefono tiene formato inválido' })
  telefono: string;

  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString({ message: 'zonaHoraria debe ser texto' })
  @MaxLength(64, { message: 'zonaHoraria supera 64 caracteres' })
  @ValidateBy({ name: 'zonaIana', validator: { validate: zonaIana } },
    { message: 'zonaHoraria debe ser una zona IANA conocida' })
  zonaHoraria: string;

  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsOptional()
  @IsString({ message: 'urlGoogleMaps debe ser texto' })
  @MaxLength(2048, { message: 'urlGoogleMaps supera 2048 caracteres' })
  @ValidateBy({ name: 'enlaceGoogleMaps', validator: { validate: enlaceGoogleMaps } },
    { message: 'urlGoogleMaps debe ser un enlace HTTPS de Google Maps' })
  urlGoogleMaps?: string | null;

  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsOptional()
  @IsString({ message: 'notasLlegada debe ser texto' })
  notasLlegada?: string | null;
}
