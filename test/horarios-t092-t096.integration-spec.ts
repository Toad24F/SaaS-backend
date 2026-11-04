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
  for (const [indice, zona] of ['America/New_York', 'America/Phoenix'].entries()) {
    const alta = await db.query(`INSERT INTO sucursales
      (negocio_id,nombre,direccion,telefono,zona_horaria)
      VALUES (?,?,'Calle Uno','6141234567',?)`, [negocio.id, `Sede ${indice + 1}`, zona]);
    sucursales.push(Number(alta.insertId));
    await db.query(`INSERT INTO personal_sucursales
      (negocio_id,personal_id,sucursal_id) VALUES (?,?,?)`,
    [negocio.id, usuario.id, alta.insertId]);
  }
  return { negocioId: negocio.id, personalId: usuario.id, sucursales };
}

describe('T092–T096 semana vigente y último guardado válido', () => {
  it('ALA RF-37–RF-38 representa el descanso con dos franjas y conserva el hueco', async () => {
    await conBaseMigrada(async (db) => {
      const { negocioId, personalId, sucursales } = await preparar(db);
      const servicio = new HorariosService(db.getRepository(HorarioPersonal));
      const partida = await servicio.guardarSemana(negocioId, personalId,
        [lunes(sucursales[0], 540, 600), lunes(sucursales[0], 660, 720)], '2026-01-01');
      expect(partida.map((f) => [f.inicioMinutos, f.finMinutos]))
        .toEqual([[540, 600], [660, 720]]);
      expect(await servicio.consultarSemana(negocioId, personalId)).toEqual(partida);
      expect(await servicio.guardarSemana(negocioId, personalId,
        [lunes(sucursales[0], 540, 600)], '2026-01-01')).toHaveLength(1);
    });
  });

  it('ALA RF-37 rechaza un empalme semanal entre zonas sin perder la versión previa', async () => {
    await conBaseMigrada(async (db) => {
      const { negocioId, personalId, sucursales } = await preparar(db);
      const servicio = new HorariosService(db.getRepository(HorarioPersonal));
      const anterior = await servicio.guardarSemana(negocioId, personalId,
        [lunes(sucursales[0], 540, 600)], '2026-01-01');
      await expect(servicio.guardarSemana(negocioId, personalId,
        [lunes(sucursales[0], 540, 600), lunes(sucursales[1], 420, 480)], '2026-01-01'))
        .rejects.toBeInstanceOf(ConflictException);
      expect(await servicio.consultarSemana(negocioId, personalId)).toEqual(anterior);
    });
  });

  it('conserva interruptores y borradores; valida descanso y activación por fila', async () => {
    await conBaseMigrada(async (db) => {
      const { negocioId, personalId, sucursales } = await preparar(db);
      const servicio = new HorariosService(db.getRepository(HorarioPersonal));
      const activa = lunes(sucursales[0], 540, 600);
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
      // ALA RF-36 retira incluso el descanso que ocupa toda la fila.
      await expect(servicio.guardarSemana(negocioId, personalId,
        [{ ...reactivada[0], descansoInicioMinutos: 540,
          descansoFinMinutos: 600 }, reactivada[1]], '2026-01-01'))
        .rejects.toBeInstanceOf(BadRequestException);
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
