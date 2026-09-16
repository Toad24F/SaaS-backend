import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RELOJ } from '../comun/reloj';
import type { Reloj } from '../comun/reloj';
import { Licencia } from '../licencias/entities/licencia.entity';
import { Negocio } from '../negocios/entities/negocio.entity';
import { Usuario } from '../usuarios/entities/usuario.entity';
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

        // Serializa la creación de sesión frente al cambio y recuperación de clave.
        // Si el hash cambió desde la comparación bcrypt, la clave antigua no crea sesión.
        const { vigente, sesion } = await this.licencias.manager.transaction(async (manager) => {
            const vigente = await manager.getRepository(Usuario).createQueryBuilder('usuario')
                .setLock('pessimistic_write')
                .where('usuario.id = :id', { id: usuario.id })
                .getOne();
            if (!vigente || !vigente.activo || vigente.activadoEn === null ||
                !vigente.nombre || vigente.passwordHash !== usuario.passwordHash) {
                throw new UnauthorizedException(MENSAJE_RECHAZO);
            }
            if (vigente.rol !== Rol.SUPERADMIN) {
                const negocio = vigente.negocioId === null ? null
                    : await manager.getRepository(Negocio).findOneBy({ id: vigente.negocioId });
                const licencia = vigente.negocioId === null ? null
                    : await manager.getRepository(Licencia).findOneBy({ negocioId: vigente.negocioId });
                if (!negocio || !licencia || !this.politicaLicencia.evaluarAccesoUsuario({
                    cuentaActiva: vigente.activo,
                    cuentaActivada: vigente.activadoEn !== null,
                    negocioActivado: negocio.activadoEn !== null,
                    licencia,
                    ahora,
                }).permitido) {
                    throw new UnauthorizedException(MENSAJE_RECHAZO);
                }
            }
            return { vigente, sesion: await this.sesiones.crearConManager(manager, vigente.id, ahora) };
        });

        // 4. Generar el payload del token JWT
        const payload: JwtPayload = {
            sub: vigente.id,
            email: vigente.email,
            nombre: vigente.nombre!,
            rol: vigente.rol,
            negocioId: vigente.negocioId,
            sesionId: sesion.id,
        };

        // 5. Devolver el token JWT y la información del usuario
        return {
            message: 'Inicio de sesión exitoso',
            accessToken: this.jwtService.sign(payload),
            usuario: {
                id: vigente.id,
                nombre: vigente.nombre,
                email: vigente.email,
                rol: vigente.rol,
                negocioId: vigente.negocioId,
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
