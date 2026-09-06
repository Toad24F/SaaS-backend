import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { JwtPayload } from '../interfaces/jwt-payload.interface';
// Contiene la lógica profunda de validación del token. 
// Se encarga de leer el token que envía el cliente, extraer el payload y decidir si el token es legítimo, ha expirado, o si el usuario asociado sigue siendo válido en el sistema.
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor(private readonly configService: ConfigService) {
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey: configService.get<string>('JWT_SECRET') || 'secretoPorDefecto123',
        });
    }

    async validate(payload: JwtPayload) {
        if (!payload || !payload.sub) {
            throw new UnauthorizedException('Token no válido');
        }
        return payload;
    }
}