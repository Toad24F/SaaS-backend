import { Body, Controller, Get, Inject, Param, Post, UseGuards } from '@nestjs/common';
import { AltasService } from '../altas/altas.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Rol } from '../auth/enums/rol.enum';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { RELOJ } from '../comun/reloj';
import type { Reloj } from '../comun/reloj';
import { CrearNegocioDto, NegocioIdDto } from './dto/negocios-http.dto';
import { NegociosConsultaService } from './negocios-consulta.service';
import { SinCamposDto } from '../comun/dto/sin-campos.dto';

// Primero se valida la sesión y su estado actual; después se exige superadmin.
@Controller('negocios')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Rol.SUPERADMIN)
export class NegociosController {
  constructor(
    private readonly altas: AltasService,
    private readonly consultas: NegociosConsultaService,
    @Inject(RELOJ) private readonly reloj: Reloj,
  ) {}

  @Post()
  crear(@Body() datos: CrearNegocioDto, @CurrentUser() usuario: JwtPayload) {
    // Actor y hora salen del servidor. El servicio asigna la licencia anual y
    // devuelve el código una sola vez dentro del resultado del alta atómica.
    return this.altas.crearNegocio({
      actorUsuarioId: usuario.sub, ahora: this.reloj.ahora(), nombre: datos.nombre,
      identificadorPublico: datos.identificadorPublico, emailAdministrador: datos.emailAdministrador,
    });
  }

  @Get()
  listar() {
    return this.consultas.listar();
  }

  @Post(':id/reemitir-codigo')
  reemitirCodigo(@Param() parametros: NegocioIdDto, @Body() _datos: SinCamposDto, @CurrentUser() usuario: JwtPayload) {
    // Hereda el rol exclusivo de superadmin; el cuerpo no puede elegir destinatario.
    return this.altas.reemitirCodigoInicial({ actorUsuarioId: usuario.sub,
      negocioId: parametros.id, ahora: this.reloj.ahora() });
  }

  @Get(':id')
  consultar(@Param() parametros: NegocioIdDto) {
    return this.consultas.consultar(parametros.id);
  }
}
