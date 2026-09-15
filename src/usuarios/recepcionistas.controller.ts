import { Body, Controller, ForbiddenException, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Rol } from '../auth/enums/rol.enum';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { SinCamposDto } from '../comun/dto/sin-campos.dto';
import { RecepcionistaIdDto } from './dto/recepcionistas.dto';
import { Usuario } from './entities/usuario.entity';
import { UsuariosService } from './usuarios.service';

// Cada petición revalida sesión, licencia y rol antes de usar la pertenencia.
// La antigua invitación POST se retiró; el alta directa corresponde a T81/T83.
@Controller('recepcionistas')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Rol.ADMIN_NEGOCIO)
export class RecepcionistasController {
  constructor(
    private readonly usuarios: UsuariosService,
  ) {}

  @Get()
  async listar(@CurrentUser() actor: JwtPayload) {
    const usuarios = await this.usuarios.listarRecepcionistas(this.negocioActor(actor));
    return usuarios.map((usuario) => this.presentar(usuario));
  }

  @Get(':id')
  async consultar(@Param() parametros: RecepcionistaIdDto, @CurrentUser() actor: JwtPayload) {
    return this.presentar(await this.usuarios.buscarRecepcionista(this.negocioActor(actor), parametros.id));
  }

  @Post(':id/desactivar')
  @HttpCode(HttpStatus.NO_CONTENT)
  desactivar(@Param() parametros: RecepcionistaIdDto, @Body() _datos: SinCamposDto, @CurrentUser() actor: JwtPayload) {
    // El servicio vuelve a comprobar rol y negocio antes de conservar la cuenta inactiva.
    return this.usuarios.desactivarRecepcionista(actor.sub, parametros.id);
  }

  private negocioActor(actor: JwtPayload): number {
    if (actor.negocioId === null) throw new ForbiddenException('Negocio no autorizado.');
    return actor.negocioId;
  }

  private presentar(usuario: Usuario) {
    // Lista explícita de campos: nunca serializar directamente la entidad con su hash.
    return { id: usuario.id, negocioId: usuario.negocioId, nombre: usuario.nombre,
      email: usuario.email, rol: usuario.rol, activo: usuario.activo, activadoEn: usuario.activadoEn };
  }
}
