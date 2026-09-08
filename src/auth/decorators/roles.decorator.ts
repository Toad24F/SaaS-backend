import { SetMetadata } from '@nestjs/common';
import { Rol } from '../enums/rol.enum';

export const ROLES_KEY = 'roles';

/**
 * Decorador personalizado para establecer qué roles están autorizados 
 * para acceder a un endpoint específico.
 */
export const Roles = (...roles: Rol[]) => SetMetadata(ROLES_KEY, roles);