import { conBaseMigrada } from './support/mariadb';

describe('M1-T015–T016: restricciones de cuenta y destinos de auditoría', () => {
  it('admite Profesional completo y rechaza rol o pertenencia inválidos', async () => {
    await conBaseMigrada(async (db) => {
      const negocio = await db.query(`INSERT INTO negocios (nombre, slug, email_contacto)
        VALUES ('Uno', 'uno', 'uno@example.test')`);
      const id = negocio.insertId as number;
      await db.query(`INSERT INTO usuarios
        (negocio_id, nombre, email, password_hash, rol, activado_en)
        VALUES (?, 'Profesional', 'pro@example.test', 'hash', 'profesional', UTC_TIMESTAMP(6))`, [id]);
      await expect(db.query(`INSERT INTO usuarios
        (negocio_id, nombre, email, password_hash, rol, activado_en)
        VALUES (NULL, 'Ajeno', 'ajeno@example.test', 'hash', 'profesional', UTC_TIMESTAMP(6))`))
        .rejects.toBeDefined();
      await expect(db.query(`INSERT INTO usuarios
        (negocio_id, nombre, email, password_hash, rol, activado_en)
        VALUES (?, 'Incompleto', 'incompleto@example.test', NULL, 'profesional', UTC_TIMESTAMP(6))`, [id]))
        .rejects.toBeDefined();
      await expect(db.query(`INSERT INTO usuarios
        (negocio_id, nombre, email, password_hash, rol, activado_en)
        VALUES (?, 'Falso', 'falso@example.test', 'hash', 'inventado', UTC_TIMESTAMP(6))`, [id]))
        .rejects.toBeDefined();
    });
  });

  it('conserva un administrador por negocio y admite titular de reserva', async () => {
    await conBaseMigrada(async (db) => {
      const negocio = await db.query(`INSERT INTO negocios (nombre, slug, email_contacto)
        VALUES ('Uno', 'uno', 'uno@example.test')`);
      const id = negocio.insertId as number;
      const admin = await db.query(`INSERT INTO usuarios
        (negocio_id, nombre, email, password_hash, rol, activado_en)
        VALUES (?, 'Admin', 'admin@example.test', 'hash', 'admin_negocio', UTC_TIMESTAMP(6))`, [id]);
      await db.query(`INSERT INTO correos_acceso (correo, usuario_id)
        VALUES ('admin@example.test', ?)`, [admin.insertId]);
      // La reserva debe corresponder al correo del usuario, no solo a su ID.
      await expect(db.query(`INSERT INTO correos_acceso (correo, usuario_id)
        VALUES ('distinto@example.test', ?)`, [admin.insertId])).rejects.toBeDefined();
      await expect(db.query(`INSERT INTO usuarios
        (negocio_id, nombre, email, password_hash, rol, activado_en)
        VALUES (?, 'Otro', 'otro@example.test', 'hash', 'admin_negocio', UTC_TIMESTAMP(6))`, [id]))
        .rejects.toBeDefined();
    });
  });

  it('audita alta pendiente y rechaza una de otro negocio', async () => {
    await conBaseMigrada(async (db) => {
      const uno = await db.query(`INSERT INTO negocios (nombre, slug, email_contacto)
        VALUES ('Uno', 'uno', 'uno@example.test')`);
      const dos = await db.query(`INSERT INTO negocios (nombre, slug, email_contacto)
        VALUES ('Dos', 'dos', 'dos@example.test')`);
      const actor = await db.query(`INSERT INTO usuarios
        (nombre, email, password_hash, rol, activado_en)
        VALUES ('Super', 'super@example.test', 'hash', 'superadmin', UTC_TIMESTAMP(6))`);
      const alta = await db.query(`INSERT INTO altas_administrador (negocio_id, correo)
        VALUES (?, 'admin@example.test')`, [uno.insertId]);
      await expect(db.query(`INSERT INTO correos_acceso (correo, alta_administrador_id)
        VALUES ('otro@example.test', ?)`, [alta.insertId])).rejects.toBeDefined();
      const evento = (negocioId: number, operacionId: string) => db.query(`INSERT INTO eventos_auditoria
        (operacion_id, actor_usuario_id, negocio_id, alta_administrador_id, accion)
        VALUES (?, ?, ?, ?, 'alta_pendiente')`,
      [operacionId, actor.insertId, negocioId, alta.insertId]);
      await evento(uno.insertId, '11111111-1111-4111-8111-111111111111');
      await expect(evento(dos.insertId, '22222222-2222-4222-8222-222222222222'))
        .rejects.toBeDefined();
      // Los dominios posteriores usan un par tipado y siempre identifican negocio.
      await db.query(`INSERT INTO eventos_auditoria
        (operacion_id, actor_usuario_id, negocio_id, recurso_tipo, recurso_id, accion)
        VALUES ('33333333-3333-4333-8333-333333333333', ?, ?, 'servicio', 1, 'servicio_creado')`,
      [actor.insertId, uno.insertId]);
      await expect(db.query(`INSERT INTO eventos_auditoria
        (operacion_id, actor_usuario_id, negocio_id, recurso_tipo, accion)
        VALUES ('44444444-4444-4444-8444-444444444444', ?, ?, 'servicio', 'invalido')`,
      [actor.insertId, uno.insertId])).rejects.toBeDefined();
      await expect(db.query(`INSERT INTO eventos_auditoria
        (operacion_id, actor_usuario_id, recurso_tipo, recurso_id, accion)
        VALUES ('55555555-5555-4555-8555-555555555555', ?, 'servicio', 1, 'ajeno')`,
      [actor.insertId])).rejects.toBeDefined();
    });
  });
});
