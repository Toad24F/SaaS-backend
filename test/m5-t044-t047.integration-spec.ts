import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { AutorizacionService } from '../src/auth/services/autorizacion.service';
import { COLORES_PREDETERMINADOS_PORTAL } from '../src/personalizacion-portal/colores-portal';
import { PersonalizacionPortal } from '../src/personalizacion-portal/entities/personalizacion-portal.entity';
import { RecursoPortal } from '../src/personalizacion-portal/entities/recurso-portal.entity';
import { PersonalizacionPortalService } from '../src/personalizacion-portal/personalizacion-portal.service';
import { conBaseMigrada } from './support/mariadb';
import { crearDatosModulo5 } from './support/preparacion-modulo-5';

const instante = new Date('2026-11-22T14:00:00.000Z');
const reloj = { ahora: () => instante };
const expiraEn = new Date('2026-11-23T14:00:00.000Z');

async function crearPng() {
  return sharp({ create: { width: 12, height: 8, channels: 4, background: '#33669980' } }).png().toBuffer();
}

describe('M5-T044–T047 · Persistencia de personalización del portal', () => {
  it('separa recursos por negocio y exige una sola configuración versionada por negocio', async () => {
    await conBaseMigrada(async (db) => {
      const { negocios: [a, b] } = await crearDatosModulo5(db, reloj);
      const servicio = new PersonalizacionPortalService(db, reloj, new AutorizacionService());
      const logo = await servicio.guardarLogoProvisional(a.administradorId, 0, await crearPng(), 'image/png');
      const config = db.getRepository(PersonalizacionPortal);
      const configuracion = { version: 1, ...COLORES_PREDETERMINADOS_PORTAL, logoId: logo.id };

      // La FK compuesta impide referenciar un logo ajeno aunque el UUID exista.
      await expect(config.insert({ negocioId: b.id, ...configuracion })).rejects.toThrow(/fk_personalizacion_portal_logo/i);
      await config.insert({ negocioId: a.id, ...configuracion });
      await expect(config.insert({ negocioId: a.id, ...configuracion })).rejects.toThrow(/duplicate/i);
      await expect(config.insert({ negocioId: b.id, ...configuracion, logoId: null, version: 0 }))
        .rejects.toThrow(/chk_personalizacion_portal_version/i);
      await expect(config.insert({ negocioId: b.id, ...configuracion, logoId: null, texto: 'red' }))
        .rejects.toThrow(/chk_personalizacion_portal_colores/i);
      expect(await config.findOneBy({ negocioId: a.id })).toMatchObject(configuracion);
      expect(await config.countBy({ negocioId: b.id })).toBe(0);
    }, 'citas_m5_test');
  });

  it('guarda el raster provisional 24 horas y conserva el logo y versión publicados', async () => {
    await conBaseMigrada(async (db) => {
      const { negocios: [a] } = await crearDatosModulo5(db, reloj);
      const servicio = new PersonalizacionPortalService(db, reloj, new AutorizacionService());
      const png = await crearPng();
      const anterior = await servicio.guardarLogoProvisional(a.administradorId, 0, png, 'image/png');
      const config = db.getRepository(PersonalizacionPortal);
      const publicado = { negocioId: a.id, version: 1, ...COLORES_PREDETERMINADOS_PORTAL, logoId: anterior.id };
      await config.insert(publicado);

      await expect(servicio.guardarLogoProvisional(a.administradorId, 0, png, 'image/png')).rejects.toThrow('versión');
      await expect(servicio.guardarLogoProvisional(a.administradorId, 1, Buffer.from('imagen inválida'), 'image/png'))
        .rejects.toThrow('formato');
      const nuevo = await servicio.guardarLogoProvisional(a.administradorId, 1, png, 'image/png');
      const recursos = db.getRepository(RecursoPortal);
      const fila = await recursos.findOneByOrFail({ negocioId: a.id, id: nuevo.id });
      expect(nuevo).toEqual({ id: expect.any(String), expiraEn });
      expect(nuevo.id).not.toBe(anterior.id);
      expect(fila).toMatchObject({ ancho: 12, alto: 8, mime: 'image/webp', creadoEn: instante, expiraEn });
      expect(await sharp(fila.contenido).metadata()).toMatchObject({ format: 'webp', width: 12, height: 8 });
      expect(await config.findOneBy({ negocioId: a.id })).toMatchObject(publicado);
      expect(await recursos.countBy({ negocioId: a.id })).toBe(2);
    }, 'citas_m5_test');
  });

  it('rechaza roles ajenos y verifica los límites persistidos del recurso', async () => {
    await conBaseMigrada(async (db) => {
      const { negocios: [a] } = await crearDatosModulo5(db, reloj);
      const servicio = new PersonalizacionPortalService(db, reloj, new AutorizacionService());
      const png = await crearPng();
      await expect(servicio.guardarLogoProvisional(a.profesionalId, 0, png, 'image/png')).rejects.toThrow('privilegios');
      await expect(servicio.guardarLogoProvisional(a.recepcionistaId, 0, png, 'image/png')).rejects.toThrow('privilegios');
      const recursos = db.getRepository(RecursoPortal);
      expect(await recursos.count()).toBe(0);
      await expect(recursos.insert({ negocioId: a.id, id: randomUUID(), contenido: png, mime: 'image/png',
        ancho: 2049, alto: 8, creadoEn: instante, expiraEn })).rejects.toThrow(/chk_recursos_portal_dimensiones/i);
    }, 'citas_m5_test');
  });
});
