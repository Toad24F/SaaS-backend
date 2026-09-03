export interface JwtPayload {
    sub: number;             // ID del usuario
    email: string;
    nombre: string;
    rol: 'superadmin' | 'admin_negocio' | 'recepcionista';
    negocioId: number | null; // null si es superadmin
}