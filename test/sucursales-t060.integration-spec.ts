import { conBaseMigrada } from './support/mariadb';
import { Sucursal } from '../src/sucursales/entities/sucursal.entity';
import { Sucursales1760000010000 } from '../src/database/migrations/1760000010000-Sucursales';
import { Servicios1760000011000 } from '../src/database/migrations/1760000011000-Servicios';
import { Profesionales1760000012000 } from '../src/database/migrations/1760000012000-Profesionales';
import { HorariosSemanales1760000013000 } from '../src/database/migrations/1760000013000-HorariosSemanales';
import { ExcepcionesHorario1760000014000 } from '../src/database/migrations/1760000014000-ExcepcionesHorario';
import { BloqueosHorario1760000015000 } from '../src/database/migrations/1760000015000-BloqueosHorario';
import { OfertaIndividual1760000018000 } from '../src/database/migrations/1760000018000-OfertaIndividual';
import { ConfiguracionAgenda1760000019000 } from '../src/database/migrations/1760000019000-ConfiguracionAgenda';
import { ClientesBase1760000020000 } from '../src/database/migrations/1760000020000-ClientesBase';
import { CitasCanonicas1760000021000 } from '../src/database/migrations/1760000021000-CitasCanonicas';
import { ApartadosCanonicos1760000022000 } from '../src/database/migrations/1760000022000-ApartadosCanonicos';
import { NombreUnicoServicios1760000024000 } from '../src/database/migrations/1760000024000-NombreUnicoServicios';
import { NombreUnicoSucursales1760000025000 } from '../src/database/migrations/1760000025000-NombreUnicoSucursales';
import { SesionesReservaPublica1760000026000 } from '../src/database/migrations/1760000026000-SesionesReservaPublica';
import { OperacionesApartado1760000027000 } from '../src/database/migrations/1760000027000-OperacionesApartado';
import { ContextoApartadosPublicos1760000028000 } from '../src/database/migrations/1760000028000-ContextoApartadosPublicos';
import { TelefonosCompartidos1760000029000 } from '../src/database/migrations/1760000029000-TelefonosCompartidos';
import { HistoriaCitasPublicas1760000030000 } from '../src/database/migrations/1760000030000-HistoriaCitasPublicas';
import { IntentosReservaPublica1760000031000 } from '../src/database/migrations/1760000031000-IntentosReservaPublica';
import { RelacionesReservaPublica1760000032000 } from '../src/database/migrations/1760000032000-RelacionesReservaPublica';

describe('M1-T060: migración incremental de sucursales', () => {
  it('instala restricciones tenant y conserva negocios previos al aplicar la migración', async () => {
    await conBaseMigrada(async (db, segunda) => {
      const existente = await db.query("INSERT INTO negocios (nombre, slug, email_contacto) VALUES ('Previo', 'previo-sucursal', 'previo@example.test')");
      // Los índices nuevos y las fuentes de fase 3 dependen de estas tablas;
      // se retiran y restauran junto con el esquema histórico que se prueba.
      const runner = db.createQueryRunner();
      try {
        // El portal depende de sucursales, citas y apartados: se retira primero.
        const portal = [new SesionesReservaPublica1760000026000(),
          new OperacionesApartado1760000027000(),
          new ContextoApartadosPublicos1760000028000(),
          new TelefonosCompartidos1760000029000(),
          new HistoriaCitasPublicas1760000030000(),
          new IntentosReservaPublica1760000031000(),
          new RelacionesReservaPublica1760000032000()];
        for (const migracion of [...portal].reverse()) await migracion.down(runner);
        await new NombreUnicoSucursales1760000025000().down(runner);
        await new NombreUnicoServicios1760000024000().down(runner);
        await new ApartadosCanonicos1760000022000().down(runner);
        await new CitasCanonicas1760000021000().down(runner);
        await new ClientesBase1760000020000().down(runner);
        await new ConfiguracionAgenda1760000019000().down(runner);
        await new OfertaIndividual1760000018000().down(runner);
        await new BloqueosHorario1760000015000().down(runner);
        await new ExcepcionesHorario1760000014000().down(runner);
        await new HorariosSemanales1760000013000().down(runner);
        await new Profesionales1760000012000().down(runner);
        await new Servicios1760000011000().down(runner);
        await new Sucursales1760000010000().down(runner);
        await new Sucursales1760000010000().up(runner);
        await new Servicios1760000011000().up(runner);
        await new Profesionales1760000012000().up(runner);
        await new HorariosSemanales1760000013000().up(runner);
        await new ExcepcionesHorario1760000014000().up(runner);
        await new BloqueosHorario1760000015000().up(runner);
        await new OfertaIndividual1760000018000().up(runner);
        await new ConfiguracionAgenda1760000019000().up(runner);
        await new ClientesBase1760000020000().up(runner);
        await new CitasCanonicas1760000021000().up(runner);
        await new ApartadosCanonicos1760000022000().up(runner);
        await new NombreUnicoServicios1760000024000().up(runner);
        await new NombreUnicoSucursales1760000025000().up(runner);
        // Restaura en orden para que la instalación final conserve todas las FKs.
        for (const migracion of portal) await migracion.up(runner);
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
