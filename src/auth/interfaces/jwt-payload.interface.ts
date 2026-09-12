import { Rol } from '../enums/rol.enum';

//Esta interfaz describe qué datos exactos van a estar guardados (cifrados/firmados) dentro del token JWT
export interface JwtPayload {
    sub: number;             // ID del usuario
    email: string;
    nombre: string;
    rol: Rol;// Rol del usuario (superadmin, admin_negocio, recepcionista)
    negocioId: number | null; // null si es superadmin
    // Identifica la sesión persistida para permitir vencimiento y revocación inmediata.
    sesionId: string;
}
