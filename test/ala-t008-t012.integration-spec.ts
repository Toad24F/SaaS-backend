import { conBaseMigrada } from './support/mariadb';

describe('ALA-T008–T012: migraciones de cupos e inhabilitación', () => {
  it('instala valores iniciales y rechaza cupos cero en una base desechable', async () => {
    await conBaseMigrada(async (db) => {
      const alta = await db.query("INSERT INTO negocios (nombre,slug,email_contacto) VALUES ('ALA','ala-cupos','ala@example.test')");
      const id = Number(alta.insertId);
      const [negocio] = await db.query('SELECT limite_profesionales_activos,limite_recepcionistas_activos,mostrar_precios_publicos FROM negocios WHERE id=?', [id]);
      expect(negocio).toMatchObject({
        limite_profesionales_activos: 5,
        limite_recepcionistas_activos: 3,
        mostrar_precios_publicos: 1,
      });
      await expect(db.query('UPDATE negocios SET limite_profesionales_activos=0 WHERE id=?', [id])).rejects.toBeDefined();
      await expect(db.query('UPDATE negocios SET limite_recepcionistas_activos=0 WHERE id=?', [id])).rejects.toBeDefined();
      const [despues] = await db.query('SELECT limite_profesionales_activos,limite_recepcionistas_activos FROM negocios WHERE id=?', [id]);
      expect(despues).toMatchObject({ limite_profesionales_activos: 5, limite_recepcionistas_activos: 3 });
    });
  });

  it('actualiza filas previas sin perder identidad, nombres ni relaciones y valida la marca', async () => {
    await conBaseMigrada(async (db) => {
      const nuevas = ['CuposVisibilidadNegocio1760000034000', 'InhabilitacionRecursos1760000035000'];
      expect(nuevas.every((nombre) => db.migrations.some((m) => m.name === nombre))).toBe(true);
      // La base temporal vuelve al esquema anterior y luego aplica las dos migraciones nuevas.
      await db.undoLastMigration();
      await db.undoLastMigration();
      const negocio = Number((await db.query("INSERT INTO negocios (nombre,slug,email_contacto) VALUES ('Original','ala-previo','original@example.test')")).insertId);
      const usuario = Number((await db.query(`INSERT INTO usuarios
        (negocio_id,nombre,email,password_hash,rol,activo,activado_en,creado_en)
        VALUES (?,'Ana','ana@example.test','hash','profesional',1,UTC_TIMESTAMP(6),UTC_TIMESTAMP(6))`, [negocio])).insertId);
      await db.query('INSERT INTO personal (id,negocio_id) VALUES (?,?)', [usuario, negocio]);
      const servicio = Number((await db.query("INSERT INTO servicios (negocio_id,nombre,costo,duracion_minutos) VALUES (?,'Corte',100,30)", [negocio])).insertId);
      const sucursal = Number((await db.query("INSERT INTO sucursales (negocio_id,nombre,direccion,telefono,zona_horaria) VALUES (?,'Centro','Calle 1','6140000000','America/Chihuahua')", [negocio])).insertId);
      await db.query('INSERT INTO personal_sucursales (negocio_id,personal_id,sucursal_id,activo) VALUES (?,?,?,1)', [negocio, usuario, sucursal]);
      await db.query('INSERT INTO personal_servicios (negocio_id,personal_id,servicio_id,activo) VALUES (?,?,?,1)', [negocio, usuario, servicio]);
      await db.runMigrations({ transaction: 'each' });
      const [b] = await db.query('SELECT nombre,limite_profesionales_activos,limite_recepcionistas_activos,mostrar_precios_publicos FROM negocios WHERE id=?', [negocio]);
      expect(b).toMatchObject({ nombre: 'Original', limite_profesionales_activos: 5,
        limite_recepcionistas_activos: 3, mostrar_precios_publicos: 1 });
      for (const [tabla, id, nombre] of [
        ['usuarios', usuario, 'Ana'], ['servicios', servicio, 'Corte'], ['sucursales', sucursal, 'Centro'],
      ] as const) {
        const [fila] = await db.query(`SELECT nombre,activo,inhabilitado_en FROM ${tabla} WHERE id=?`, [id]);
        expect(fila).toMatchObject({ nombre, activo: 1, inhabilitado_en: null });
        await expect(db.query(`UPDATE ${tabla} SET inhabilitado_en=UTC_TIMESTAMP(6) WHERE id=?`, [id])).rejects.toBeDefined();
        await db.query(`UPDATE ${tabla} SET activo=0,inhabilitado_en=UTC_TIMESTAMP(6) WHERE id=?`, [id]);
        const [inhabilitado] = await db.query(`SELECT activo,inhabilitado_en FROM ${tabla} WHERE id=?`, [id]);
        expect(inhabilitado.activo).toBe(0);
        expect(inhabilitado.inhabilitado_en).not.toBeNull();
        // Restaurar solo limpia la marca: la reactivación sigue siendo otro paso.
        await db.query(`UPDATE ${tabla} SET inhabilitado_en=NULL WHERE id=?`, [id]);
        const [restaurado] = await db.query(`SELECT activo,inhabilitado_en FROM ${tabla} WHERE id=?`, [id]);
        expect(restaurado).toMatchObject({ activo: 0, inhabilitado_en: null });
      }
      expect(Number((await db.query('SELECT COUNT(*) total FROM personal WHERE id=? AND negocio_id=?', [usuario, negocio]))[0].total)).toBe(1);
      expect(Number((await db.query('SELECT COUNT(*) total FROM personal_sucursales WHERE personal_id=? AND sucursal_id=?', [usuario, sucursal]))[0].total)).toBe(1);
      expect(Number((await db.query('SELECT COUNT(*) total FROM personal_servicios WHERE personal_id=? AND servicio_id=?', [usuario, servicio]))[0].total)).toBe(1);
      // Las claves únicas sobreviven a la inhabilitación: no se reutilizan nombres ni correo.
      await expect(db.query("INSERT INTO servicios (negocio_id,nombre,costo,duracion_minutos) VALUES (?,'Corte',100,30)", [negocio])).rejects.toBeDefined();
      await expect(db.query("INSERT INTO sucursales (negocio_id,nombre,direccion,telefono,zona_horaria) VALUES (?,'Centro','Calle 2','6140000000','America/Chihuahua')", [negocio])).rejects.toBeDefined();
      await expect(db.query("INSERT INTO usuarios (negocio_id,nombre,email,password_hash,rol,activo,activado_en,creado_en) VALUES (?,'Otra','ana@example.test','hash','recepcionista',1,UTC_TIMESTAMP(6),UTC_TIMESTAMP(6))", [negocio])).rejects.toBeDefined();
    });
  });
});
