import { Type } from '@nestjs/common';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { AuthService } from './auth/auth.service';
import { JwtStrategy } from './auth/strategies/jwt.strategy';
import { UsuariosModule } from './usuarios/usuarios.module';
import { UsuariosService } from './usuarios/usuarios.service';
import { Usuario } from './usuarios/entities/usuario.entity';
import { Negocio } from './usuarios/entities/negocio.entity';
import { NegociosModule } from './negocios/negocios.module';
import { LicenciasModule } from './licencias/licencias.module';
import { CodigosModule } from './codigos/codigos.module';
import { AltasModule } from './altas/altas.module';
import { AuditoriaModule } from './auditoria/auditoria.module';

const modulos: Type<unknown>[] = [AuthModule, UsuariosModule, NegociosModule, LicenciasModule,
  CodigosModule, AltasModule, AuditoriaModule];

function dependencias(modulo: Type<unknown>): Type<unknown>[] {
  const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, modulo) ?? [];
  return imports.map((entrada: Type<unknown> | { module?: Type<unknown>; forwardRef?: () => Type<unknown> }) => {
    if (typeof entrada === 'function') return entrada;
    return entrada.forwardRef?.() ?? entrada.module;
  }).filter((entrada: Type<unknown>) => modulos.includes(entrada));
}

describe('Composición de módulos (T07; soporte RF-01–40)', () => {
  it('compone los siete módulos desde Auth y Altas sin conectar a la base', async () => {
    const modulo = await Test.createTestingModule({ imports: [AuthModule, AltasModule] })
      .overrideProvider(ConfigService).useValue(new ConfigService({
        JWT_SECRET: 'clave-exclusiva-de-pruebas-modulares', JWT_EXPIRES_IN: 3600,
      }))
      .overrideProvider(getRepositoryToken(Usuario)).useValue({})
      .overrideProvider(getRepositoryToken(Negocio)).useValue({})
      .compile();
    try {
      await modulo.init();
      for (const tipo of modulos) expect(modulo.get(tipo)).toBeDefined();
      expect(modulo.get(AuthService)).toBeInstanceOf(AuthService);
      expect(modulo.get(UsuariosService)).toBeInstanceOf(UsuariosService);
      expect(modulo.get(JwtStrategy)).toBeInstanceOf(JwtStrategy);
    } finally {
      await modulo.close();
    }
  });

  it('no tiene ciclos, incluyendo los ocultos tras forwardRef', () => {
    function visitar(modulo: Type<unknown>, camino: Type<unknown>[] = []): void {
      if (camino.includes(modulo)) throw new Error(`Dependencia circular: ${[...camino, modulo].map((tipo) => tipo.name).join(' → ')}`);
      for (const dependencia of dependencias(modulo)) visitar(dependencia, [...camino, modulo]);
    }
    for (const modulo of modulos) expect(() => visitar(modulo)).not.toThrow();
  });

  it('mantiene el dominio independiente de los coordinadores y auditoría independiente del dominio', () => {
    for (const modulo of [UsuariosModule, NegociosModule, LicenciasModule, CodigosModule]) {
      expect(dependencias(modulo)).not.toContain(AuthModule);
      expect(dependencias(modulo)).not.toContain(AltasModule);
    }
    expect(dependencias(AuditoriaModule)).toEqual([]);
  });
});
