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
import { SucursalesHttpModule } from './sucursales/sucursales-http.module';
import { ServiciosModule } from './servicios/servicios.module';
import { ServiciosHttpModule } from './servicios/servicios-http.module';
import { ProfesionalesModule } from './profesionales/profesionales.module';
import { ProfesionalesHttpModule } from './profesionales/profesionales-http.module';
import { HorariosModule } from './horarios/horarios.module';
import { HorariosHttpModule } from './horarios/horarios-http.module';
import { BloqueosModule } from './bloqueos/bloqueos.module';
import { BloqueosHttpModule } from './bloqueos/bloqueos-http.module';
import { CorreosModule } from './correos/correos.module';
import { CorreosHttpModule } from './correos/correos-http.module';
import { OperacionModule } from './operacion/operacion.module';

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
    SucursalesHttpModule,
    ServiciosModule,
    ServiciosHttpModule,
    ProfesionalesModule,
    ProfesionalesHttpModule,
    HorariosModule,
    HorariosHttpModule,
    BloqueosModule,
    BloqueosHttpModule,
    CorreosModule,
    CorreosHttpModule,
    // Al arrancar activa conciliación y bandeja; en tests se invoca con reloj falso.
    OperacionModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
