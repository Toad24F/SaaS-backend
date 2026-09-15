import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsuariosModule } from './usuarios/usuarios.module';
import { AuthModule } from './auth/auth.module';
import { AltasModule } from './altas/altas.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './config/env.validation';
import { getDatabaseOptions } from './config/database.config';
import { NegociosHttpModule } from './negocios/negocios-http.module';
import { UsuariosHttpModule } from './usuarios/usuarios-http.module';
import { LicenciasHttpModule } from './licencias/licencias-http.module';

@Module({
  imports: [
    // Carga variables del archivo .env
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: process.env.NODE_ENV === 'test',
      validate: validateEnv,
    }),
    // Conexión a MariaDB
    TypeOrmModule.forRootAsync({
      useFactory: () => getDatabaseOptions(),
    }),
    AuthModule,
    AltasModule,
    UsuariosModule,
    // Expone la administración de negocios con sesión y rol de superadmin.
    NegociosHttpModule,
    // Registra la gestión de recepcionistas protegida por negocio y rol.
    UsuariosHttpModule,
    // Expone las transiciones de licencia exclusivamente al superadmin.
    LicenciasHttpModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
