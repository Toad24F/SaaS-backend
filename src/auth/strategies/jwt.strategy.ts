import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { JwtPayload } from '../interfaces/jwt-payload.interface';
import { UsuariosService } from '../../usuarios/usuarios.service';
import { Rol } from '../enums/rol.enum';
import { SesionesService } from '../services/sesiones.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Licencia } from '../../licencias/entities/licencia.entity';
import { Repository } from 'typeorm';
import { PoliticaAccesoLicenciaService } from '../../licencias/services/politica-acceso-licencia.service';
import { RELOJ } from '../../comun/reloj';
import type { Reloj } from '../../comun/reloj';
// Contiene la lógica profunda de validación del token.
// Se encarga de leer el token que envía el cliente, extraer el payload y decidir si el token es legítimo, ha expirado,
// o si el usuario asociado sigue siendo válido en el sistema.
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor(
        private readonly configService: ConfigService,
        private readonly usuariosService: UsuariosService,
        private readonly sesiones: SesionesService,
        @InjectRepository(Licencia) private readonly licencias: Repository<Licencia>,
        private readonly politicaLicencia: PoliticaAccesoLicenciaService,
        @Inject(RELOJ) private readonly reloj: Reloj,
    ) {
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey:
                configService.getOrThrow<string>('JWT_SECRET'),
        });
    }

    async validate(payload: JwtPayload) {
        if (!payload || !Number.isInteger(payload.sub) || payload.sub <= 0 || !payload.sesionId) {
            throw new UnauthorizedException('Token no válido');
        }
        const ahora = this.reloj.ahora();
        if (!await this.sesiones.esValida(payload.sesionId, payload.sub, ahora)) {
            throw new UnauthorizedException('Sesión no válida.');
        }
        const usuario = await this.usuariosService.findById(payload.sub);

        if (!usuario || !usuario.activo || usuario.activadoEn === null || !usuario.nombre) {
            throw new UnauthorizedException('Usuario no válido o inactivo');
        }

        if (usuario.rol !== Rol.SUPERADMIN) {
            const licencia = usuario.negocioId === null
                ? null
                : await this.licencias.findOneBy({ negocioId: usuario.negocioId });
            if (!usuario.negocio || !licencia || !this.politicaLicencia.evaluarAccesoUsuario({
                cuentaActiva: usuario.activo,
                cuentaActivada: usuario.activadoEn !== null,
                negocioActivado: usuario.negocio.activadoEn !== null,
                licencia,
                ahora,
            }).permitido) {
                throw new UnauthorizedException('Acceso actual no disponible.');
            }
        }

        // Los permisos y el negocio se obtienen de la base de datos, no del token antiguo.
        return {
            sub: usuario.id,
            email: usuario.email,
            nombre: usuario.nombre,
            rol: usuario.rol,
            negocioId: usuario.negocioId,
            sesionId: payload.sesionId,
        } satisfies JwtPayload;
    }
}
