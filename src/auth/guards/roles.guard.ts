import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Rol } from '../enums/rol.enum';
import { ROLES_KEY } from '../decorators/roles.decorator';

/**
 * Guardián de autorización que verifica si el usuario autenticado 
 * posee los permisos necesarios para ejecutar la ruta solicitada.
 * 
 * Requiere que el JwtAuthGuard se haya ejecutado previamente para 
 * inyectar el usuario en la petición (request).
 */
@Injectable()
export class RolesGuard implements CanActivate {
    constructor(private reflector: Reflector) { }

    canActivate(context: ExecutionContext): boolean {
        // 1. Obtener los roles requeridos para la ruta desde el decorador @Roles
        const requiredRoles = this.reflector.getAllAndOverride<Rol[]>(ROLES_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);

        // Si la ruta no tiene el decorador @Roles, se permite el acceso público/general
        if (!requiredRoles) {
            return true;
        }

        // 2. Extraer el usuario que fue incrustado en el request por el JWT Strategy
        const { user } = context.switchToHttp().getRequest();

        // Si no hay usuario, la petición es denegada por defecto
        if (!user) {
            throw new ForbiddenException('Acceso denegado: Usuario no autenticado en el contexto.');
        }

        // 3. Validar si el rol del usuario está dentro de los permitidos
        const hasRole = requiredRoles.includes(user.rol);

        if (!hasRole) {
            throw new ForbiddenException('Acceso denegado: Privilegios insuficientes para esta acción.');
        }

        return true;
    }
}