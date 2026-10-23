import type { JwtPayload } from './jwt-payload.interface';

/** Contexto actual reconstruido desde la base de datos para cada petición privada. */
export interface UsuarioAutenticado extends JwtPayload {
  negocioNombre: string | null;
  // Dato informativo reconstruido desde el negocio propio; no es un claim JWT.
  identificadorPublico: string | null;
}
