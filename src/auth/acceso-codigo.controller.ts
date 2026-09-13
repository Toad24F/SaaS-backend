import { Body, Controller, HttpCode, HttpStatus, Inject, Post, UseGuards } from '@nestjs/common';
import { ActivacionesService } from '../altas/activaciones.service';
import { RELOJ } from '../comun/reloj';
import type { Reloj } from '../comun/reloj';
import { ActivarCuentaDto, CodigoContrasenaDto } from './dto/acceso-codigo.dto';
import { LimiteIntentosGuard } from './guards/limite-intentos.guard';
import { CredencialesService } from './services/credenciales.service';

// Son rutas públicas: el código de un solo uso autoriza la operación. Todas
// consumen la misma cuota por IP que login, incluso si la validación falla.
@Controller('auth')
@UseGuards(LimiteIntentosGuard)
export class AccesoCodigoController {
  constructor(
    private readonly activaciones: ActivacionesService,
    private readonly credenciales: CredencialesService,
    @Inject(RELOJ) private readonly reloj: Reloj,
  ) {}

  @Post('activar-administrador')
  @HttpCode(HttpStatus.NO_CONTENT)
  activarAdministrador(@Body() datos: ActivarCuentaDto): Promise<void> {
    // El propósito lo determina la ruta y el instante lo aporta el servidor.
    return this.activaciones.activarAdministrador({
      codigo: datos.codigo, nombre: datos.nombre, password: datos.password,
      ahora: this.reloj.ahora(),
    });
  }

  @Post('activar-recepcionista')
  @HttpCode(HttpStatus.NO_CONTENT)
  activarRecepcionista(@Body() datos: ActivarCuentaDto): Promise<void> {
    // El servicio conserva correo, rol y negocio ligados al código de invitación.
    return this.activaciones.activarRecepcionista({
      codigo: datos.codigo, nombre: datos.nombre, password: datos.password,
      ahora: this.reloj.ahora(),
    });
  }

  @Post('recuperar-contrasena')
  @HttpCode(HttpStatus.NO_CONTENT)
  recuperarContrasena(@Body() datos: CodigoContrasenaDto): Promise<void> {
    // Consumo, cambio y revocación se confirman juntos; no se devuelve una sesión.
    return this.credenciales.recuperarContrasena({
      codigo: datos.codigo, nuevaPassword: datos.password, ahora: this.reloj.ahora(),
    });
  }
}
