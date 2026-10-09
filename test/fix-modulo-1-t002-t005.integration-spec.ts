import { conBaseMigrada } from './support/mariadb';
import { OfertaIndividual1760000018000 } from '../src/database/migrations/1760000018000-OfertaIndividual';

describe('FIX-T002–T005: conversión de oferta individual', () => {
  it('conserva datos heredados, crea estados y combina cada selección con cada asignación propia', async () => {
    await conBaseMigrada(async (db) => {
      const migracion = new OfertaIndividual1760000018000();
      const runner = db.createQueryRunner();
      try {
        // Se vuelve al esquema histórico para sembrar datos tal como existían antes del fix.
        await migracion.down(runner);
        const negocios: number[] = [];
        const perfiles: number[] = [];
        const sucursales: number[][] = [];
        const servicios: number[][] = [];
        for (const letra of ['a', 'b']) {
          const negocio = await db.query(`INSERT INTO negocios (nombre,slug,email_contacto)
            VALUES (?,?,'admin@example.test')`, [letra, `fix-${letra}`]);
          const negocioId = Number(negocio.insertId);
          negocios.push(negocioId);
          const usuario = await db.query(`INSERT INTO usuarios
            (negocio_id,nombre,email,password_hash,rol,activo,activado_en)
            VALUES (?,?,?,'hash','profesional',1,CURRENT_TIMESTAMP(6))`,
            [negocioId, letra, `${letra}@example.test`]);
          const personalId = Number(usuario.insertId);
          perfiles.push(personalId);
          await db.query('INSERT INTO personal (id,negocio_id) VALUES (?,?)', [personalId, negocioId]);
          const idsSucursales: number[] = [];
          const idsServicios: number[] = [];
          for (const numero of [1, 2]) {
            const sucursal = await db.query(`INSERT INTO sucursales
              (negocio_id,nombre,direccion,telefono,zona_horaria,activo)
              VALUES (?,?, 'Calle','6141234567','UTC',?)`,
              [negocioId, `${letra}-${numero}`, numero === 1 ? 1 : 0]);
            idsSucursales.push(Number(sucursal.insertId));
            await db.query(`INSERT INTO personal_sucursales
              (negocio_id,personal_id,sucursal_id) VALUES (?,?,?)`,
              [negocioId, personalId, sucursal.insertId]);
            const servicio = await db.query(`INSERT INTO servicios
              (negocio_id,nombre,costo,duracion_minutos,activo) VALUES (?,?,0,30,?)`,
              [negocioId, `${letra}-${numero}`, numero === 1 ? 1 : 0]);
            idsServicios.push(Number(servicio.insertId));
            await db.query(`INSERT INTO personal_servicios
              (negocio_id,personal_id,servicio_id) VALUES (?,?,?)`,
              [negocioId, personalId, servicio.insertId]);
          }
          sucursales.push(idsSucursales);
          servicios.push(idsServicios);
        }

        await migracion.up(runner);
        // El contrato de continuidad deja campos nuevos vacíos y conserva relaciones activas.
        const perfilesConvertidos = await db.query('SELECT especialidad FROM personal ORDER BY id');
        expect(perfilesConvertidos).toEqual([{ especialidad: null }, { especialidad: null }]);
        const catalogo = await db.query(`SELECT descripcion, creador_personal_id autor
          FROM servicios ORDER BY id`);
        expect(catalogo).toEqual(Array.from({ length: 4 }, () =>
          ({ descripcion: null, autor: null })));
        const selecciones = await db.query('SELECT activo FROM personal_servicios');
        const asignaciones = await db.query('SELECT activo FROM personal_sucursales');
        expect(selecciones).toHaveLength(4);
        expect(asignaciones).toHaveLength(4);
        expect([...selecciones, ...asignaciones].every((fila: { activo: number }) => fila.activo === 1))
          .toBe(true);
        // El producto completo incluye ubicaciones y servicios globalmente apagados.
        const oferta = await db.query(`SELECT negocio_id negocioId, personal_id personalId,
          sucursal_id sucursalId, servicio_id servicioId, activo
          FROM personal_servicios_sucursales ORDER BY negocio_id,sucursal_id,servicio_id`);
        expect(oferta).toHaveLength(8);
        for (let indice = 0; indice < 2; indice++) {
          for (const sucursalId of sucursales[indice]) {
            for (const servicioId of servicios[indice]) {
              expect(oferta).toContainEqual({ negocioId: negocios[indice],
                personalId: perfiles[indice], sucursalId, servicioId, activo: 1 });
            }
          }
        }
        // Las claves compuestas deben bloquear duplicados, cruces y relaciones ausentes.
        const insertar = `INSERT INTO personal_servicios_sucursales
          (negocio_id,personal_id,sucursal_id,servicio_id) VALUES (?,?,?,?)`;
        await expect(db.query(insertar, [negocios[0], perfiles[0], sucursales[0][0],
          servicios[0][0]])).rejects.toThrow();
        await expect(db.query(insertar, [negocios[0], perfiles[0], sucursales[1][0],
          servicios[0][0]])).rejects.toThrow();
        await expect(db.query(insertar, [negocios[0], perfiles[0], sucursales[0][0],
          servicios[1][0]])).rejects.toThrow();
        const sinAsignar = await db.query(`INSERT INTO sucursales
          (negocio_id,nombre,direccion,telefono,zona_horaria)
          VALUES (?,'Sin asignar','Calle','6141234567','UTC')`, [negocios[0]]);
        const sinSeleccionar = await db.query(`INSERT INTO servicios
          (negocio_id,nombre,costo,duracion_minutos)
          VALUES (?,'Sin seleccionar',0,30)`, [negocios[0]]);
        await expect(db.query(insertar, [negocios[0], perfiles[0], sinAsignar.insertId,
          servicios[0][0]])).rejects.toThrow();
        await expect(db.query(insertar, [negocios[0], perfiles[0], sucursales[0][0],
          sinSeleccionar.insertId])).rejects.toThrow();
        await db.query(`UPDATE servicios SET creador_personal_id=? WHERE id=?`,
          [perfiles[0], servicios[0][0]]);
        await expect(db.query(`UPDATE servicios SET creador_personal_id=? WHERE id=?`,
          [perfiles[1], servicios[0][0]])).rejects.toThrow();
      } finally {
        await runner.release();
      }
    });
  });
});
