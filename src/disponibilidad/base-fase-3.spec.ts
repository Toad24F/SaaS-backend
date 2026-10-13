import '../../test/setup-env';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { AppModule } from '../app.module';
import { DisponibilidadModule } from './disponibilidad.module';
import { DisponibilidadHttpModule } from './disponibilidad-http.module';
import { OcupacionesModule } from './ocupaciones.module';

// Protege la separación entre el dominio, la lectura de ocupaciones y HTTP.
describe('M2-T004: composición base del motor', () => {
  it('registra los tres módulos en la aplicación sin publicar controladores nuevos', () => {
    const raiz = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule) as unknown[];
    expect(raiz).toEqual(expect.arrayContaining([
      DisponibilidadModule, DisponibilidadHttpModule,
    ]));
    const dominio = Reflect.getMetadata(MODULE_METADATA.IMPORTS, DisponibilidadModule) as unknown[];
    expect(dominio).toContain(OcupacionesModule);
    for (const modulo of [DisponibilidadModule, DisponibilidadHttpModule, OcupacionesModule]) {
      expect(Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, modulo) ?? []).toEqual([]);
      expect(Reflect.getMetadata(MODULE_METADATA.PROVIDERS, modulo) ?? []).toEqual([]);
    }
  });

  it('mantiene la capa HTTP dependiente del dominio, sin ciclos', () => {
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, DisponibilidadHttpModule) as unknown[];
    expect(imports).toContain(DisponibilidadModule);
    expect(Reflect.getMetadata(MODULE_METADATA.IMPORTS, OcupacionesModule) ?? [])
      .not.toContain(DisponibilidadHttpModule);
    expect(Reflect.getMetadata(MODULE_METADATA.IMPORTS, DisponibilidadModule) ?? [])
      .not.toContain(DisponibilidadHttpModule);
  });
});
