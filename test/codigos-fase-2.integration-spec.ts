import { createHash } from 'node:crypto';
import { CodigosService } from '../src/codigos/codigos.service';
import { DerivadorCodigo } from '../src/codigos/derivador-codigo';
import { PropositoCodigoAcceso } from '../src/codigos/entities/codigo-acceso.entity';
import { AuditoriaService } from '../src/auditoria/auditoria.service';
import { conBaseMigrada } from './support/mariadb';

describe('M1-T021–T024: invitación, emisión, reemplazo y consumo', () => {
  const derivador = new DerivadorCodigo({ 1: 'clave-larga-de-prueba-separada-del-jwt-123456' }, 1);
  const servicio = new CodigosService(new AuditoriaService(), derivador);

  async function escenario(db: { query: (sql: string, parametros?: unknown[]) => Promise<any> }) {
    const negocio = await db.query(`INSERT INTO negocios (nombre, slug, email_contacto)
      VALUES ('Uno', 'uno', 'uno@example.test')`);
    const ajeno = await db.query(`INSERT INTO negocios (nombre, slug, email_contacto)
      VALUES ('Dos', 'dos', 'dos@example.test')`);
    const actor = await db.query(`INSERT INTO usuarios
      (nombre, email, password_hash, rol, activado_en)
      VALUES ('Super', 'super@example.test', 'hash', 'superadmin', UTC_TIMESTAMP(6))`);
    const alta = await db.query(`INSERT INTO altas_administrador (negocio_id, correo)
      VALUES (?, 'admin@example.test')`, [negocio.insertId]);
    const usuario = await db.query(`INSERT INTO usuarios
      (negocio_id, nombre, email, password_hash, rol, activado_en)
      VALUES (?, 'Recepción', 'recepcion@example.test', 'hash', 'recepcionista', UTC_TIMESTAMP(6))`,
    [negocio.insertId]);
    return { negocioId: negocio.insertId as number, ajenoId: ajeno.insertId as number,
      actorId: actor.insertId as number, altaId: alta.insertId as number,
      usuarioId: usuario.insertId as number };
  }

  it('convierte códigos vigentes de fase 1 al instalar la migración sobre datos existentes', async () => {
    await conBaseMigrada(async (db) => {
      // Volvemos al esquema anterior para probar una actualización real con una emisión pendiente.
      // La bandeja depende de códigos; se revierten ambas para reproducir fase 1.
      await db.undoLastMigration();
      await db.undoLastMigration();
      const datos = await escenario(db);
      await db.query(`INSERT INTO codigos_acceso
        (negocio_id, usuario_id, emisor_usuario_id, proposito, codigo_hash, emitido_en, expira_en)
        VALUES (?, ?, ?, 'recuperacion', ?, UTC_TIMESTAMP(6), DATE_ADD(UTC_TIMESTAMP(6), INTERVAL 30 MINUTE))`,
      [datos.negocioId, datos.usuarioId, datos.actorId, createHash('sha256')
        .update('codigo-historico').digest('hex')]);
      await db.runMigrations({ transaction: 'each' });
      const [codigo] = await db.query(`SELECT legado_fase_1, usuario_id, alta_administrador_id,
        emision_id, nonce, clave_version FROM codigos_acceso`);
      expect(Number(codigo.legado_fase_1)).toBe(1);
      expect(codigo.usuario_id).toBe(datos.usuarioId);
      expect(codigo.alta_administrador_id).toBeNull();
      expect(codigo.emision_id).toBeNull();
      expect(codigo.nonce).toBeNull();
      expect(codigo.clave_version).toBeNull();
    });
  });

  it('migra exclusividad, pertenencia y una sola emisión vigente por destino', async () => {
    await conBaseMigrada(async (db) => {
      const datos = await escenario(db);
      const columnas = await db.query(`SELECT COLUMN_NAME AS nombre FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'codigos_acceso'`);
      expect(columnas.map((fila: { nombre: string }) => fila.nombre)).toEqual(expect.arrayContaining([
        'alta_administrador_id', 'destinatario_version', 'emision_id', 'nonce', 'clave_version',
      ]));
      const ahora = new Date('2026-09-27T18:00:00.000Z');
      const emitido = await db.transaction((manager) => servicio.emitir(manager, {
        negocioId: datos.negocioId, altaAdministradorId: datos.altaId,
        emisorUsuarioId: datos.actorId, proposito: PropositoCodigoAcceso.ACTIVACION_ADMIN,
        ahora,
      }));
      expect(emitido.expiraEn).toEqual(new Date('2026-09-29T18:00:00.000Z'));
      await expect(db.transaction((manager) => servicio.emitir(manager, {
        negocioId: datos.negocioId, altaAdministradorId: datos.altaId,
        emisorUsuarioId: datos.actorId, proposito: PropositoCodigoAcceso.ACTIVACION_ADMIN,
        ahora,
      }))).rejects.toBeDefined();
      await expect(db.query(`UPDATE codigos_acceso SET negocio_id = ? WHERE alta_administrador_id = ?`,
        [datos.ajenoId, datos.altaId])).rejects.toBeDefined();
      await expect(db.query(`UPDATE codigos_acceso SET usuario_id = ? WHERE alta_administrador_id = ?`,
        [datos.usuarioId, datos.altaId])).rejects.toBeDefined();
      await expect(db.query(`UPDATE codigos_acceso SET proposito = 'recuperacion'
        WHERE alta_administrador_id = ?`, [datos.altaId])).rejects.toBeDefined();
      await expect(db.query(`UPDATE codigos_acceso SET alta_administrador_id = NULL
        WHERE alta_administrador_id = ?`, [datos.altaId])).rejects.toBeDefined();
    });
  });

  it('reemplaza, valida correo y versión, consume una vez y revierte la operación fallida', async () => {
    await conBaseMigrada(async (db) => {
      const datos = await escenario(db);
      const ahora = new Date('2026-09-27T18:00:00.000Z');
      const emitir = () => db.transaction((manager) => servicio.emitir(manager, {
        negocioId: datos.negocioId, altaAdministradorId: datos.altaId,
        emisorUsuarioId: datos.actorId, proposito: PropositoCodigoAcceso.ACTIVACION_ADMIN, ahora,
      }));
      const primero = await emitir();
      const segundo = await db.transaction((manager) => servicio.reemplazarConManager(manager, {
        negocioId: datos.negocioId, altaAdministradorId: datos.altaId,
        emisorUsuarioId: datos.actorId, proposito: PropositoCodigoAcceso.ACTIVACION_ADMIN, ahora,
      }));
      const consumir = (codigo: string, correo: string, operacion = async () => undefined) =>
        servicio.consumir(db, { codigo, correo,
          proposito: PropositoCodigoAcceso.ACTIVACION_ADMIN, ahora }, operacion);
      await expect(consumir(primero.codigo, 'admin@example.test')).rejects.toThrow();
      await expect(consumir(segundo.codigo, 'otro@example.test')).rejects.toThrow();
      await expect(servicio.consumir(db, { codigo: segundo.codigo,
        correo: 'admin@example.test', proposito: PropositoCodigoAcceso.RECUPERACION, ahora },
      async () => undefined)).rejects.toThrow();
      await expect(consumir(segundo.codigo, 'admin@example.test', async () => {
        throw new Error('fallo controlado');
      })).rejects.toThrow('fallo controlado');
      expect((await db.query('SELECT consumido_en FROM codigos_acceso WHERE invalidado_en IS NULL'))[0]
        .consumido_en).toBeNull();
      await consumir(segundo.codigo, ' ADMIN@EXAMPLE.TEST ');
      await expect(consumir(segundo.codigo, 'admin@example.test')).rejects.toThrow();
      const fila = (await db.query('SELECT codigo_hash, nonce, emision_id, clave_version FROM codigos_acceso WHERE invalidado_en IS NULL'))[0];
      expect(fila.codigo_hash).toBe(createHash('sha256').update(segundo.codigo).digest('hex'));
      expect(JSON.stringify(fila)).not.toContain(segundo.codigo);
    });
  });

  it('recuperación usa cuenta, 30 minutos y versión de destinatario', async () => {
    await conBaseMigrada(async (db) => {
      const datos = await escenario(db);
      const ahora = new Date('2026-09-27T18:00:00.000Z');
      const emitido = await db.transaction((manager) => servicio.emitir(manager, {
        negocioId: datos.negocioId, usuarioId: datos.usuarioId,
        emisorUsuarioId: datos.actorId, proposito: PropositoCodigoAcceso.RECUPERACION, ahora,
      }));
      expect(emitido.expiraEn).toEqual(new Date('2026-09-27T18:30:00.000Z'));
      await expect(servicio.consumir(db, { codigo: emitido.codigo,
        correo: 'recepcion@example.test', proposito: PropositoCodigoAcceso.RECUPERACION,
        ahora: emitido.expiraEn }, async () => undefined)).rejects.toThrow();
      await db.query('UPDATE usuarios SET correo_version = correo_version + 1 WHERE id = ?',
        [datos.usuarioId]);
      await expect(servicio.consumir(db, { codigo: emitido.codigo,
        correo: 'recepcion@example.test', proposito: PropositoCodigoAcceso.RECUPERACION,
        ahora }, async () => undefined)).rejects.toThrow();
      expect((await db.query('SELECT consumido_en FROM codigos_acceso WHERE usuario_id = ?',
        [datos.usuarioId]))[0].consumido_en).toBeNull();
    });
  });
});
