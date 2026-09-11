import {
    ForbiddenException,
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsuariosService } from '../usuarios/usuarios.service';
import { LoginDto } from './dto/login.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { PoliticaContrasenasService } from './services/politica-contrasenas.service';

//Aqui es donde se implementa la lógica de negocio relacionada con la autenticación, 
// como la busqueda de usuarios, verificación de credenciales y la generación de tokens JWT.
@Injectable()
export class AuthService {
    constructor(
        private readonly usuariosService: UsuariosService,
        private readonly jwtService: JwtService,
        private readonly politicaContrasenas: PoliticaContrasenasService,
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
            throw new UnauthorizedException('Credenciales inválidas o usuario inactivo');
        }

        // 2. Validar contraseña con bcrypt
        const passwordValida = await this.politicaContrasenas.comparar(
            loginDto.password,
            usuario.passwordHash,
        );

        if (!passwordValida) {
            throw new UnauthorizedException('Credenciales inválidas');
        }

        // La suspensión comercial se validará en Licencia; aquí solo se exige activación.
        if (usuario.rol !== 'superadmin') {
            if (!usuario.negocio || usuario.negocio.activadoEn === null) {
                throw new ForbiddenException('El negocio se encuentra pendiente de activación');
            }
        }

        // 4. Generar el payload del token JWT
        const payload: JwtPayload = {
            sub: usuario.id,
            email: usuario.email,
            nombre: usuario.nombre,
            rol: usuario.rol,
            negocioId: usuario.negocioId,
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
}
