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
import { SucursalesModule } from './sucursales/sucursales.module';
import { ServiciosModule } from './servicios/servicios.module';
import { ProfesionalesModule } from './profesionales/profesionales.module';
import { HorariosModule } from './horarios/horarios.module';
import { BloqueosModule } from './bloqueos/bloqueos.module';
import { CorreosModule } from './correos/correos.module';
import { CorreosHttpModule } from './correos/correos-http.module';

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
    // Declara los dominios nuevos sin procesos ni envíos al inicializar la app.
    SucursalesModule,
    ServiciosModule,
    ProfesionalesModule,
    HorariosModule,
    BloqueosModule,
    CorreosModule,
    CorreosHttpModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
