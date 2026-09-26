import { Type } from '@nestjs/common';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { SucursalesModule } from './sucursales/sucursales.module';
import { ServiciosModule } from './servicios/servicios.module';
import { ProfesionalesModule } from './profesionales/profesionales.module';
import { HorariosModule } from './horarios/horarios.module';
import { BloqueosModule } from './bloqueos/bloqueos.module';
import { CorreosModule } from './correos/correos.module';

const modulos: Type<unknown>[] = [SucursalesModule, ServiciosModule,
  ProfesionalesModule, HorariosModule, BloqueosModule, CorreosModule];

describe('M1-T008: composición inicial de fase 2', () => {
  it('compone los seis módulos en Nest sin enviar correo', async () => {
    // Correos solo reserva su módulo: no registra emisor ni trabajo al inicializarse.
    expect(Reflect.getMetadata(MODULE_METADATA.PROVIDERS, CorreosModule) ?? []).toEqual([]);
    const modulo = await Test.createTestingModule({ imports: modulos }).compile();
    try {
      await modulo.init();
      for (const tipo of modulos) expect(modulo.get(tipo)).toBeDefined();
    } finally {
      await modulo.close();
    }
  });

  it('no declara dependencias circulares entre los módulos nuevos', () => {
    // Recorre imports de Nest para detectar ciclos aun si se añadieran forwardRef.
    const visitar = (tipo: Type<unknown>, ruta: Type<unknown>[]): void => {
      if (ruta.includes(tipo)) throw new Error(`Ciclo: ${[...ruta, tipo].map((m) => m.name).join(' → ')}`);
      const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, tipo) ?? [];
      for (const entrada of imports) {
        const destino = typeof entrada === 'function' ? entrada : entrada.forwardRef?.() ?? entrada.module;
        if (modulos.includes(destino)) visitar(destino, [...ruta, tipo]);
      }
    };
    for (const tipo of modulos) expect(() => visitar(tipo, [])).not.toThrow();
  });
});
