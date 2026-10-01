import { Type } from '@nestjs/common';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { SucursalesModule } from './sucursales/sucursales.module';
import { ServiciosModule } from './servicios/servicios.module';
import { ProfesionalesModule } from './profesionales/profesionales.module';
import { HorariosModule } from './horarios/horarios.module';
import { BloqueosModule } from './bloqueos/bloqueos.module';
import { CorreosModule } from './correos/correos.module';
import { TransporteCorreoSmtp } from './correos/transporte-correo-smtp';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EnvioCorreo } from './correos/entities/envio-correo.entity';
import { Sucursal } from './sucursales/entities/sucursal.entity';
import { Servicio } from './servicios/entities/servicio.entity';
import { Personal } from './profesionales/entities/personal.entity';
import { PersonalSucursal } from './profesionales/entities/personal-sucursal.entity';
import { PersonalServicio } from './profesionales/entities/personal-servicio.entity';
import { EventoAuditoria } from './auditoria/entities/evento-auditoria.entity';
import { BandejaCorreoService } from './correos/bandeja-correo.service';
import { ProcesadorCorreoService } from './correos/procesador-correo.service';

const modulos: Type<unknown>[] = [SucursalesModule, ServiciosModule,
  ProfesionalesModule, HorariosModule, BloqueosModule, CorreosModule];

describe('M1-T008: composición inicial de fase 2', () => {
  it('compone los seis módulos en Nest sin enviar correo', async () => {
    // T028 registra el adaptador, pero el arranque nunca debe invocar una entrega.
    const enviar = jest.spyOn(TransporteCorreoSmtp.prototype, 'enviar')
      .mockRejectedValue(new Error('Entrega inesperada durante el arranque.'));
    // Solo sustituye la persistencia; el registro real de la entidad sigue siendo obligatorio.
    const modulo = await Test.createTestingModule({ imports: modulos })
      .overrideProvider(ProcesadorCorreoService).useValue({})
      .overrideProvider(getRepositoryToken(EnvioCorreo)).useValue({})
      // Sucursal registra metadatos; la prueba de composición no abre MariaDB.
      .overrideProvider(getRepositoryToken(Sucursal)).useValue({})
      .overrideProvider(getRepositoryToken(Servicio)).useValue({})
      // Los tres repositorios del perfil son metadatos; no necesitan MariaDB aquí.
      .overrideProvider(getRepositoryToken(Personal)).useValue({})
      .overrideProvider(getRepositoryToken(PersonalSucursal)).useValue({})
      .overrideProvider(getRepositoryToken(PersonalServicio)).useValue({})
      .overrideProvider(getRepositoryToken(EventoAuditoria)).useValue({}).compile();
    try {
      await modulo.init();
      for (const tipo of modulos) expect(modulo.get(tipo)).toBeDefined();
      expect(modulo.get(TransporteCorreoSmtp)).toBeDefined();
      expect(modulo.get(BandejaCorreoService)).toBeDefined();
      expect(modulo.get(getRepositoryToken(EnvioCorreo))).toBeDefined();
      expect(modulo.get(getRepositoryToken(Sucursal))).toBeDefined();
      expect(enviar).not.toHaveBeenCalled();
    } finally {
      await modulo.close();
      enviar.mockRestore();
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
