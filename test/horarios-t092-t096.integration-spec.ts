import { BadRequestException, ConflictException } from '@nestjs/common';
import { conBaseMigrada } from './support/mariadb';
import { Negocio } from '../src/negocios/entities/negocio.entity';
import { Usuario } from '../src/usuarios/entities/usuario.entity';
import { Rol } from '../src/auth/enums/rol.enum';
import { HorarioPersonal } from '../src/horarios/entities/horario-personal.entity';
import { HorariosService } from '../src/horarios/horarios.service';

const lunes = (sucursalId: number, inicioMinutos: number, finMinutos: number,
  extra = {}) => ({ diaSemana: 1, orden: 0, sucursalId, inicioMinutos, finMinutos,
    descansoInicioMinutos: null, descansoFinMinutos: null, activo: true, ...extra });
const especial = (inicioMinutos: number, finMinutos: number, extra = {}) => ({
  orden: 0, inicioMinutos, finMinutos, descansoInicioMinutos: null,
  descansoFinMinutos: null, ...extra });

// El fixture usa zonas con cambios distintos para comprobar conflictos reales.
async function preparar(db: Parameters<Parameters<typeof conBaseMigrada>[0]>[0]) {
  const ahora = new Date('2026-01-01T00:00:00.000Z');
  const negocio = await db.getRepository(Negocio).save({ nombre: 'Agenda',
    slug: 'agenda-horarios-92', emailContacto: 'agenda92@example.test',
    creadoEn: ahora, activadoEn: ahora, limiteSucursalesActivas: 3 });
  const usuario = await db.getRepository(Usuario).save({ negocioId: negocio.id,
    nombre: 'Ana', email: 'ana92@example.test', passwordHash: 'hash',
    rol: Rol.PROFESIONAL, activo: true, creadoEn: ahora, activadoEn: ahora });
  await db.query('INSERT INTO personal (id,negocio_id) VALUES (?,?)',
    [usuario.id, negocio.id]);
  const sucursales: number[] = [];
  for (const zona of ['America/New_York', 'America/Phoenix']) {
    const alta = await db.query(`INSERT INTO sucursales
      (negocio_id,nombre,direccion,telefono,zona_horaria)
      VALUES (?,'Sede','Calle Uno','6141234567',?)`, [negocio.id, zona]);
    sucursales.push(Number(alta.insertId));
    await db.query(`INSERT INTO personal_sucursales
      (negocio_id,personal_id,sucursal_id) VALUES (?,?,?)`,
    [negocio.id, usuario.id, alta.insertId]);
  }
  return { negocioId: negocio.id, personalId: usuario.id, sucursales };
}

describe('T092–T096 excepciones y último guardado válido', () => {
  it('crea, sustituye por cierre vacío y retira la excepción sin perder la semana', async () => {
    await conBaseMigrada(async (db) => {
      const { negocioId, personalId, sucursales } = await preparar(db);
      const servicio = new HorariosService(db.getRepository(HorarioPersonal));
      await servicio.guardarSemana(negocioId, personalId,
        [lunes(sucursales[0], 540, 600)], '2026-01-01');
      const normal = await servicio.guardarExcepcion(negocioId, personalId,
        '2026-01-12', sucursales[0], [especial(600, 660)], '2026-01-01');
      expect(normal.franjas).toHaveLength(1);
      const cierre = await servicio.guardarExcepcion(negocioId, personalId,
        '2026-01-12', sucursales[0], [], '2026-01-01');
      expect(cierre.id).toBe(normal.id);
      expect(cierre.franjas).toEqual([]);
      expect(await servicio.consultarExcepciones(negocioId, personalId)).toMatchObject([
        { id: normal.id, fechaLocal: '2026-01-12', franjas: [] },
      ]);
      await servicio.retirarExcepcion(negocioId, personalId,
        '2026-01-12', sucursales[0], '2026-01-01');
      expect(await servicio.consultarExcepciones(negocioId, personalId)).toEqual([]);
      expect(await servicio.consultarSemana(negocioId, personalId)).toHaveLength(1);
    });
  });

  it('rechaza empalme al crear o retirar y conserva cabecera vacía previa', async () => {
    await conBaseMigrada(async (db) => {
      const { negocioId, personalId, sucursales } = await preparar(db);
      const servicio = new HorariosService(db.getRepository(HorarioPersonal));
      await servicio.guardarSemana(negocioId, personalId,
        [lunes(sucursales[0], 540, 600)], '2026-01-01');
      await expect(servicio.guardarExcepcion(negocioId, personalId,
        '2026-01-12', sucursales[1], [especial(420, 480)], '2026-01-01'))
        .rejects.toBeInstanceOf(ConflictException);
      const vacia = await servicio.guardarExcepcion(negocioId, personalId,
        '2026-01-12', sucursales[0], [], '2026-01-01');
      await servicio.guardarExcepcion(negocioId, personalId,
        '2026-01-12', sucursales[1], [especial(420, 480)], '2026-01-01');
      await expect(servicio.retirarExcepcion(negocioId, personalId,
        '2026-01-12', sucursales[0], '2026-01-01'))
        .rejects.toBeInstanceOf(ConflictException);
      expect(await servicio.consultarExcepciones(negocioId, personalId)).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: vacia.id, franjas: [] })]));
    });
  });

  it('conserva interruptores y borradores; valida descanso y activación por fila', async () => {
    await conBaseMigrada(async (db) => {
      const { negocioId, personalId, sucursales } = await preparar(db);
      const servicio = new HorariosService(db.getRepository(HorarioPersonal));
      const activa = lunes(sucursales[0], 540, 600,
        { descansoInicioMinutos: 555, descansoFinMinutos: 570 });
      const borrador = lunes(sucursales[1], 720, null,
        { activo: false, descansoInicioMinutos: null, descansoFinMinutos: null });
      const guardadas = await servicio.guardarSemana(negocioId, personalId,
        [activa, borrador], '2026-01-01');
      expect(guardadas.map((f) => f.activo)).toEqual([true, false]);
      // El interruptor de una fila no cambia la otra ni borra su borrador.
      const apagada = await servicio.guardarSemana(negocioId, personalId,
        [{ ...guardadas[0], activo: false }, guardadas[1]], '2026-01-01');
      expect(apagada.map((f) => f.activo)).toEqual([false, false]);
      const reactivada = await servicio.guardarSemana(negocioId, personalId,
        [{ ...apagada[0], activo: true }, apagada[1]], '2026-01-01');
      expect(reactivada.map((f) => f.activo)).toEqual([true, false]);
      await expect(servicio.guardarSemana(negocioId, personalId,
        [reactivada[0], { ...reactivada[1], activo: true }], '2026-01-01'))
        .rejects.toThrow(/fila 1.*finMinutos/);
      for (const descanso of [
        { descansoInicioMinutos: 550, descansoFinMinutos: null },
        { descansoInicioMinutos: 530, descansoFinMinutos: 560 },
        { descansoInicioMinutos: 580, descansoFinMinutos: 610 },
        { descansoInicioMinutos: 575, descansoFinMinutos: 570 },
        { descansoInicioMinutos: 570, descansoFinMinutos: 570 },
      ]) {
        await expect(servicio.guardarSemana(negocioId, personalId,
          [{ ...reactivada[0], ...descanso }, reactivada[1]], '2026-01-01'))
          .rejects.toBeInstanceOf(BadRequestException);
      }
      expect(await servicio.consultarSemana(negocioId, personalId)).toEqual(reactivada);
      const extremos = await servicio.guardarSemana(negocioId, personalId,
        [{ ...reactivada[0], descansoInicioMinutos: 540,
          descansoFinMinutos: 600 }, reactivada[1]], '2026-01-01');
      expect(extremos[0]).toMatchObject({ descansoInicioMinutos: 540,
        descansoFinMinutos: 600 });
      expect(await servicio.guardarSemana(negocioId, personalId, [], '2026-01-01'))
        .toEqual([]);
    });
  });

  it('acepta dos versiones válidas y revierte un fallo SQL posterior al borrado', async () => {
    await conBaseMigrada(async (db) => {
      const { negocioId, personalId, sucursales } = await preparar(db);
      const servicio = new HorariosService(db.getRepository(HorarioPersonal));
      await servicio.guardarSemana(negocioId, personalId,
        [lunes(sucursales[0], 540, 600)], '2026-01-01');
      const segunda = await servicio.guardarSemana(negocioId, personalId,
        [lunes(sucursales[1], 660, 720), lunes(sucursales[0], 900, 960)],
      '2026-01-01');
      expect(await servicio.consultarSemana(negocioId, personalId)).toEqual(segunda);
      await expect(servicio.guardarSemana(negocioId, personalId,
        [lunes(sucursales[1], 660, 720), lunes(sucursales[0], 800, 860)],
      '2026-01-01')).rejects.toBeInstanceOf(ConflictException);
      // El disparador falla después de DELETE; la transacción debe reponer ambas filas.
      await db.query(`CREATE TRIGGER horarios_fallo BEFORE INSERT ON horarios_personal
        FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'fallo inyectado'`);
      await expect(servicio.guardarSemana(negocioId, personalId,
        [lunes(sucursales[0], 900, 960)], '2026-01-01'))
        .rejects.toThrow(/fallo inyectado/);
      expect(await servicio.consultarSemana(negocioId, personalId)).toEqual(segunda);
    });
  });
});
