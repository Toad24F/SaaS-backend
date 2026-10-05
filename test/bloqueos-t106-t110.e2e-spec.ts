import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { RELOJ } from '../src/comun/reloj';
import { RelojPrueba } from './support/reloj';
import { conBaseMigrada } from './support/mariadb';
import { Rol } from '../src/auth/enums/rol.enum';
import { Usuario } from '../src/usuarios/entities/usuario.entity';
import { Negocio } from '../src/negocios/entities/negocio.entity';
import { Licencia } from '../src/licencias/entities/licencia.entity';
import { SesionesService } from '../src/auth/services/sesiones.service';

const entrada = (personalId: number | null, sucursalId: number | null) => ({
  personalId, sucursalId, tipo: 'vacaciones', motivo: 'Viaje',
  fechaInicio: '2026-07-06', fechaFin: '2026-07-06',
  inicioMinutos: 600, finMinutos: 660 });

async function conHttp(ejecutar: (app: INestApplication, db: DataSource,
  fixture: { personalId: number; sucursalId: number; sucursales: number[];
    tokens: Record<string, string> }) => Promise<void>) {
  await conBaseMigrada(async (db) => {
    const reloj = new RelojPrueba(new Date('2026-07-01T12:00:00Z'));
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DataSource).useValue(db).overrideProvider(RELOJ).useValue(reloj).compile();
    const app = modulo.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true,
      forbidNonWhitelisted: true }));
    try {
      await app.init();
      const negocio = await db.getRepository(Negocio).save({ nombre: 'Agenda',
        slug: 'bloqueos-http', emailContacto: 'bloqueos-http@example.test',
        creadoEn: reloj.ahora(), activadoEn: reloj.ahora(), limiteSucursalesActivas: 2 });
      await db.getRepository(Licencia).save({ negocioId: negocio.id,
        habilitadaEn: reloj.ahora(), venceEn: new Date('2027-07-01T12:00:00Z'),
        suspendidaEn: null, creadoEn: reloj.ahora() });
      const usuarios = new Map<string, Usuario>();
      for (const [nombre, rol] of [['admin', Rol.ADMIN_NEGOCIO],
        ['profesional', Rol.PROFESIONAL], ['recepcion', Rol.RECEPCIONISTA]] as const) {
        usuarios.set(nombre, await db.getRepository(Usuario).save({ negocioId: negocio.id,
          nombre, email: `${nombre}@bloqueos-http.test`, passwordHash: 'hash',
          rol, activo: true, creadoEn: reloj.ahora(), activadoEn: reloj.ahora() }));
      }
      const otroNegocio = await db.getRepository(Negocio).save({ nombre: 'Ajeno',
        slug: 'bloqueos-http-ajeno', emailContacto: 'ajeno-bloqueos@example.test',
        creadoEn: reloj.ahora(), activadoEn: reloj.ahora(), limiteSucursalesActivas: 1 });
      await db.getRepository(Licencia).save({ negocioId: otroNegocio.id,
        habilitadaEn: reloj.ahora(), venceEn: new Date('2027-07-01T12:00:00Z'),
        suspendidaEn: null, creadoEn: reloj.ahora() });
      usuarios.set('adminAjeno', await db.getRepository(Usuario).save({
        negocioId: otroNegocio.id, nombre: 'Ajeno', email: 'ajeno@bloqueos-http.test',
        passwordHash: 'hash', rol: Rol.ADMIN_NEGOCIO, activo: true,
        creadoEn: reloj.ahora(), activadoEn: reloj.ahora() }));
      const perfil = await db.query('INSERT INTO personal (negocio_id,usuario_id) VALUES (?,?)',
        [negocio.id, usuarios.get('profesional')!.id]);
      const sede = await db.query(`INSERT INTO sucursales
        (negocio_id,nombre,direccion,telefono,zona_horaria,activo)
        VALUES (?,'Centro','Calle Uno','6141234567','America/Phoenix',1)`, [negocio.id]);
      await db.query(`INSERT INTO personal_sucursales (negocio_id,personal_id,sucursal_id)
        VALUES (?,?,?)`, [negocio.id, perfil.insertId, sede.insertId]);
      const sedeNuevaYork = await db.query(`INSERT INTO sucursales
        (negocio_id,nombre,direccion,telefono,zona_horaria,activo)
        VALUES (?,'Este','Calle Dos','6141234568','America/New_York',1)`, [negocio.id]);
      await db.query(`INSERT INTO personal_sucursales (negocio_id,personal_id,sucursal_id)
        VALUES (?,?,?)`, [negocio.id, perfil.insertId, sedeNuevaYork.insertId]);
      const tokens: Record<string, string> = {};
      for (const [nombre, usuario] of usuarios) {
        const sesion = await app.get(SesionesService).crear(usuario.id, reloj.ahora());
        tokens[nombre] = app.get(JwtService).sign({ sub: usuario.id,
          sesionId: sesion.id, rol: usuario.rol, negocioId: usuario.negocioId });
      }
      await ejecutar(app, db, { personalId: Number(perfil.insertId),
        sucursalId: Number(sede.insertId),
        sucursales: [Number(sede.insertId), Number(sedeNuevaYork.insertId)], tokens });
    } finally { await app.close(); }
  });
}

describe('T106–T110 HTTP bloqueos y atención resultante', () => {
  it('valida permisos y rangos; aplica unión sobre excepción sin borrar horarios', async () => {
    await conHttp(async (app, db, { personalId, sucursalId, tokens }) => {
      const http = app.getHttpServer();
      const auth = (nombre: string) => ({ type: 'bearer' as const, token: tokens[nombre] });
      const ruta = `/profesionales/${personalId}/atencion?desde=2026-07-06&hasta=2026-07-06`;
      await request(http).post('/bloqueos').auth(auth('recepcion').token, { type: 'bearer' })
        .send(entrada(personalId, sucursalId)).expect(403);
      await request(http).post('/bloqueos').auth(auth('profesional').token, { type: 'bearer' })
        .send(entrada(null, sucursalId)).expect(403);
      await request(http).post('/bloqueos').auth(auth('admin').token, { type: 'bearer' })
        .send({ ...entrada(personalId, sucursalId), finMinutos: null }).expect(400);
      await db.query(`INSERT INTO horarios_personal
        (negocio_id,personal_id,dia_semana,orden,sucursal_id,inicio_minutos,fin_minutos,
         descanso_inicio_minutos,descanso_fin_minutos,activo)
        SELECT negocio_id, ?, 1, 0, ?, 540, 780, 720, 750, 1 FROM personal WHERE id = ?`,
      [personalId, sucursalId, personalId]);
      const primero = await request(http).post('/bloqueos')
        .auth(auth('admin').token, { type: 'bearer' })
        .send(entrada(personalId, sucursalId)).expect(201);
      await request(http).patch(`/bloqueos/${primero.body.id}`)
        .auth(tokens.adminAjeno, { type: 'bearer' })
        .send({ motivo: 'Ajeno' }).expect(404);
      await request(http).delete(`/bloqueos/${primero.body.id}`)
        .auth(tokens.adminAjeno, { type: 'bearer' }).expect(404);
      const segundo = await request(http).post('/bloqueos')
        .auth(auth('profesional').token, { type: 'bearer' })
        .send({ ...entrada(personalId, sucursalId), inicioMinutos: 630,
          finMinutos: 690 }).expect(201);
      expect((await request(http).get('/bloqueos')
        .auth(auth('profesional').token, { type: 'bearer' }).expect(200)).body).toHaveLength(2);
      await request(http).get('/bloqueos').query({ sucursalId: 999999 })
        .auth(tokens.admin, { type: 'bearer' }).expect(404);
      expect((await request(http).get('/bloqueos').query({ personalId })
        .auth(tokens.admin, { type: 'bearer' }).expect(200)).body).toHaveLength(2);
      const atencion = (await request(http).get(ruta)
        .auth(auth('profesional').token, { type: 'bearer' }).expect(200)).body;
      expect(atencion.intervalos.map((x: { inicioMinutos: number; finMinutos: number }) =>
        [x.inicioMinutos, x.finMinutos])).toEqual([[540, 600], [690, 720], [750, 780]]);
      // La excepción sustituye la semana; el bloqueo todavía recorta su franja.
      const cabecera = await db.query(`INSERT INTO excepciones_horario
        (negocio_id,personal_id,sucursal_id,fecha_local)
        SELECT negocio_id, ?, ?, '2026-07-06' FROM personal WHERE id = ?`,
      [personalId, sucursalId, personalId]);
      await db.query(`INSERT INTO franjas_excepcion_horario
        (negocio_id,excepcion_id,orden,inicio_minutos,fin_minutos,
         descanso_inicio_minutos,descanso_fin_minutos)
        SELECT negocio_id, ?, 0, 540, 780, 720, 750 FROM personal WHERE id = ?`,
      [cabecera.insertId, personalId]);
      expect((await request(http).get(ruta)
        .auth(tokens.admin, { type: 'bearer' }).expect(200)).body.intervalos)
        .toEqual(atencion.intervalos);
      await request(http).patch(`/bloqueos/${primero.body.id}`)
        .auth(tokens.profesional, { type: 'bearer' })
        .send({ finMinutos: null }).expect(400);
      await request(http).patch(`/bloqueos/${primero.body.id}`)
        .auth(tokens.profesional, { type: 'bearer' }).send({}).expect(400);
      expect((await request(http).get('/bloqueos')
        .auth(tokens.admin, { type: 'bearer' }).expect(200)).body[0].finMinutos).toBe(660);
      await request(http).patch(`/bloqueos/${primero.body.id}`)
        .auth(auth('profesional').token, { type: 'bearer' })
        .send({ motivo: 'Nuevo viaje' }).expect(200);
      await request(http).delete(`/bloqueos/${primero.body.id}`)
        .auth(auth('profesional').token, { type: 'bearer' }).expect(204);
      expect((await request(http).get(ruta)
        .auth(auth('admin').token, { type: 'bearer' }).expect(200)).body.intervalos)
        .toEqual(expect.arrayContaining([expect.objectContaining({ inicioMinutos: 540,
          finMinutos: 630 })]));
      await request(http).delete(`/bloqueos/${segundo.body.id}`)
        .auth(auth('profesional').token, { type: 'bearer' }).expect(204);
      expect((await db.query('SELECT COUNT(*) total FROM horarios_personal'))[0].total).toBe('1');
    });
  });

  it('aplica colectivo multiday a dos zonas, y rechaza DST inválido sin cambio parcial', async () => {
    await conHttp(async (app, db, { personalId, sucursales, tokens }) => {
      const http = app.getHttpServer();
      // La segunda sede se asigna después del alta: el bloque colectivo la afecta igualmente.
      await db.query(`DELETE FROM personal_sucursales WHERE personal_id = ? AND sucursal_id = ?`,
        [personalId, sucursales[1]]);
      const colectivo = await request(http).post('/bloqueos')
        .auth(tokens.admin, { type: 'bearer' })
        .send({ ...entrada(null, null), fechaInicio: '2026-07-06',
          fechaFin: '2026-07-08', inicioMinutos: 600, finMinutos: 660 }).expect(201);
      await db.query(`INSERT INTO personal_sucursales (negocio_id,personal_id,sucursal_id)
        SELECT negocio_id, ?, ? FROM personal WHERE id = ?`,
      [personalId, sucursales[1], personalId]);
      for (const sede of sucursales) {
        await db.query(`INSERT INTO horarios_personal
          (negocio_id,personal_id,dia_semana,orden,sucursal_id,inicio_minutos,fin_minutos,activo)
          SELECT negocio_id, ?, 2, 0, ?, 540, 720, 1 FROM personal WHERE id = ?`,
        [personalId, sede, personalId]);
      }
      const martes = (await request(http).get(`/profesionales/${personalId}/atencion`)
        .query({ desde: '2026-07-07', hasta: '2026-07-07' })
        .auth(tokens.profesional, { type: 'bearer' }).expect(200)).body;
      expect(martes.intervalos).toHaveLength(0);
      const antes = (await request(http).get('/bloqueos')
        .auth(tokens.admin, { type: 'bearer' }).expect(200)).body;
      await request(http).post('/bloqueos').auth(tokens.admin, { type: 'bearer' })
        .send({ ...entrada(null, null), fechaInicio: '2026-03-08',
          fechaFin: '2026-03-08', inicioMinutos: 150, finMinutos: 180 }).expect(400);
      expect((await request(http).get('/bloqueos')
        .auth(tokens.admin, { type: 'bearer' }).expect(200)).body).toEqual(antes);
      await request(http).patch(`/bloqueos/${colectivo.body.id}`)
        .auth(tokens.profesional, { type: 'bearer' })
        .send({ motivo: 'Cambio prohibido' }).expect(403);
      await request(http).delete(`/bloqueos/${colectivo.body.id}`)
        .auth(tokens.profesional, { type: 'bearer' }).expect(403);
      await request(http).delete(`/bloqueos/${colectivo.body.id}`)
        .auth(tokens.admin, { type: 'bearer' }).expect(204);
      expect((await request(http).get(`/profesionales/${personalId}/atencion`)
        .query({ desde: '2026-07-07', hasta: '2026-07-07' })
        .auth(tokens.admin, { type: 'bearer' }).expect(200)).body.intervalos).toHaveLength(2);
    });
  });

  it('informa la omisión DST y omite borradores y sucursales inactivas', async () => {
    await conHttp(async (app, db, { personalId, sucursales, tokens }) => {
      const http = app.getHttpServer();
      await db.query(`INSERT INTO horarios_personal
        (negocio_id,personal_id,dia_semana,orden,sucursal_id,inicio_minutos,fin_minutos,activo)
        SELECT negocio_id, ?, 0, 0, ?, 90, 210, 1 FROM personal WHERE id = ?`,
      [personalId, sucursales[1], personalId]);
      await db.query(`INSERT INTO horarios_personal
        (negocio_id,personal_id,dia_semana,orden,sucursal_id,inicio_minutos,fin_minutos,activo)
        SELECT negocio_id, ?, 0, 1, ?, NULL, NULL, 0 FROM personal WHERE id = ?`,
      [personalId, sucursales[0], personalId]);
      const ruta = `/profesionales/${personalId}/atencion`;
      const consulta = { desde: '2026-03-08', hasta: '2026-03-08' };
      const lectura = (await request(http).get(ruta).query(consulta)
        .auth(tokens.profesional, { type: 'bearer' }).expect(200)).body;
      expect(lectura.intervalos).toEqual([]);
      expect(lectura.omisiones).toEqual([expect.objectContaining({
        fecha: '2026-03-08', sucursalId: sucursales[1] })]);
      expect(lectura).not.toHaveProperty('ranuras');
      await db.query('UPDATE sucursales SET activo = 0 WHERE id = ?', [sucursales[1]]);
      expect((await request(http).get(ruta).query(consulta)
        .auth(tokens.admin, { type: 'bearer' }).expect(200)).body.omisiones).toEqual([]);
      await request(http).get(ruta).query({ desde: '2026-07-08', hasta: '2026-07-07' })
        .auth(tokens.admin, { type: 'bearer' }).expect(400);
    });
  });
});
