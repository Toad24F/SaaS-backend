import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { IsBoolean, IsString, MaxLength, ValidateIf } from 'class-validator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Rol } from '../auth/enums/rol.enum';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { PublicacionCatalogoService } from './publicacion-catalogo.service';

class PublicacionCatalogoDto {
  // Todos los campos son parciales; ValidateIf rechaza null y permite omisión.
  @ValidateIf((_objeto, valor) => valor !== undefined)
  @IsString()
  @MaxLength(100)
  categoria?: string;

  @ValidateIf((_objeto, valor) => valor !== undefined)
  @IsString()
  @MaxLength(20)
  telefono?: string;

  @ValidateIf((_objeto, valor) => valor !== undefined)
  @IsBoolean()
  mostrarContactoPublico?: boolean;

  @ValidateIf((_objeto, valor) => valor !== undefined)
  @IsBoolean()
  mostrarPreciosPublicos?: boolean;
}

@Controller('negocios/publicacion-catalogo')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Rol.ADMIN_NEGOCIO)
export class PublicacionCatalogoController {
  constructor(private readonly publicacion: PublicacionCatalogoService) {}

  @Get()
  consultar(@CurrentUser() actor: JwtPayload) {
    return this.publicacion.consultar(actor.sub);
  }

  @Patch()
  async actualizar(@CurrentUser() actor: JwtPayload, @Body() datos: PublicacionCatalogoDto) {
    // La escritura en servicio revalida pertenencia y comparte barrera con catálogo.
    return this.publicacion.actualizar(actor.sub, datos);
  }
}
