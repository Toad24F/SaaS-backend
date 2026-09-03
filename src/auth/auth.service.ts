import {
    ForbiddenException,
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsuariosService } from '../usuarios/usuarios.service';
import { LoginDto } from './dto/login.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';

@Injectable()
export class AuthService {
    constructor(
        private readonly usuariosService: UsuariosService,
        private readonly jwtService: JwtService,
    ) { }

    async login(loginDto: LoginDto) {
        const usuario = await this.usuariosService.findByEmailWithNegocio(loginDto.email);

        // 1. Validar que el usuario exista y esté activo
        if (!usuario || !usuario.activo) {
            throw new UnauthorizedException('Credenciales inválidas o usuario inactivo');
        }

        // 2. Validar contraseña con bcrypt
        const passwordValida = await bcrypt.compare(
            loginDto.password,
            usuario.passwordHash,
        );

        if (!passwordValida) {
            throw new UnauthorizedException('Credenciales inválidas');
        }

        // 3. Si no es superadmin, validar que el negocio esté activo (no suspendido)
        if (usuario.rol !== 'superadmin') {
            if (!usuario.negocio || usuario.negocio.estado !== 'activo') {
                throw new ForbiddenException('El negocio se encuentra inactivo o suspendido');
            }
        }

        // 4. Generar Payload del token
        const payload: JwtPayload = {
            sub: usuario.id,
            email: usuario.email,
            nombre: usuario.nombre,
            rol: usuario.rol,
            negocioId: usuario.negocioId,
        };

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