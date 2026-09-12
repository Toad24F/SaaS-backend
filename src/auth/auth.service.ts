import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RELOJ } from '../comun/reloj';
import type { Reloj } from '../comun/reloj';
import { Licencia } from '../licencias/entities/licencia.entity';
import { PoliticaAccesoLicenciaService } from '../licencias/services/politica-acceso-licencia.service';
import { UsuariosService } from '../usuarios/usuarios.service';
import { LoginDto } from './dto/login.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { PoliticaContrasenasService } from './services/politica-contrasenas.service';
import { SesionesService } from './services/sesiones.service';
import { Rol } from './enums/rol.enum';

const MENSAJE_RECHAZO = 'Credenciales inválidas o acceso no disponible.';

//Aqui es donde se implementa la lógica de negocio relacionada con la autenticación, 
// como la busqueda de usuarios, verificación de credenciales y la generación de tokens JWT.
@Injectable()
export class AuthService {
    constructor(
        private readonly usuariosService: UsuariosService,
        private readonly jwtService: JwtService,
        private readonly politicaContrasenas: PoliticaContrasenasService,
        private readonly sesiones: SesionesService,
        @InjectRepository(Licencia) private readonly licencias: Repository<Licencia>,
        private readonly politicaLicencia: PoliticaAccesoLicenciaService,
        @Inject(RELOJ) private readonly reloj: Reloj,
    ) { }

    async login(loginDto: LoginDto) {
        const usuario = await this.usuariosService.findByEmailWithNegocio(loginDto.email);

        // Una cuenta pendiente no tiene credenciales utilizables aunque esté activa.
        if (
            !usuario ||
            !usuario.activo ||
            usuario.activadoEn === null ||
            !usuario.nombre ||
            !usuario.passwordHash
        ) {
            throw new UnauthorizedException(MENSAJE_RECHAZO);
        }

        // 2. Validar contraseña con bcrypt
        const passwordValida = await this.politicaContrasenas.comparar(
            loginDto.password,
            usuario.passwordHash,
        );

        if (!passwordValida) {
            throw new UnauthorizedException(MENSAJE_RECHAZO);
        }

        const ahora = this.reloj.ahora();
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
                throw new UnauthorizedException(MENSAJE_RECHAZO);
            }
        }

        // La sesión nace una sola vez; validar solicitudes posteriores no la extiende.
        const sesion = await this.sesiones.crear(usuario.id, ahora);

        // 4. Generar el payload del token JWT
        const payload: JwtPayload = {
            sub: usuario.id,
            email: usuario.email,
            nombre: usuario.nombre,
            rol: usuario.rol,
            negocioId: usuario.negocioId,
            sesionId: sesion.id,
        };

        // 5. Devolver el token JWT y la información del usuario
        return {
            message: 'Inicio de sesión exitoso',
            accessToken: this.jwtService.sign(payload),
            usuario: {
                id: usuario.id,
                nombre: usuario.nombre,
                email: usuario.email,
                rol: usuario.rol,
                negocioId: usuario.negocioId,
            },
        };
    }

    async logout(
        contexto: Pick<JwtPayload, 'sub' | 'sesionId'>,
        ahora = this.reloj.ahora(),
    ): Promise<void> {
        // Logout no consulta licencia: debe seguir disponible durante un bloqueo comercial.
        await this.sesiones.revocar(contexto.sesionId, contexto.sub, ahora);
    }
}
