import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import type { JwtPayload } from './interfaces/jwt-payload.interface';
import { LimiteIntentosGuard } from './guards/limite-intentos.guard';
import { JwtLogoutGuard } from './guards/jwt-logout.guard';

@Controller('auth')
//Este archivo gestiona las peticiones HTTP entrantes.
export class AuthController {
    constructor(private readonly authService: AuthService) { }
    //Endpoints
    @Post('login')//ruta para iniciar sesión
    @HttpCode(HttpStatus.OK)
    @UseGuards(LimiteIntentosGuard)// Comparte por IP el límite con las futuras rutas de validación de códigos.
    login(@Body() loginDto: LoginDto) {
        return this.authService.login(loginDto);
    }
    // Retira solo la sesión autenticada; no recibe IDs del cuerpo del cliente.
    @Post('logout')
    @HttpCode(HttpStatus.NO_CONTENT)
    @UseGuards(JwtLogoutGuard)
    async logout(@CurrentUser() user: Pick<JwtPayload, 'sub' | 'sesionId'>): Promise<void> {
        await this.authService.logout(user);
    }
    @UseGuards(JwtAuthGuard)//protege la ruta, solo los usuarios autenticados pueden acceder a ella.
    @Get('profile')
    getProfile(@CurrentUser() user: JwtPayload) {
        return {
            mensaje: 'Acceso autorizado al perfil',
            user,
        };
    }
}
