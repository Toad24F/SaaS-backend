import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { UsuariosModule } from '../usuarios/usuarios.module';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LicenciasModule } from '../licencias/licencias.module';
import { CodigosModule } from '../codigos/codigos.module';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Sesion } from './entities/sesion.entity';
import { LimiteIntentos } from './entities/limite-intentos.entity';
import { PoliticaContrasenasService } from './services/politica-contrasenas.service';

//se agrupan y declaran los controladores, servicios y estrategias 
//para que el framework sepa cómo empaquetar la funcionalidad de autenticación
@Module({
  imports: [
    ConfigModule,
    UsuariosModule,
    LicenciasModule,
    CodigosModule,
    AuditoriaModule,
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
    ThrottlerModule.forRoot({ //Esto sirve para limitar la cantidad de intentos de inicio de sesión en un período de tiempo determinado, protegiendo así contra ataques de fuerza bruta.
      throttlers: [
        {
          ttl: 60_000,
          limit: 5,
          blockDuration: 60_000,
        },
      ],
      errorMessage:
        'Demasiados intentos de inicio de sesión. Intenta de nuevo más tarde.',
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    JwtAuthGuard,
    ThrottlerGuard,
    PoliticaContrasenasService,
  ],
  exports: [AuthService, JwtAuthGuard, PassportModule, PoliticaContrasenasService],
})
export class AuthModule { }
