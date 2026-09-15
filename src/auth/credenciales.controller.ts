import { Body, Controller, HttpCode, HttpStatus, Inject, Param, Post, UseGuards } from '@nestjs/common';
import { RELOJ } from '../comun/reloj';
import type { Reloj } from '../comun/reloj';
import { SinCamposDto } from '../comun/dto/sin-campos.dto';
import { CurrentUser } from './decorators/current-user.decorator';
import { Roles } from './decorators/roles.decorator';
import { AdministradorIdDto, CambiarContrasenaDto } from './dto/credenciales.dto';
import { Rol } from './enums/rol.enum';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import type { JwtPayload } from './interfaces/jwt-payload.interface';
import { CredencialesService } from './services/credenciales.service';
import { UsuariosService } from '../usuarios/usuarios.service';

// La autenticación comprueba cuenta, licencia y sesión en ambas operaciones.
@Controller('auth')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CredencialesController {
  constructor(
    private readonly credenciales: CredencialesService,
    private readonly usuarios: UsuariosService,
    @Inject(RELOJ) private readonly reloj: Reloj,
  ) {}

  @Post('cambiar-contrasena')
  @HttpCode(HttpStatus.NO_CONTENT)
  cambiar(@Body() datos: CambiarContrasenaDto, @CurrentUser() actor: JwtPayload): Promise<void> {
    // Cualquier rol cambia solo su clave. El servicio revoca también la sesión actual.
    return this.credenciales.cambiarContrasena({ usuarioId: actor.sub,
      passwordActual: datos.passwordActual, nuevaPassword: datos.nuevaPassword,
      ahora: this.reloj.ahora() });
  }

  @Post('administradores/:id/autorizar-recuperacion')
  @Roles(Rol.SUPERADMIN)
  async autorizar(@Param() parametros: AdministradorIdDto, @Body() _datos: SinCamposDto, @CurrentUser() actor: JwtPayload) {
    // Un destino fuera del recurso administradores es 404. El dominio revalida bajo bloqueo.
    await this.usuarios.buscarAdministrador(parametros.id);
    return this.credenciales.autorizarRecuperacion({ actorUsuarioId: actor.sub,
      administradorId: parametros.id, ahora: this.reloj.ahora() });
  }
}
