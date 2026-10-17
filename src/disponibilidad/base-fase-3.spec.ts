import '../../test/setup-env';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { AppModule } from '../app.module';
import { DisponibilidadModule } from './disponibilidad.module';
import { DisponibilidadHttpModule } from './disponibilidad-http.module';
import { OcupacionesModule } from './ocupaciones.module';
import { ConfiguracionAgendaService } from './configuracion-agenda.service';
import { OcupacionesService } from './ocupaciones.service';
import { DisponibilidadController } from './disponibilidad.controller';
import { RolesGuard } from '../auth/guards/roles.guard';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfiguracionAgenda } from './entities/configuracion-agenda.entity';
import { Cita } from './entities/cita.entity';
import { BloqueoTemporal } from './entities/bloqueo-temporal.entity';
import { Cliente } from './entities/cliente.entity';

// Protege la separación entre el dominio, la lectura de ocupaciones y HTTP.
describe('M2-T004: composición base del motor', () => {
  it('registra el único controlador privado en el módulo HTTP', () => {
    const raiz = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule) as unknown[];
    expect(raiz).toEqual(expect.arrayContaining([
      DisponibilidadModule, DisponibilidadHttpModule,
    ]));
    const dominio = Reflect.getMetadata(MODULE_METADATA.IMPORTS, DisponibilidadModule) as unknown[];
    expect(dominio).toContain(OcupacionesModule);
    for (const modulo of [DisponibilidadModule, OcupacionesModule]) {
      expect(Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, modulo) ?? []).toEqual([]);
    }
    expect(Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, DisponibilidadHttpModule))
      .toEqual([DisponibilidadController]);
    // M04 incorpora un lector interno; ninguno de estos módulos publica escritores.
    expect(Reflect.getMetadata(MODULE_METADATA.PROVIDERS, DisponibilidadModule))
      .toContain(ConfiguracionAgendaService);
    expect(Reflect.getMetadata(MODULE_METADATA.PROVIDERS, DisponibilidadHttpModule))
      .toContain(RolesGuard);
    expect(Reflect.getMetadata(MODULE_METADATA.PROVIDERS, OcupacionesModule))
      .toContain(OcupacionesService);
  });

  it('mantiene la capa HTTP dependiente del dominio, sin ciclos', () => {
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, DisponibilidadHttpModule) as unknown[];
    expect(imports).toContain(DisponibilidadModule);
    expect(Reflect.getMetadata(MODULE_METADATA.IMPORTS, OcupacionesModule) ?? [])
      .not.toContain(DisponibilidadHttpModule);
    expect(Reflect.getMetadata(MODULE_METADATA.IMPORTS, DisponibilidadModule) ?? [])
      .not.toContain(DisponibilidadHttpModule);
  });

  it('registra las entidades persistidas del motor en el DataSource de la aplicación', () => {
    const imports = [DisponibilidadModule, OcupacionesModule]
      .flatMap((modulo) => (Reflect.getMetadata(MODULE_METADATA.IMPORTS, modulo) as unknown[]) ?? []);
    const repositorios = imports.flatMap((modulo) =>
      (modulo as { exports?: { provide?: string }[] }).exports ?? []);
    // forFeature registra metadatos con autoLoadEntities y publica estos repositorios.
    for (const entidad of [ConfiguracionAgenda, Cliente, Cita, BloqueoTemporal]) {
      expect(repositorios).toContainEqual(expect.objectContaining({
        provide: getRepositoryToken(entidad),
      }));
    }
  });
});
