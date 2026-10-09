import { ConflictException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { conBaseMigrada } from './support/mariadb';
import { Negocio } from '../src/negocios/entities/negocio.entity';
import { Usuario } from '../src/usuarios/entities/usuario.entity';
import { Rol } from '../src/auth/enums/rol.enum';
import { Sucursal } from '../src/sucursales/entities/sucursal.entity';
import { SucursalesService } from '../src/sucursales/sucursales.service';
import { HorarioPersonal } from '../src/horarios/entities/horario-personal.entity';
import { HorariosService } from '../src/horarios/horarios.service';
import { ProfesionalesService } from '../src/profesionales/profesionales.service';
import { Personal } from '../src/profesionales/entities/personal.entity';
import { AutorizacionService } from '../src/auth/services/autorizacion.service';
import { AuditoriaService } from '../src/auditoria/auditoria.service';
import { PoliticaContrasenasService } from '../src/auth/services/politica-contrasenas.service';
import { ReservaCorreoService } from '../src/altas/reserva-correo.service';

const entrada = { nombre: 'Nueva', direccion: 'Calle Uno', telefono: '6141234567',
  zonaHoraria: 'America/Phoenix' };
const lunes = (sucursalId: number, inicioMinutos: number, finMinutos: number) => ({
  diaSemana: 1, orden: 0, sucursalId, inicioMinutos, finMinutos,
  descansoInicioMinutos: null, descansoFinMinutos: null, activo: true,
});
const especial = (inicioMinutos: number, finMinutos: number) => ({ orden: 0,
  inicioMinutos, finMinutos, descansoInicioMinutos: null,
  descansoFinMinutos: null });

function sucursales(db: DataSource) {
  return new SucursalesService(db.getRepository(Sucursal), new AutorizacionService(),
    new AuditoriaService());
}
function horarios(db: DataSource) {
  return new HorariosService(db.getRepository(HorarioPersonal));
}
function profesionales(db: DataSource) {
  return new ProfesionalesService(db.getRepository(Personal), new AutorizacionService(),
    new PoliticaContrasenasService(), new ReservaCorreoService(), new AuditoriaService());
}

// Dos sedes y un perfil real permiten comprobar los FK, locks y rollback en MariaDB.
async function preparar(db: DataSource, limite = 2, estados: boolean[] = [true, false]) {
  const ahora = new Date(Date.now() + 120000);
  const negocio = await db.getRepository(Negocio).save({ nombre: 'Agenda',
    slug: 'cruces-horarios', emailContacto: 'cruces@example.test',
    creadoEn: ahora, activadoEn: ahora, limiteSucursalesActivas: limite });
  const admin = await db.getRepository(Usuario).save({ negocioId: negocio.id,
    nombre: 'Admin', email: 'admin-cruces@example.test', passwordHash: 'hash',
    rol: Rol.ADMIN_NEGOCIO, activo: true, creadoEn: ahora, activadoEn: ahora });
  const usuario = await db.getRepository(Usuario).save({ negocioId: negocio.id,
    nombre: 'Profesional', email: 'prof-cruces@example.test', passwordHash: 'hash',
    rol: Rol.PROFESIONAL, activo: true, creadoEn: ahora, activadoEn: ahora });
  await db.query('INSERT INTO personal (id,negocio_id) VALUES (?,?)',
    [usuario.id, negocio.id]);
  const ids: number[] = [];
  for (const [indice, zona] of ['America/New_York', 'America/Phoenix'].entries()) {
    const alta = await db.query(`INSERT INTO sucursales
      (negocio_id,nombre,direccion,telefono,zona_horaria,activo)
      VALUES (?,?,'Calle Uno','6141234567',?,?)`,
    [negocio.id, `Sede ${indice}`, zona, estados[indice] ? 1 : 0]);
    ids.push(Number(alta.insertId));
    await db.query(`INSERT INTO personal_sucursales
      (negocio_id,personal_id,sucursal_id) VALUES (?,?,?)`,
    [negocio.id, usuario.id, alta.insertId]);
  }
  return { negocioId: negocio.id, adminId: admin.id,
    perfilId: usuario.id, ids };
}

describe('T097–T100 coordinación de sucursales y horarios', () => {
  it('reactivar valida horarios conservados, identifica filas y mantiene inactiva ante conflicto', async () => {
    await conBaseMigrada(async (db) => {
      const { negocioId, adminId, perfilId, ids } = await preparar(db);
      // Datos históricos válidos por separado: el segundo horario está en sede inactiva.
      await db.query(`INSERT INTO horarios_personal
        (negocio_id,personal_id,dia_semana,orden,sucursal_id,inicio_minutos,fin_minutos,activo)
        VALUES (?,?,1,0,?,540,600,1),(?,?,1,1,?,420,480,1)`,
      [negocioId, perfilId, ids[0], negocioId, perfilId, ids[1]]);
      await expect(sucursales(db).reactivar(adminId, ids[1], '2026-01-01'))
        .rejects.toThrow(/filas/);
      expect((await db.getRepository(Sucursal).findOneByOrFail({ id: ids[1] })).activo).toBe(false);
      await db.query('UPDATE horarios_personal SET inicio_minutos=480,fin_minutos=540 WHERE sucursal_id=?',
        [ids[1]]);
      await sucursales(db).reactivar(adminId, ids[1], '2026-01-01');
      expect((await db.getRepository(Sucursal).findOneByOrFail({ id: ids[1] })).activo).toBe(true);
      const eventos = await db.query("SELECT accion FROM eventos_auditoria WHERE accion='sucursal_reactivada'");
      expect(eventos).toHaveLength(1);
    });
  });

  it('cambio de zona y retiro de asignación preservan horarios y excepciones', async () => {
    await conBaseMigrada(async (db) => {
      const { negocioId, adminId, perfilId, ids } = await preparar(db, 2, [true, true]);
      const semana = await horarios(db).guardarSemana(negocioId, perfilId,
        [lunes(ids[0], 540, 600), lunes(ids[1], 480, 540)], '2026-01-01');
      await expect(sucursales(db).editar(adminId, ids[1],
        { zonaHoraria: 'America/Chicago' })).rejects.toBeInstanceOf(ConflictException);
      expect((await db.getRepository(Sucursal).findOneByOrFail({ id: ids[1] })).zonaHoraria)
        .toBe('America/Phoenix');
      await expect(profesionales(db).asignarSucursales(adminId, perfilId,
        { sucursalIds: [ids[0]] })).rejects.toBeInstanceOf(ConflictException);
      expect(await horarios(db).consultarSemana(negocioId, perfilId)).toEqual(semana);
      await horarios(db).guardarExcepcion(negocioId, perfilId,
        '2026-01-13', ids[1], [especial(480, 540)], '2026-01-01');
      await horarios(db).guardarSemana(negocioId, perfilId,
        [lunes(ids[0], 540, 600)], '2026-01-01');
      await expect(profesionales(db).asignarSucursales(adminId, perfilId,
        { sucursalIds: [ids[0]] })).rejects.toBeInstanceOf(ConflictException);
      expect((await db.query('SELECT COUNT(*) total FROM personal_sucursales WHERE personal_id=?',
        [perfilId]))[0].total).toBe('2');
    });
  });

  it('carreras semana/excepción y semana/asignación dejan un conjunto íntegro', async () => {
    await conBaseMigrada(async (db, otra) => {
      const { negocioId, adminId, perfilId, ids } = await preparar(db);
      const resultados = await Promise.allSettled([
        horarios(db).guardarSemana(negocioId, perfilId,
          [lunes(ids[0], 540, 600)], '2026-01-01'),
        horarios(otra).guardarExcepcion(negocioId, perfilId,
          '2026-01-12', ids[1], [especial(420, 480)], '2026-01-01'),
      ]);
      expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const actual = await horarios(db).consultarSemana(negocioId, perfilId);
      expect(actual.length + (await horarios(db).consultarExcepciones(negocioId, perfilId)).length)
        .toBe(1);
      const asignacion = await Promise.allSettled([
        horarios(db).guardarSemana(negocioId, perfilId,
          [lunes(ids[1], 480, 540)], '2026-01-01'),
        profesionales(otra).asignarSucursales(adminId, perfilId,
          { sucursalIds: [ids[0]] }),
      ]);
      expect(asignacion.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(Number((await db.query('SELECT COUNT(*) total FROM horarios_personal WHERE personal_id=?',
        [perfilId]))[0].total)).toBeLessThanOrEqual(1);
    });
  });

  it('semana y reactivación se serializan sin habilitar un empalme antiguo', async () => {
    await conBaseMigrada(async (db, otra) => {
      const { negocioId, adminId, perfilId, ids } = await preparar(db);
      // Estado heredado: la sede inactiva conserva una franja que hoy se empalma.
      await db.query(`INSERT INTO horarios_personal
        (negocio_id,personal_id,dia_semana,orden,sucursal_id,inicio_minutos,fin_minutos,activo)
        VALUES (?,?,1,0,?,540,600,1),(?,?,1,1,?,420,480,1)`,
      [negocioId, perfilId, ids[0], negocioId, perfilId, ids[1]]);
      const resultados = await Promise.allSettled([
        horarios(db).guardarSemana(negocioId, perfilId,
          [lunes(ids[0], 540, 600), lunes(ids[1], 480, 540)], '2026-01-01'),
        sucursales(otra).reactivar(adminId, ids[1], '2026-01-01'),
      ]);
      expect(resultados[0].status).toBe('fulfilled');
      expect(['fulfilled', 'rejected']).toContain(resultados[1].status);
      const sede = await db.getRepository(Sucursal).findOneByOrFail({ id: ids[1] });
      const semana = await horarios(db).consultarSemana(negocioId, perfilId);
      expect(semana.map((f) => f.inicioMinutos)).toEqual([540, 480]);
      if (sede.activo) expect(semana[1].inicioMinutos).toBe(480);
      expect(await db.getRepository(Sucursal).countBy({ negocioId, activo: true }))
        .toBeLessThanOrEqual(2);
    });
  });

  it('dos reactivaciones y alta/reactivación compiten por la última plaza', async () => {
    await conBaseMigrada(async (db, otra) => {
      const { negocioId, adminId, perfilId, ids } = await preparar(db, 1, [false, false]);
      // Las dos sedes conservan horarios; rechazar una activación no los borra.
      await db.query(`INSERT INTO horarios_personal
        (negocio_id,personal_id,dia_semana,orden,sucursal_id,inicio_minutos,fin_minutos,activo)
        VALUES (?,?,1,0,?,540,600,1),(?,?,1,1,?,480,540,1)`,
      [negocioId, perfilId, ids[0], negocioId, perfilId, ids[1]]);
      const primeras = await Promise.allSettled([
        sucursales(db).reactivar(adminId, ids[0], '2026-01-01'),
        sucursales(otra).reactivar(adminId, ids[1], '2026-01-01'),
      ]);
      expect(primeras.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(await db.getRepository(Sucursal).countBy({ negocioId, activo: true })).toBe(1);
      expect(await db.getRepository(HorarioPersonal).countBy({ negocioId, personalId: perfilId }))
        .toBe(2);
      const ganadora = (await db.getRepository(Sucursal).findBy({ negocioId, activo: true }))[0];
      await sucursales(db).desactivar(adminId, ganadora.id);
      const perdedora = ids.find((id) => id !== ganadora.id)!;
      const segundas = await Promise.allSettled([
        sucursales(db).crear(adminId, entrada),
        sucursales(otra).reactivar(adminId, perdedora, '2026-01-01'),
      ]);
      expect(segundas.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(await db.getRepository(Sucursal).countBy({ negocioId, activo: true })).toBe(1);
      expect((await db.getRepository(Sucursal).findOneByOrFail({ id: ganadora.id })).activo)
        .toBe(false);
      expect(await db.getRepository(HorarioPersonal).countBy({ negocioId, personalId: perfilId }))
        .toBe(2);
    });
  });
});
