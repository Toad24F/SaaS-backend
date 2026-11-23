import { conBaseOperativa, crearEscenarioOperativo } from './support/operacion-fase-5';
import { RelojPrueba } from './support/reloj';
import { retrocederHastaMigracion, limitarMigracionesHasta } from './support/mariadb';
import { CanalWhatsapp } from '../src/automatizaciones/entities/canal-whatsapp.entity';
import { EnvioWhatsapp } from '../src/automatizaciones/entities/envio-whatsapp.entity';
import { EventoWhatsapp } from '../src/automatizaciones/entities/evento-whatsapp.entity';
import { AccionConfirmacion } from '../src/automatizaciones/entities/accion-confirmacion.entity';

const ahora = new Date('2026-11-22T12:00:00.000Z');
const despues = new Date('2026-11-23T12:00:00.000Z');

describe('M5-T059–T062: persistencia durable de WhatsApp', () => {
  it('alinea cuatro entidades con DDL y actualiza sin modificar citas previas', async () => {
    await conBaseOperativa(async db => {
      for (const entidad of [CanalWhatsapp, EnvioWhatsapp, EventoWhatsapp, AccionConfirmacion]) {
        const meta = db.getMetadata(entidad);
        const columnas = await db.query(`SHOW COLUMNS FROM ${meta.tableName}`);
        expect(meta.columns.map(columna => columna.databaseName).sort())
          .toEqual(columnas.map((columna: { Field: string }) => columna.Field).sort());
      }
      await retrocederHastaMigracion(db, 'ActoresEventosCita1760000057000');
      // Este caso comprueba el corte histórico T059–T062, previo a las políticas T070–T072.
      limitarMigracionesHasta(db, 'AccionesConfirmacion1760000061000');
      const { negocios: [a] } = await crearEscenarioOperativo(db, new RelojPrueba(ahora));
      const cita = (await db.query('SELECT * FROM citas WHERE id=?', [a.ocupaciones[0]]))[0];
      expect((await db.runMigrations({ transaction: 'each' })).map(migracion => migracion.name))
        .toEqual(['CanalesWhatsapp1760000058000', 'EnviosWhatsapp1760000059000',
          'EventosWhatsapp1760000060000', 'AccionesConfirmacion1760000061000']);
      expect((await db.query('SELECT * FROM citas WHERE id=?', [a.ocupaciones[0]]))[0]).toEqual(cita);
      for (const tabla of ['canales_whatsapp', 'envios_whatsapp', 'eventos_whatsapp', 'acciones_confirmacion']) {
        expect((await db.query(`SELECT COUNT(*) total FROM ${tabla}`))[0].total).toBe('0');
      }
    });
  });

  it('T059 permite un canal por negocio y solo una referencia a secreto externo', async () => {
    await conBaseOperativa(async db => {
      const { negocios: [a, b] } = await crearEscenarioOperativo(db, new RelojPrueba(ahora));
      await db.query(`INSERT INTO canales_whatsapp
        (negocio_id,remitente_externo_id,secreto_ref) VALUES (?,?,?)`,
      [a.id, 'phone-A', 'secret://whatsapp/negocio-a']);
      await expect(db.query(`INSERT INTO canales_whatsapp
        (negocio_id,remitente_externo_id,secreto_ref) VALUES (?,?,?)`,
      [a.id, 'phone-B', 'secret://whatsapp/otro'])).rejects.toThrow();
      await expect(db.query(`INSERT INTO canales_whatsapp
        (negocio_id,remitente_externo_id,secreto_ref) VALUES (?,?,?)`,
      [b.id, 'phone-A', 'secret://whatsapp/negocio-b'])).rejects.toThrow();
      await expect(db.query(`INSERT INTO canales_whatsapp
        (negocio_id,remitente_externo_id,secreto_ref) VALUES (?,?,?)`,
      [b.id, 'phone-B', 'Bearer token-utilizable'])).rejects.toThrow();
      expect((await db.query('SHOW COLUMNS FROM canales_whatsapp')).map((fila: { Field: string }) => fila.Field))
        .not.toEqual(expect.arrayContaining(['token', 'password', 'credencial']));
    });
  });

  it('T060 conserva un efecto por generación/tipo y exige lease completo', async () => {
    await conBaseOperativa(async db => {
      const { negocios: [a, b] } = await crearEscenarioOperativo(db, new RelojPrueba(ahora));
      await db.query(`INSERT INTO canales_whatsapp
        (negocio_id,remitente_externo_id,secreto_ref) VALUES (?,?,?)`,
      [a.id, 'phone-A', 'secret://whatsapp/negocio-a']);
      await db.query(`INSERT INTO condiciones_confirmacion_cita
        (negocio_id,cita_id,generacion,categoria,instante_base)
        VALUES (?,?,1,'normal',?)`, [a.id, a.ocupaciones[0], ahora]);
      const insertar = (negocio: number, cita: number, generacion: number, clave: string,
        tipo = 'inicial_pendiente') => db.query(`INSERT INTO envios_whatsapp
        (negocio_id,cita_id,generacion,tipo,clave_efecto,programado_en,util_hasta,
         proximo_intento_en,destino_e164,parametros_plantilla)
        VALUES (?,?,?,?,?,?,?,?,?,'{}')`,
      [negocio, cita, generacion, tipo, clave, ahora, despues, ahora, '+526141234567']);
      const envio = await insertar(a.id, a.ocupaciones[0], 1, 'efecto-001');
      expect((await db.query('SELECT estado,intentos,arrendamiento_id FROM envios_whatsapp WHERE id=?', [envio.insertId]))[0])
        .toMatchObject({ estado: 'pendiente', intentos: 0, arrendamiento_id: null });
      await expect(insertar(a.id, a.ocupaciones[0], 1, 'efecto-002')).rejects.toThrow();
      await expect(insertar(a.id, a.ocupaciones[0], 2, 'efecto-003')).rejects.toThrow();
      await expect(insertar(b.id, a.ocupaciones[0], 1, 'efecto-004')).rejects.toThrow();
      await expect(db.query("UPDATE envios_whatsapp SET estado='en_proceso' WHERE id=?", [envio.insertId])).rejects.toThrow();
      await db.query(`UPDATE envios_whatsapp SET estado='en_proceso',arrendamiento_id=?,arrendado_hasta=? WHERE id=?`,
        ['12345678-1234-1234-1234-123456789abc', despues, envio.insertId]);
      expect((await db.query('SHOW INDEX FROM envios_whatsapp')).map((fila: { Key_name: string }) => fila.Key_name))
        .toEqual(expect.arrayContaining(['idx_ew_trabajo', 'idx_ew_cita', 'uq_ew_clave_efecto']));
    });
  });

  it('T061 deduplica la recepción y separa hora del proveedor de hora local', async () => {
    await conBaseOperativa(async db => {
      const { negocios: [a] } = await crearEscenarioOperativo(db, new RelojPrueba(ahora));
      await db.query(`INSERT INTO canales_whatsapp
        (negocio_id,remitente_externo_id,secreto_ref) VALUES (?,?,?)`,
      [a.id, 'phone-A', 'secret://whatsapp/negocio-a']);
      const guardar = () => db.query(`INSERT INTO eventos_whatsapp
        (negocio_id,huella_evento,mensaje_externo_id,tipo,recibido_en,proveedor_en)
        VALUES (?,?,?,?,?,?)`, [a.id, 'a'.repeat(64), 'wamid.123', 'entregado', despues, ahora]);
      await guardar();
      await expect(guardar()).rejects.toThrow();
      expect((await db.query('SELECT recibido_en,proveedor_en,estado_procesamiento FROM eventos_whatsapp'))[0])
        .toMatchObject({ recibido_en: despues, proveedor_en: ahora, estado_procesamiento: 'pendiente' });
    });
  });

  it('T062 guarda solo hash y ata la acción al envío y generación propios', async () => {
    await conBaseOperativa(async db => {
      const { negocios: [a, b] } = await crearEscenarioOperativo(db, new RelojPrueba(ahora));
      await db.query(`INSERT INTO canales_whatsapp
        (negocio_id,remitente_externo_id,secreto_ref) VALUES (?,?,?)`,
      [a.id, 'phone-A', 'secret://whatsapp/negocio-a']);
      await db.query(`INSERT INTO condiciones_confirmacion_cita
        (negocio_id,cita_id,generacion,categoria,instante_base)
        VALUES (?,?,1,'normal',?)`, [a.id, a.ocupaciones[0], ahora]);
      const envio = await db.query(`INSERT INTO envios_whatsapp
        (negocio_id,cita_id,generacion,tipo,clave_efecto,programado_en,util_hasta,
         proximo_intento_en,destino_e164,parametros_plantilla)
        VALUES (?,?,1,'inicial_pendiente','efecto-001',?,?,?,'+526141234567','{}')`,
      [a.id, a.ocupaciones[0], ahora, despues, ahora]);
      const guardar = (negocio: number, cita: number, generacion: number, hash: string) => db.query(`INSERT INTO acciones_confirmacion
        (negocio_id,cita_id,generacion,envio_id,token_hash,expira_en)
        VALUES (?,?,?,?,?,?)`, [negocio, cita, generacion, envio.insertId, hash, despues]);
      const accion = await guardar(a.id, a.ocupaciones[0], 1, 'b'.repeat(64));
      const recordatorio = await db.query(`INSERT INTO envios_whatsapp
        (negocio_id,cita_id,generacion,tipo,clave_efecto,programado_en,util_hasta,
         proximo_intento_en,destino_e164,parametros_plantilla)
        VALUES (?,?,1,'recordatorio','efecto-002',?,?,?,'+526141234567','{}')`,
      [a.id, a.ocupaciones[0], ahora, despues, ahora]);
      await expect(db.query(`INSERT INTO acciones_confirmacion
        (negocio_id,cita_id,generacion,envio_id,token_hash,expira_en)
        VALUES (?,?,?,?,?,?)`, [a.id, a.ocupaciones[0], 1, recordatorio.insertId, 'e'.repeat(64), despues])).rejects.toThrow();
      expect((await db.query('SELECT consumido_en FROM acciones_confirmacion WHERE id=?', [accion.insertId]))[0].consumido_en).toBeNull();
      await expect(guardar(a.id, a.ocupaciones[0], 1, 'b'.repeat(64))).rejects.toThrow();
      await expect(guardar(a.id, a.ocupaciones[0], 2, 'c'.repeat(64))).rejects.toThrow();
      await expect(guardar(b.id, a.ocupaciones[0], 1, 'd'.repeat(64))).rejects.toThrow();
      await db.query('UPDATE acciones_confirmacion SET consumido_en=? WHERE id=?', [despues, accion.insertId]);
      expect((await db.query('SELECT consumido_en FROM acciones_confirmacion WHERE id=?', [accion.insertId]))[0].consumido_en).toEqual(despues);
      expect((await db.query('SHOW COLUMNS FROM acciones_confirmacion')).map((fila: { Field: string }) => fila.Field))
        .not.toEqual(expect.arrayContaining(['token', 'payload']));
    });
  });
});
