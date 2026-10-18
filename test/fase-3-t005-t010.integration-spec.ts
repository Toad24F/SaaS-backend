import { conBaseMigrada } from './support/mariadb';
import { ConfiguracionAgenda } from '../src/disponibilidad/entities/configuracion-agenda.entity';
import { Cliente } from '../src/disponibilidad/entities/cliente.entity';
import { Cita } from '../src/disponibilidad/entities/cita.entity';
import type { DataSource } from 'typeorm';

// Los escenarios usan exclusivamente bases creadas y eliminadas por conBaseMigrada.
async function recursos(db: DataSource, sufijo: string) {
  const negocio = await db.query(`INSERT INTO negocios (nombre,slug,email_contacto)
    VALUES (?,?,?)`, [`Negocio ${sufijo}`, `fase3-${sufijo}`, `${sufijo}@example.test`]);
  const negocioId = Number(negocio.insertId);
  const usuario = await db.query(`INSERT INTO usuarios
    (negocio_id,nombre,email,password_hash,rol,activo,activado_en)
    VALUES (?,?,?,'hash','profesional',1,CURRENT_TIMESTAMP(6))`,
  [negocioId, `Profesional ${sufijo}`, `prof-${sufijo}@example.test`]);
  const personalId = Number(usuario.insertId);
  await db.query('INSERT INTO personal (id,negocio_id) VALUES (?,?)', [personalId, negocioId]);
  const sucursal = await db.query(`INSERT INTO sucursales
    (negocio_id,nombre,direccion,telefono,zona_horaria)
    VALUES (?,'Centro','Calle 1','6141234567','America/Chihuahua')`, [negocioId]);
  const servicio = await db.query(`INSERT INTO servicios
    (negocio_id,nombre,costo,duracion_minutos) VALUES (?,'Corte',100,30)`, [negocioId]);
  return { negocioId, personalId, sucursalId: Number(sucursal.insertId),
    servicioId: Number(servicio.insertId) };
}

describe('M2-T005–T010: persistencia mínima en MariaDB temporal', () => {
  it('crea una configuración única por negocio, valida valores y la lee con TypeORM', async () => {
    await conBaseMigrada(async (db) => {
      const a = await recursos(db, 'config');
      const repo = db.getRepository(ConfiguracionAgenda);
      await repo.save(repo.create({ negocioId: a.negocioId }));
      expect(await repo.findOneByOrFail({ negocioId: a.negocioId })).toMatchObject({
        modo: 'ventana_libre', intervaloMinutos: 15, anticipacionMinutos: 15,
        diasFuturos: 60,
      });
      await expect(db.query(`INSERT INTO configuracion_agenda (negocio_id)
        VALUES (?)`, [a.negocioId])).rejects.toThrow();
      for (const [columna, valor] of [
        ['modo', 'desconocido'], ['intervalo_minutos', 7],
        ['anticipacion_minutos', 7], ['dias_futuros', -1],
      ] as const) {
        await expect(db.query(`UPDATE configuracion_agenda SET ${columna} = ?
          WHERE negocio_id = ?`, [valor, a.negocioId])).rejects.toThrow();
      }
      expect((await repo.findOneByOrFail({ negocioId: a.negocioId })).modo)
        .toBe('ventana_libre');
      // La entidad también escribe una configuración completa válida.
      await repo.update({ negocioId: a.negocioId }, { modo: 'agenda_compacta',
        intervaloMinutos: 20, anticipacionMinutos: 0, diasFuturos: 0 });
      expect(await repo.findOneByOrFail({ negocioId: a.negocioId })).toMatchObject({
        modo: 'agenda_compacta', intervaloMinutos: 20,
        anticipacionMinutos: 0, diasFuturos: 0 });
    });
  });

  it('guarda clientes y citas de dos negocios sin cruces y conserva el fin exacto', async () => {
    await conBaseMigrada(async (db) => {
      const a = await recursos(db, 'citas-a');
      const b = await recursos(db, 'citas-b');
      const clientes = db.getRepository(Cliente);
      const cliente = await clientes.save(clientes.create({ negocioId: a.negocioId,
        nombreCompleto: 'Ana Cliente', telefono: '6141234567', email: null }));
      expect(await clientes.findOneByOrFail({ id: cliente.id })).toMatchObject({
        negocioId: a.negocioId, nombreCompleto: 'Ana Cliente', telefono: '6141234567' });
      // Desde M3-T011 el teléfono puede compartirse; la cita conserva su cliente original.
      const familiar = await db.query(`INSERT INTO clientes
        (negocio_id,nombre_completo,telefono) VALUES (?,'Familiar','6141234567')`,
      [a.negocioId]);
      expect(Number(familiar.insertId)).not.toBe(cliente.id);
      expect((await clientes.findOneByOrFail({ id: cliente.id })).nombreCompleto)
        .toBe('Ana Cliente');
      const citas = db.getRepository(Cita);
      const inicioUtc = new Date('2026-10-20T15:00:00.123Z');
      const finUtc = new Date('2026-10-20T15:30:00.789Z');
      const cita = await citas.save(citas.create({ ...a, clienteId: cliente.id,
        inicioUtc, finUtc, zonaHorariaReserva: 'America/Chihuahua',
        estado: 'pendiente', folio: 'F3-A-001', origen: 'manual', motivoConsulta: null }));
      const leida = await citas.findOneByOrFail({ id: cita.id });
      expect(leida.inicioUtc.toISOString()).toBe(inicioUtc.toISOString());
      expect(leida.finUtc.toISOString()).toBe(finUtc.toISOString());
      await db.query('UPDATE servicios SET duracion_minutos = 45 WHERE id = ?', [a.servicioId]);
      expect((await citas.findOneByOrFail({ id: cita.id })).finUtc.toISOString())
        .toBe(finUtc.toISOString());
      const conRelaciones = await citas.findOneOrFail({ where: { id: cita.id },
        relations: { negocio: true, sucursal: true, personal: true,
          servicio: true, cliente: true } });
      expect([conRelaciones.negocio.id, conRelaciones.sucursal.negocioId,
        conRelaciones.personal.negocioId, conRelaciones.servicio.negocioId,
        conRelaciones.cliente.negocioId]).toEqual(Array(5).fill(a.negocioId));
      await expect(db.query(`INSERT INTO citas
        (negocio_id,sucursal_id,personal_id,servicio_id,cliente_id,
          inicio_utc,fin_utc,zona_horaria_reserva,folio)
        VALUES (?,?,?,?,?,?,?,?,?)`, [a.negocioId, b.sucursalId, a.personalId,
        a.servicioId, cliente.id, inicioUtc, finUtc, 'America/Chihuahua', 'F3-CRUCE']))
        .rejects.toThrow();
      await expect(db.query(`INSERT INTO citas
        (negocio_id,sucursal_id,personal_id,servicio_id,cliente_id,
          inicio_utc,fin_utc,zona_horaria_reserva,folio)
        VALUES (?,?,?,?,?,?,?,?,?)`, [a.negocioId, a.sucursalId, a.personalId,
        a.servicioId, cliente.id, inicioUtc, inicioUtc, 'America/Chihuahua', 'F3-IGUAL']))
        .rejects.toThrow();
    });
  });

  it('instala apartados sin token utilizable y bloquea referencias de otro negocio', async () => {
    await conBaseMigrada(async (db) => {
      const a = await recursos(db, 'apartado-a');
      const b = await recursos(db, 'apartado-b');
      const columnas = await db.query('SHOW COLUMNS FROM bloqueos_temporales');
      expect(columnas.map((fila: { Field: string }) => fila.Field))
        .toEqual(expect.arrayContaining(['inicio_utc', 'fin_utc', 'expira_en',
          'liberado_en', 'titular_hash', 'sucursal_id', 'servicio_id']));
      expect(columnas.map((fila: { Field: string }) => fila.Field))
        .not.toContain('session_token');
      const insertar = `INSERT INTO bloqueos_temporales
        (negocio_id,personal_id,sucursal_id,servicio_id,inicio_utc,fin_utc,
          expira_en,titular_hash) VALUES (?,?,?,?,?,?,?,?)`;
      const intervalo = [new Date('2026-10-20T15:00:00.123Z'),
        new Date('2026-10-20T15:30:00.789Z'), new Date('2026-10-20T15:05:00.000Z')];
      await db.query(insertar, [a.negocioId, a.personalId, a.sucursalId,
        a.servicioId, ...intervalo, 'a'.repeat(64)]);
      await expect(db.query(insertar, [a.negocioId, a.personalId, b.sucursalId,
        a.servicioId, ...intervalo, 'b'.repeat(64)])).rejects.toThrow();
      await expect(db.query(insertar, [a.negocioId, b.personalId, a.sucursalId,
        a.servicioId, ...intervalo, 'b'.repeat(64)])).rejects.toThrow();
      await expect(db.query(insertar, [a.negocioId, a.personalId, a.sucursalId,
        b.servicioId, ...intervalo, 'b'.repeat(64)])).rejects.toThrow();
      await expect(db.query(insertar, [a.negocioId, a.personalId, a.sucursalId,
        a.servicioId, intervalo[0], intervalo[0], intervalo[2], 'c'.repeat(64)]))
        .rejects.toThrow();
    });
  });
});
