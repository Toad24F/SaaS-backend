import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { RELOJ } from '../../comun/reloj';
import type { Reloj } from '../../comun/reloj';
import type { JwtPayload } from '../interfaces/jwt-payload.interface';
import { SesionesService } from '../services/sesiones.service';

/** Reconoce la sesión para retirarla incluso cuando el acceso comercial está bloqueado. */
@Injectable()
export class JwtLogoutStrategy extends PassportStrategy(Strategy, 'jwt-logout') {
  constructor(
    config: ConfigService,
    private readonly sesiones: SesionesService,
    @Inject(RELOJ) private readonly reloj: Reloj,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload) {
    // La firma y expiración JWT se validan en Passport; aquí se exige la pertenencia
    // y vigencia persistida. No se otorgan permisos para ninguna otra operación.
    if (!payload || !Number.isInteger(payload.sub) || payload.sub <= 0 ||
      typeof payload.sesionId !== 'string' || !payload.sesionId ||
      !await this.sesiones.esValida(payload.sesionId, payload.sub, this.reloj.ahora())) {
      throw new UnauthorizedException('Sesión no válida.');
    }
    return { sub: payload.sub, sesionId: payload.sesionId };
  }
}
