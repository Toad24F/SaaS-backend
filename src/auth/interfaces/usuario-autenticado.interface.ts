import type { JwtPayload } from './jwt-payload.interface';

/** Contexto actual reconstruido desde la base de datos para cada petición privada. */
export interface UsuarioAutenticado extends JwtPayload {
  negocioNombre: string | null;
}
