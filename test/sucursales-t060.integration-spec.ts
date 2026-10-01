import { conBaseMigrada } from './support/mariadb';
import { Sucursal } from '../src/sucursales/entities/sucursal.entity';
import { Sucursales1760000010000 } from '../src/database/migrations/1760000010000-Sucursales';
import { Servicios1760000011000 } from '../src/database/migrations/1760000011000-Servicios';
import { Profesionales1760000012000 } from '../src/database/migrations/1760000012000-Profesionales';

describe('M1-T060: migración incremental de sucursales', () => {
  it('instala restricciones tenant y conserva negocios previos al aplicar la migración', async () => {
    await conBaseMigrada(async (db, segunda) => {
      const existente = await db.query("INSERT INTO negocios (nombre, slug, email_contacto) VALUES ('Previo', 'previo-sucursal', 'previo@example.test')");
      // Las relaciones de perfiles dependen de sucursales y servicios; se revierten
      // primero y se restauran después para ensayar el incremento de sucursales.
      const runner = db.createQueryRunner();
      try {
        await new Profesionales1760000012000().down(runner);
        await new Servicios1760000011000().down(runner);
        await new Sucursales1760000010000().down(runner);
        await new Sucursales1760000010000().up(runner);
        await new Servicios1760000011000().up(runner);
        await new Profesionales1760000012000().up(runner);
      } finally { await runner.release(); }
      expect(await db.query('SELECT id FROM negocios WHERE id = ?', [existente.insertId]))
        .toHaveLength(1);
      const columnas = await db.query('SHOW COLUMNS FROM sucursales');
      expect(columnas.map((fila: { Field: string }) => fila.Field)).toEqual(expect.arrayContaining([
        'negocio_id', 'nombre', 'direccion', 'telefono', 'zona_horaria',
        'url_google_maps', 'notas_llegada', 'activo',
      ]));
      const indices = await db.query('SHOW INDEX FROM sucursales');
      expect(indices.map((fila: { Key_name: string }) => fila.Key_name))
        .toEqual(expect.arrayContaining(['idx_sucursales_negocio_activo', 'uq_sucursales_negocio_id']));
      const sucursal = await db.getRepository(Sucursal).save({ negocioId: Number(existente.insertId),
        nombre: 'Centro', direccion: 'Calle Uno', telefono: '6141234567',
        zonaHoraria: 'America/Chihuahua', urlGoogleMaps: null, notasLlegada: null, activo: true });
      expect(sucursal.id).toBeGreaterThan(0);
      // La base conserva el valor inicial de activo aunque un escritor no lo indique.
      const otra = await db.query(`INSERT INTO sucursales
        (negocio_id, nombre, direccion, telefono, zona_horaria)
        VALUES (?, 'Norte', 'Calle Dos', '6141234567', 'UTC')`, [existente.insertId]);
      expect((await db.query('SELECT activo FROM sucursales WHERE id = ?', [otra.insertId]))[0].activo).toBe(1);
      await expect(db.query("INSERT INTO sucursales (negocio_id, nombre, direccion, telefono, zona_horaria) VALUES (4294967294, 'Ajena', 'Calle', '6141234567', 'UTC')"))
        .rejects.toBeDefined();
      await expect(db.query("INSERT INTO sucursales (negocio_id, nombre, direccion, telefono, zona_horaria) VALUES (?, '  ', 'Calle', '6141234567', 'UTC')", [existente.insertId]))
        .rejects.toBeDefined();
      for (const indice of [2, 3, 4]) {
        const valores: (string | number | null)[] = [existente.insertId, 'Incompleta', 'Calle', '6141234567', 'UTC'];
        valores[indice] = null;
        await expect(db.query(`INSERT INTO sucursales
          (negocio_id, nombre, direccion, telefono, zona_horaria)
          VALUES (?, ?, ?, ?, ?)`, valores)).rejects.toBeDefined();
      }
      expect(await segunda.runMigrations({ transaction: 'each' })).toEqual([]);
      expect(await segunda.getRepository(Sucursal).countBy({ negocioId: Number(existente.insertId) })).toBe(2);
    });
  });
});
