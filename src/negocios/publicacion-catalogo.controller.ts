import { Body, Controller, Patch, UseGuards, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { Repository } from 'typeorm';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Rol } from '../auth/enums/rol.enum';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { Negocio } from './entities/negocio.entity';

class PublicacionCatalogoDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  categoria?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  telefono?: string;

  @IsBoolean()
  mostrarContactoPublico: boolean;
}

@Controller('negocios/publicacion-catalogo')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Rol.ADMIN_NEGOCIO)
export class PublicacionCatalogoController {
  constructor(@InjectRepository(Negocio) private readonly negocios: Repository<Negocio>) {}

  @Patch()
  async actualizar(@CurrentUser() actor: JwtPayload, @Body() datos: PublicacionCatalogoDto) {
    const negocio = await this.negocios.findOneBy({ id: actor.negocioId! });
    if (!negocio) throw new NotFoundException('Negocio no encontrado.');
    if (datos.categoria !== undefined) negocio.categoria = datos.categoria.trim() || null;
    if (datos.telefono !== undefined) negocio.telefonoContacto = datos.telefono.trim() || null;
    negocio.mostrarContactoPublico = datos.mostrarContactoPublico;
    await this.negocios.save(negocio);
    return { categoria: negocio.categoria, telefono: negocio.telefonoContacto,
      mostrarContactoPublico: negocio.mostrarContactoPublico };
  }
}
