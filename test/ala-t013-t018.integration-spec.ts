import { conBaseMigrada } from './support/mariadb';

async function crearNegocioLicencia(db: { query: (sql: string, valores?: unknown[]) => Promise<any> }, sufijo: string) {
  const negocio = Number((await db.query('INSERT INTO negocios (nombre,slug,email_contacto) VALUES (?,?,?)',
    [`Negocio ${sufijo}`, `ala-lic-${sufijo}`, `${sufijo}@example.test`])).insertId);
  const licencia = Number((await db.query(`INSERT INTO licencias
    (negocio_id,habilitada_en,vence_en,remanente_ms,version_vencimiento)
    VALUES (?,UTC_TIMESTAMP(6),DATE_ADD(UTC_TIMESTAMP(6), INTERVAL 1 YEAR),?,1)`,
  [negocio, '90000000'])).insertId);
  return { negocio, licencia };
}

describe('ALA-T013–T018: migraciones y restricciones de licencia/correo', () => {
  it('preserva fechas y remanente al actualizar; acepta 0/30 y rechaza -1/31', async () => {
    await conBaseMigrada(async (db) => {
      const nombres = ['PlazoCicloSuspension1760000036000',
        'OperacionesLicencia1760000037000', 'ReferenciasCorreoLicencia1760000038000'];
      expect(nombres.every((nombre) => db.migrations.some((m) => m.name === nombre))).toBe(true);
      // Simula una instalación previa con datos antes de aplicar las nuevas migraciones.
      for (const _ of nombres) await db.undoLastMigration();
      const ids = await crearNegocioLicencia(db, 'previo');
      await db.query(`UPDATE licencias SET
        suspension_solicitada_en=DATE_ADD(habilitada_en, INTERVAL 1 DAY),
        bloqueo_programado_en=DATE_ADD(habilitada_en, INTERVAL 3 DAY),
        suspendida_en=DATE_ADD(habilitada_en, INTERVAL 3 DAY),
        congelada_en=DATE_ADD(habilitada_en, INTERVAL 3 DAY)
        WHERE id=?`, [ids.licencia]);
      await db.query(`INSERT INTO envios_correo
        (negocio_id,tipo,correo_destinatario,clave_dedupe,licencia_id,
         version_vencimiento,proximo_intento_en)
        VALUES (?,'aviso_vencimiento','previo@example.test','aviso-previo',?,1,UTC_TIMESTAMP(6))`,
      [ids.negocio, ids.licencia]);
      const [antes] = await db.query(`SELECT habilitada_en,vence_en,suspendida_en,
        suspension_solicitada_en,bloqueo_programado_en,congelada_en,
        remanente_ms,version_vencimiento FROM licencias WHERE id=?`, [ids.licencia]);
      await db.runMigrations({ transaction: 'each' });
      const [despues] = await db.query(`SELECT habilitada_en,vence_en,suspendida_en,
        suspension_solicitada_en,bloqueo_programado_en,congelada_en,
        remanente_ms,version_vencimiento,plazo_suspension_dias,version_suspension
        FROM licencias WHERE id=?`, [ids.licencia]);
      for (const campo of ['habilitada_en', 'vence_en', 'suspendida_en',
        'suspension_solicitada_en', 'bloqueo_programado_en', 'congelada_en',
        'remanente_ms', 'version_vencimiento']) {
        expect(String(despues[campo])).toBe(String(antes[campo]));
      }
      expect(despues.plazo_suspension_dias).toBeNull();
      expect(despues.version_suspension).toBe(0);
      const [correoPrevio] = await db.query(`SELECT tipo,clave_dedupe,umbral_dias,
        version_suspension,operacion_licencia_id FROM envios_correo WHERE clave_dedupe='aviso-previo'`);
      expect(correoPrevio).toMatchObject({ tipo: 'aviso_vencimiento',
        clave_dedupe: 'aviso-previo', umbral_dias: null,
        version_suspension: null, operacion_licencia_id: null });
      for (const plazo of [0, 30]) {
        await db.query('UPDATE licencias SET plazo_suspension_dias=? WHERE id=?', [plazo, ids.licencia]);
        expect((await db.query('SELECT plazo_suspension_dias FROM licencias WHERE id=?', [ids.licencia]))[0].plazo_suspension_dias).toBe(plazo);
      }
      for (const plazo of [-1, 31]) {
        await expect(db.query('UPDATE licencias SET plazo_suspension_dias=? WHERE id=?', [plazo, ids.licencia])).rejects.toBeDefined();
      }
    });
  });

  it('impide repetir clave y cruzar negocio/licencia en operaciones', async () => {
    await conBaseMigrada(async (db) => {
      const a = await crearNegocioLicencia(db, 'a');
      const b = await crearNegocioLicencia(db, 'b');
      const actor = Number((await db.query(`INSERT INTO usuarios
        (nombre,email,password_hash,rol,activo,activado_en,creado_en)
        VALUES ('Superadmin','ala-super@example.test','hash','superadmin',1,UTC_TIMESTAMP(6),UTC_TIMESTAMP(6))`)).insertId);
      const insertar = (negocio: number, licencia: number, clave: string) => db.query(`INSERT INTO operaciones_licencia
        (negocio_id,licencia_id,actor_id,clave,accion,parametros_hash,resultado_reducido)
        VALUES (?,?,?,?,'renovar',?,?)`, [negocio, licencia, actor, clave, 'a'.repeat(64), '{"estado":"vigente"}']);
      await insertar(a.negocio, a.licencia, 'clave-operacion-0001');
      await expect(insertar(a.negocio, a.licencia, 'clave-operacion-0001')).rejects.toBeDefined();
      await expect(insertar(a.negocio, b.licencia, 'clave-operacion-0002')).rejects.toBeDefined();
      await insertar(b.negocio, b.licencia, 'clave-operacion-0001');
      expect(Number((await db.query('SELECT COUNT(*) total FROM operaciones_licencia'))[0].total)).toBe(2);
    });
  });

  it('acepta referencias por tipo y rechaza mezclas, umbrales inválidos y duplicados', async () => {
    await conBaseMigrada(async (db) => {
      const { negocio, licencia } = await crearNegocioLicencia(db, 'correo');
      const actor = Number((await db.query(`INSERT INTO usuarios
        (nombre,email,password_hash,rol,activo,activado_en,creado_en)
        VALUES ('Superadmin','ala-correo-super@example.test','hash','superadmin',1,UTC_TIMESTAMP(6),UTC_TIMESTAMP(6))`)).insertId);
      const operacion = Number((await db.query(`INSERT INTO operaciones_licencia
        (negocio_id,licencia_id,actor_id,clave,accion,parametros_hash,resultado_reducido)
        VALUES (?,?,?,'clave-correo-0001','renovar',?,'{}')`,
      [negocio, licencia, actor, 'b'.repeat(64)])).insertId);
      const ajena = await crearNegocioLicencia(db, 'correo-ajeno');
      const operacionAjena = Number((await db.query(`INSERT INTO operaciones_licencia
        (negocio_id,licencia_id,actor_id,clave,accion,parametros_hash,resultado_reducido)
        VALUES (?,?,?,'clave-correo-ajena','renovar',?,'{}')`,
      [ajena.negocio, ajena.licencia, actor, 'c'.repeat(64)])).insertId);
      const insertar = (tipo: string, clave: string, version: number | null,
        umbral: number | null, ciclo: number | null, operacionId: number | null) => db.query(`INSERT INTO envios_correo
        (negocio_id,tipo,correo_destinatario,clave_dedupe,licencia_id,
         version_vencimiento,umbral_dias,version_suspension,operacion_licencia_id,proximo_intento_en)
        VALUES (?,?,?, ?,?,?,?,?,?,UTC_TIMESTAMP(6))`,
      [negocio, tipo, 'admin@example.test', clave, licencia, version, umbral, ciclo, operacionId]);
      const validos: Array<[string, number | null, number | null, number | null, number | null]> = [
        ['aviso_vencimiento', 1, null, null, null],
        ['aviso_preventivo', 1, 15, null, null],
        ['aviso_preventivo', 1, 7, null, null],
        ['licencia_vencida', 1, null, null, null],
        ['suspension_programada', null, null, 1, null],
        ['suspension_efectiva', null, null, 1, null],
        ['suspension_inmediata', null, null, 1, null],
        ['suspension_revocada', null, null, null, operacion],
        ['licencia_reactivada', null, null, null, operacion],
        ['licencia_renovada', null, null, null, operacion],
      ];
      for (const [indice, [tipo, version, umbral, ciclo, op]] of validos.entries()) {
        await insertar(tipo, `ala-aviso-${indice}`, version, umbral, ciclo, op);
      }
      for (const [tipo, version, umbral, ciclo, op] of [
        ['aviso_preventivo', 1, 2, null, null],
        ['aviso_preventivo', 1, null, null, null],
        ['suspension_programada', 1, null, 1, null],
        ['suspension_efectiva', null, null, null, null],
        ['licencia_renovada', null, null, null, null],
        ['licencia_vencida', 1, 7, null, null],
      ] as Array<[string, number | null, number | null, number | null, number | null]>) {
        await expect(insertar(tipo, `ala-invalido-${tipo}-${String(umbral)}`, version, umbral, ciclo, op)).rejects.toBeDefined();
      }
      await expect(insertar('licencia_vencida', 'ala-aviso-3', 1, null, null, null)).rejects.toBeDefined();
      // La operación ajena no satisface la FK triple negocio/licencia/operación.
      await expect(insertar('licencia_renovada', 'ala-ajena', null, null, null, operacionAjena)).rejects.toBeDefined();
      expect(Number((await db.query('SELECT COUNT(*) total FROM envios_correo'))[0].total)).toBe(validos.length);
    });
  });
});
