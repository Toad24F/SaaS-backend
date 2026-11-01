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

const fila = (sucursalId: number, inicioMinutos: number, finMinutos: number,
  extra = {}) => ({ diaSemana: 1, orden: 0, sucursalId, inicioMinutos,
    finMinutos, activo: true, ...extra });

// Cada caso migra y elimina su propia base; la autenticación usa sesiones reales.
async function conHorario(ejecutar: (app: INestApplication, db: DataSource,
  datos: { ruta: string; perfilId: number; negocioId: number;
    sucursalId: number; token: string }) => Promise<void>) {
  await conBaseMigrada(async (db) => {
    const reloj = new RelojPrueba(new Date('2026-11-01T12:00:00.000Z'));
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DataSource).useValue(db).overrideProvider(RELOJ).useValue(reloj).compile();
    const app = modulo.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true,
      forbidNonWhitelisted: true }));
    try {
      await app.init();
      const negocio = await db.getRepository(Negocio).save({ nombre: 'Agenda',
        slug: 'ala-horarios', emailContacto: 'agenda@example.test',
        creadoEn: reloj.ahora(), activadoEn: reloj.ahora(), limiteSucursalesActivas: 2 });
      await db.getRepository(Licencia).save({ negocioId: negocio.id,
        habilitadaEn: reloj.ahora(), venceEn: new Date('2027-11-01T12:00:00.000Z'),
        suspendidaEn: null });
      const usuario = await db.getRepository(Usuario).save({ negocioId: negocio.id,
        nombre: 'Profesional', email: 'profesional@ala.test', passwordHash: 'hash',
        rol: Rol.PROFESIONAL, activo: true, creadoEn: reloj.ahora(),
        activadoEn: reloj.ahora() });
      await db.query('INSERT INTO personal (id,negocio_id) VALUES (?,?)',
        [usuario.id, negocio.id]);
      const alta = await db.query(`INSERT INTO sucursales
        (negocio_id,nombre,direccion,telefono,zona_horaria)
        VALUES (?,'Centro','Calle Uno','6141234567','UTC')`, [negocio.id]);
      const sucursalId = Number(alta.insertId);
      await db.query(`INSERT INTO personal_sucursales
        (negocio_id,personal_id,sucursal_id) VALUES (?,?,?)`,
      [negocio.id, usuario.id, sucursalId]);
      const sesion = await app.get(SesionesService).crear(usuario.id, reloj.ahora());
      const token = app.get(JwtService).sign({ sub: usuario.id, sesionId: sesion.id,
        rol: usuario.rol, negocioId: negocio.id });
      await ejecutar(app, db, { ruta: `/profesionales/${usuario.id}`,
        perfilId: usuario.id, negocioId: negocio.id, sucursalId, token });
    } finally { await app.close(); }
  });
}

describe('ALA-T082–T085: semana sin descanso ni excepciones', () => {
  it('rechaza descanso, retira rutas y conserva huecos entre franjas', async () => {
    await conHorario(async (app, _db, { ruta, sucursalId, token }) => {
      const http = app.getHttpServer();
      await request(http).put(`${ruta}/horario`).auth(token, { type: 'bearer' })
        .send({ franjas: [fila(sucursalId, 540, 600,
          { descansoInicioMinutos: null })] }).expect(400);
      for (const metodo of ['get', 'put', 'delete'] as const) {
        const url = metodo === 'get' ? `${ruta}/excepciones` :
          `${ruta}/excepciones/2026-11-02`;
        await request(http)[metodo](url).auth(token, { type: 'bearer' }).expect(404);
      }
      const respuesta = await request(http).put(`${ruta}/horario`)
        .auth(token, { type: 'bearer' }).send({ franjas: [
          fila(sucursalId, 540, 600), fila(sucursalId, 630, 660, { orden: 1 }),
        ] }).expect(200);
      expect(respuesta.body).toHaveLength(2);
      expect(respuesta.body[0]).not.toHaveProperty('descansoInicioMinutos');
      expect(respuesta.body[0]).not.toHaveProperty('descansoFinMinutos');
      const lectura = await request(http).get(`${ruta}/horario`)
        .auth(token, { type: 'bearer' }).expect(200);
      expect(lectura.body).toEqual(respuesta.body);
      const atencion = await request(http).get(`${ruta}/atencion`)
        .query({ desde: '2026-11-02', hasta: '2026-11-02' })
        .auth(token, { type: 'bearer' }).expect(200);
      expect(atencion.body.intervalos.map((x: { inicioMinutos: number;
        finMinutos: number }) => [x.inicioMinutos, x.finMinutos]))
        .toEqual([[540, 600], [630, 660]]);
    });
  });

  it('fusiona, conserva ID, audita antes/después y revierte un conflicto', async () => {
    await conHorario(async (app, db, { ruta, sucursalId, perfilId, negocioId, token }) => {
      const http = app.getHttpServer();
      const primera = await request(http).put(`${ruta}/horario`)
        .auth(token, { type: 'bearer' }).send({ franjas: [
          fila(sucursalId, 540, 600), fila(sucursalId, 600, 660, { orden: 1 }),
        ] }).expect(200);
      expect(primera.body).toHaveLength(1);
      expect(primera.body[0]).toMatchObject({ inicioMinutos: 540,
        finMinutos: 660, orden: 0 });
      const id = primera.body[0].id;
      const segunda = await request(http).put(`${ruta}/horario`)
        .auth(token, { type: 'bearer' }).send({ franjas: [
          fila(sucursalId, 540, 660, { id }), fila(sucursalId, 660, 720, { orden: 1 }),
        ] }).expect(200);
      expect(segunda.body).toHaveLength(1);
      expect(segunda.body[0]).toMatchObject({ id, inicioMinutos: 540,
        finMinutos: 720 });
      // Repetir la misma semana no duplica la evidencia de un cambio real.
      await request(http).put(`${ruta}/horario`).auth(token, { type: 'bearer' })
        .send({ franjas: segunda.body }).expect(200);
      await request(http).put(`${ruta}/horario`).auth(token, { type: 'bearer' })
        .send({ franjas: [fila(sucursalId, 540, 660, { id }),
          fila(sucursalId, 600, 720, { orden: 1 })] }).expect(409);
      expect((await request(http).get(`${ruta}/horario`)
        .auth(token, { type: 'bearer' }).expect(200)).body).toEqual(segunda.body);
      const eventos = await db.query(`SELECT accion, valores_antes, valores_despues
        FROM eventos_auditoria WHERE negocio_id=? AND recurso_tipo='horario'
        ORDER BY id`, [negocioId]);
      expect(eventos).toHaveLength(2);
      expect(JSON.stringify(eventos)).toContain('540');
      expect(JSON.stringify(eventos)).toContain('720');
      expect(Number((await db.query('SELECT COUNT(*) total FROM horarios_personal WHERE personal_id=?',
        [perfilId]))[0].total)).toBe(1);
    });
  });

  it('conserva datos históricos y cierra la lectura si requieren transición', async () => {
    await conHorario(async (app, db, { ruta, sucursalId, perfilId, negocioId, token }) => {
      const alta = await db.query(`INSERT INTO excepciones_horario
        (negocio_id,personal_id,sucursal_id,fecha_local) VALUES (?,?,?,'2026-11-02')`,
      [negocioId, perfilId, sucursalId]);
      await request(app.getHttpServer()).get(`${ruta}/horario`)
        .auth(token, { type: 'bearer' }).expect(409);
      expect((await db.query('SELECT COUNT(*) total FROM excepciones_horario WHERE id=?',
        [alta.insertId]))[0].total).toBe('1');
    });
  });
});
