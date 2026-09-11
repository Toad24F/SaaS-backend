import {
    ForbiddenException,
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { JwtPayload } from '../interfaces/jwt-payload.interface';
import { UsuariosService } from '../../usuarios/usuarios.service';
import { Rol } from '../enums/rol.enum';
// Contiene la lógica profunda de validación del token.
// Se encarga de leer el token que envía el cliente, extraer el payload y decidir si el token es legítimo, ha expirado,
// o si el usuario asociado sigue siendo válido en el sistema.
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor(
        private readonly configService: ConfigService,
        private readonly usuariosService: UsuariosService,
    ) {
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey:
                configService.getOrThrow<string>('JWT_SECRET'),
        });
    }

    async validate(payload: JwtPayload) {
        if (!payload || !Number.isInteger(payload.sub) || payload.sub <= 0) {
            throw new UnauthorizedException('Token no válido');
        }
        const usuario = await this.usuariosService.findById(payload.sub);

        if (!usuario || !usuario.activo || usuario.activadoEn === null || !usuario.nombre) {
            throw new UnauthorizedException('Usuario no válido o inactivo');
        }

        if (
            usuario.rol !== Rol.SUPERADMIN &&
            (!usuario.negocio || usuario.negocio.activadoEn === null)
        ) {
            throw new ForbiddenException(
                'El negocio se encuentra pendiente de activación',
            );
        }

        // Los permisos y el negocio se obtienen de la base de datos, no del token antiguo.
        return {
            sub: usuario.id,
            email: usuario.email,
            nombre: usuario.nombre,
            rol: usuario.rol,
            negocioId: usuario.negocioId,
            ...(payload.sesionId ? { sesionId: payload.sesionId } : {}),
        } satisfies JwtPayload;
    }
}
