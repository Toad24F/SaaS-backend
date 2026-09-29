import { BadRequestException, ConflictException, Body, Controller, HttpCode, HttpStatus, Inject, Post, UseGuards } from '@nestjs/common';
import { ActivacionesService } from '../altas/activaciones.service';
import { RELOJ } from '../comun/reloj';
import type { Reloj } from '../comun/reloj';
import { ActivarCuentaDto, CodigoContrasenaDto } from './dto/acceso-codigo.dto';
import { LimiteIntentosGuard } from './guards/limite-intentos.guard';
import { CredencialesService } from './services/credenciales.service';

// Activar administración y recuperar acceso son las rutas públicas por código.
// El código de un solo uso autoriza la operación. Ambas rutas
// consumen la misma cuota por IP que login, incluso si la validación falla.
@Controller('auth')
@UseGuards(LimiteIntentosGuard)
export class AccesoCodigoController {
  constructor(
    private readonly activaciones: ActivacionesService,
    private readonly credenciales: CredencialesService,
    @Inject(RELOJ) private readonly reloj: Reloj,
  ) { }

  @Post('activar-administrador')//expone la ruta para activar la cuenta de administrador
  @HttpCode(HttpStatus.OK)
  async activarAdministrador(@Body() datos: ActivarCuentaDto) {
    // El propósito lo determina la ruta y el instante lo aporta el servidor.
    try { return await this.activaciones.activarAdministrador({
      codigo: datos.codigo, nombre: datos.nombre, password: datos.password,
      correo: datos.correo, negocioId: datos.negocioId,
      ahora: this.reloj.ahora(),
    }); } catch (error) {
      // Se distinguen entradas mal formadas de un código/destinatario/estado conflictivo.
      if (error instanceof BadRequestException &&
        ['Código inválido o no disponible.', 'La cuenta no puede activarse.'].includes(error.message)) {
        throw new ConflictException('Código o destinatario inválido o no disponible.');
      }
      throw error;
    }
  }

  @Post('recuperar-contrasena')//expone la ruta para recuperar la contraseña de un usuario con un código de recuperación
  @HttpCode(HttpStatus.NO_CONTENT)
  recuperarContrasena(@Body() datos: CodigoContrasenaDto): Promise<void> {
    // Consumo, cambio y revocación se confirman juntos; no se devuelve una sesión.
    return this.credenciales.recuperarContrasena({
      codigo: datos.codigo, nuevaPassword: datos.password, ahora: this.reloj.ahora(),
    });
  }
}
