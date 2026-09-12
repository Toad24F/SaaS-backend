import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import type { JwtPayload } from './interfaces/jwt-payload.interface';
import { LimiteIntentosGuard } from './guards/limite-intentos.guard';

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
    @UseGuards(JwtAuthGuard)//protege la ruta, solo los usuarios autenticados pueden acceder a ella.
    @Get('profile')
    getProfile(@CurrentUser() user: JwtPayload) {
        return {
            mensaje: 'Acceso autorizado al perfil',
            user,
        };
    }
}
