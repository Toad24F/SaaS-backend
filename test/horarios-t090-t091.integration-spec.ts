import { ConflictException } from '@nestjs/common';
import { conBaseMigrada } from './support/mariadb';
import { Negocio } from '../src/negocios/entities/negocio.entity';
import { Usuario } from '../src/usuarios/entities/usuario.entity';
import { Rol } from '../src/auth/enums/rol.enum';
import { HorarioPersonal } from '../src/horarios/entities/horario-personal.entity';
import { HorariosService } from '../src/horarios/horarios.service';

// Dos sucursales reales permiten probar pertenencia y reemplazo en una base migrada.
async function preparar(db: Parameters<Parameters<typeof conBaseMigrada>[0]>[0]) {
  const ahora = new Date('2026-01-01T00:00:00.000Z');
  const negocio = await db.getRepository(Negocio).save({ nombre: 'Agenda', slug: 'agenda-horarios',
    emailContacto: 'agenda@example.test', creadoEn: ahora, activadoEn: ahora,
    limiteSucursalesActivas: 2 });
  const usuario = await db.getRepository(Usuario).save({ negocioId: negocio.id,
    nombre: 'Ana', email: 'ana-horarios@example.test', passwordHash: 'hash',
    rol: Rol.PROFESIONAL, activo: true, creadoEn: ahora, activadoEn: ahora });
  const perfil = await db.query('INSERT INTO personal (negocio_id, usuario_id) VALUES (?,?)',
    [negocio.id, usuario.id]);
  const sucursales: number[] = [];
  for (const [nombre, zona] of [['Centro', 'America/New_York'],
    ['Norte', 'America/Phoenix']]) {
    const alta = await db.query(`INSERT INTO sucursales
      (negocio_id,nombre,direccion,telefono,zona_horaria)
      VALUES (?,?,'Calle Uno','6141234567',?)`, [negocio.id, nombre, zona]);
    sucursales.push(Number(alta.insertId));
    await db.query(`INSERT INTO personal_sucursales
      (negocio_id,personal_id,sucursal_id) VALUES (?,?,?)`,
    [negocio.id, perfil.insertId, alta.insertId]);
  }
  return { negocioId: negocio.id, personalId: Number(perfil.insertId), sucursales };
}

const fila = (sucursalId: number, inicioMinutos = 540, finMinutos = 600) => ({
  diaSemana: 1, orden: 0, sucursalId, inicioMinutos, finMinutos,
  descansoInicioMinutos: null, descansoFinMinutos: null, activo: true,
});

describe('T090–T091 guardado semanal', () => {
  it('guarda y recupera borrador y semana vacía, conservando ID de fila editada', async () => {
    await conBaseMigrada(async (db) => {
      const { negocioId, personalId, sucursales } = await preparar(db);
      const servicio = new HorariosService(db.getRepository(HorarioPersonal));
      expect(await servicio.consultarSemana(negocioId, personalId)).toEqual([]);
      const primera = await servicio.guardarSemana(negocioId, personalId, [fila(sucursales[0]),
        { diaSemana: 2, orden: 0, sucursalId: null, inicioMinutos: 600,
          finMinutos: null, descansoInicioMinutos: null,
          descansoFinMinutos: null, activo: false }], '2026-07-01');
      expect(primera).toHaveLength(2);
      expect((await servicio.consultarSemana(negocioId, personalId))[1]).toMatchObject({
        id: primera[1].id, activo: false, finMinutos: null });
      const segunda = await servicio.guardarSemana(negocioId, personalId,
        [{ ...primera[0], inicioMinutos: 600, finMinutos: 660 }], '2026-07-01');
      expect(segunda.map((f) => f.id)).toEqual([primera[0].id]);
      expect(await servicio.guardarSemana(negocioId, personalId, [], '2026-07-01'))
        .toEqual([]);
      expect(await servicio.consultarSemana(negocioId, personalId)).toEqual([]);
    });
  });

  it('identifica fila y campo y revierte por completo un conjunto inválido', async () => {
    await conBaseMigrada(async (db) => {
      const { negocioId, personalId, sucursales } = await preparar(db);
      const servicio = new HorariosService(db.getRepository(HorarioPersonal));
      const anterior = await servicio.guardarSemana(negocioId, personalId,
        [fila(sucursales[0])], '2026-07-01');
      const propuesta = [fila(sucursales[0], 660, 720),
        fila(sucursales[0], 700, 760)];
      await expect(servicio.guardarSemana(negocioId, personalId, propuesta, '2026-07-01'))
        .rejects.toBeInstanceOf(ConflictException);
      expect(await servicio.consultarSemana(negocioId, personalId)).toEqual(anterior);
      try { await servicio.guardarSemana(negocioId, personalId,
        [fila(sucursales[0]), { ...fila(sucursales[0]), finMinutos: null }],
      '2026-07-01'); }
      catch (error) {
        expect(JSON.stringify((error as Error).message)).toMatch(/fila 1.*finMinutos/);
      }
      expect(await servicio.consultarSemana(negocioId, personalId)).toEqual(anterior);
    });
  });

  it('reemplaza semanas concurrentes completas bajo el bloqueo del perfil', async () => {
    await conBaseMigrada(async (db, otra) => {
      const { negocioId, personalId, sucursales } = await preparar(db);
      const a = new HorariosService(db.getRepository(HorarioPersonal));
      const b = new HorariosService(otra.getRepository(HorarioPersonal));
      const [uno, dos] = await Promise.all([
        a.guardarSemana(negocioId, personalId, [fila(sucursales[0])], '2026-07-01'),
        b.guardarSemana(negocioId, personalId, [fila(sucursales[1], 720, 780)],
          '2026-07-01'),
      ]);
      expect(uno).toHaveLength(1);
      expect(dos).toHaveLength(1);
      const final = await a.consultarSemana(negocioId, personalId);
      expect(final).toHaveLength(1);
      expect([sucursales[0], sucursales[1]]).toContain(final[0].sucursalId);
    });
  });
});
