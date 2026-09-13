import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { UsuariosModule } from '../usuarios/usuarios.module';
import { ThrottlerModule, ThrottlerStorage } from '@nestjs/throttler';
import { LicenciasModule } from '../licencias/licencias.module';
import { CodigosModule } from '../codigos/codigos.module';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Sesion } from './entities/sesion.entity';
import { LimiteIntentos } from './entities/limite-intentos.entity';
import { PoliticaContrasenasService } from './services/politica-contrasenas.service';
import { LimiteIntentosStorage } from './services/limite-intentos.storage';
import { RELOJ, RelojSistema } from '../comun/reloj';
import { LimiteIntentosGuard } from './guards/limite-intentos.guard';
import { SesionesService } from './services/sesiones.service';
import { AutorizacionService } from './services/autorizacion.service';
import { CredencialesService } from './services/credenciales.service';
import { JwtLogoutGuard } from './guards/jwt-logout.guard';
import { JwtLogoutStrategy } from './strategies/jwt-logout.strategy';
import { AltasModule } from '../altas/altas.module';
import { AccesoCodigoController } from './acceso-codigo.controller';

//se agrupan y declaran los controladores, servicios y estrategias 
//para que el framework sepa cómo empaquetar la funcionalidad de autenticación
@Module({
  imports: [
    ConfigModule,
    UsuariosModule,
    LicenciasModule,
    CodigosModule,
    AuditoriaModule,
    // Reutiliza la activación transaccional sin hacer depender Altas de Auth.
    AltasModule,
    // Ambos repositorios son persistencia transversal de autenticación.
    TypeOrmModule.forFeature([Sesion, LimiteIntentos]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: configService.getOrThrow<number>('JWT_EXPIRES_IN'),
        },
      }),
    }),
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 5, blockDuration: 60_000 }],
      errorMessage: 'Demasiados intentos. Intenta de nuevo más tarde.',
    }),
  ],
  controllers: [AuthController, AccesoCodigoController],
  providers: [
    AuthService,
    JwtStrategy,
    JwtAuthGuard,
    // Logout conserva la autenticación de sesión sin aplicar bloqueos comerciales.
    JwtLogoutGuard,
    JwtLogoutStrategy,
    LimiteIntentosGuard,
    PoliticaContrasenasService,
    SesionesService,
    AutorizacionService,
    CredencialesService,
    { provide: RELOJ, useClass: RelojSistema },
    LimiteIntentosStorage,
    // Sustituye el contador en memoria de Throttler por la persistencia compartida.
    { provide: ThrottlerStorage, useExisting: LimiteIntentosStorage },
  ],
  exports: [
    AuthService,
    JwtAuthGuard,
    LimiteIntentosGuard,
    PassportModule,
    PoliticaContrasenasService,
    SesionesService,
    AutorizacionService,
    CredencialesService,
  ],
})
export class AuthModule { }
