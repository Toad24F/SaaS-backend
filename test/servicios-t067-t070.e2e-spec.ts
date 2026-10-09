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

// Una base migrada y JWT con sesión real ejercitan migración, permisos y HTTP juntos.
async function conHttp(ejecutar: (app: INestApplication, db: DataSource,
  tokens: string[], negocios: Negocio[]) => Promise<void>) {
  await conBaseMigrada(async (db) => {
    const reloj = new RelojPrueba(new Date(Date.now() + 120000));
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DataSource).useValue(db).overrideProvider(RELOJ).useValue(reloj).compile();
    const app = modulo.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true,
      forbidNonWhitelisted: true }));
    try {
      await app.init();
      const usuarios: Usuario[] = [];
      const negocios: Negocio[] = [];
      for (const letra of ['a', 'b']) {
        const negocio = await db.getRepository(Negocio).save({ nombre: letra,
          slug: `http-serv-${letra}`, emailContacto: `${letra}@example.test`,
          activadoEn: reloj.ahora(), limiteSucursalesActivas: 1 });
        negocios.push(negocio);
        await db.getRepository(Licencia).save({ negocioId: negocio.id,
          habilitadaEn: reloj.ahora(), venceEn: new Date(reloj.ahora().getTime() + 365 * 86400000),
          suspendidaEn: null });
        for (const rol of [Rol.ADMIN_NEGOCIO, Rol.RECEPCIONISTA, Rol.PROFESIONAL]) {
          usuarios.push(await db.getRepository(Usuario).save({ negocioId: negocio.id,
            nombre: rol, email: `serv-${rol}-${letra}@example.test`, passwordHash: 'hash',
            rol, activo: true, creadoEn: reloj.ahora(), activadoEn: reloj.ahora() }));
        }
      }
      const tokens: string[] = [];
      for (const usuario of usuarios) {
        const sesion = await app.get(SesionesService).crear(usuario.id, reloj.ahora());
        tokens.push(app.get(JwtService).sign({ sub: usuario.id, sesionId: sesion.id,
          rol: usuario.rol, negocioId: usuario.negocioId }));
      }
      await ejecutar(app, db, tokens, negocios);
    } finally { await app.close(); }
  });
}

describe('M1-T067–T070: catálogo global de servicios', () => {
  it('migra costo decimal exacto, duración positiva, pertenencia y estado', async () => {
    await conHttp(async (_app, db, _tokens, negocios) => {
      const columnas = await db.query('SHOW COLUMNS FROM servicios') as { Field: string; Type: string }[];
      expect(Object.fromEntries(columnas.map((c) => [c.Field, c.Type]))).toMatchObject({
        negocio_id: 'int(10) unsigned', costo: 'decimal(10,2)',
        duracion_minutos: 'int(10) unsigned', activo: 'tinyint(1)',
      });
      await db.query('INSERT INTO servicios (negocio_id,nombre,costo,duracion_minutos) VALUES (?,?,?,?)',
        [negocios[0].id, 'Preciso', '12345678.91', 30]);
      const filas = await db.query('SELECT costo, activo FROM servicios WHERE nombre = ?', ['Preciso']) as
        { costo: string; activo: number }[];
      expect(filas[0]).toMatchObject({ costo: '12345678.91', activo: 1 });
      await expect(db.query('INSERT INTO servicios (negocio_id,nombre,costo,duracion_minutos) VALUES (?,?,?,?)',
        [negocios[0].id, 'Negativo', '-1.00', 30])).rejects.toThrow();
      await expect(db.query('INSERT INTO servicios (negocio_id,nombre,costo,duracion_minutos) VALUES (?,?,?,?)',
        [negocios[0].id, 'Cero minutos', '0.00', 0])).rejects.toThrow();
    });
  });

  it('crea, valida, edita y cambia estado sin borrar ni variar precio por ubicación', async () => {
    await conHttp(async (app, db, tokens, negocios) => {
      const http = app.getHttpServer();
      const alta = await request(http).post('/servicios').auth(tokens[0], { type: 'bearer' })
        .send({ nombre: 'Consulta', costo: '0.00', duracionMinutos: 30 }).expect(201);
      expect(alta.body).toMatchObject({ negocioId: negocios[0].id, nombre: 'Consulta',
        costo: '0.00', duracionMinutos: 30, activo: true });
      const id = alta.body.id;
      for (const datos of [{ nombre: 'Mal', costo: '-0.01', duracionMinutos: 30 },
        { nombre: 'Mal', costo: '1.00', duracionMinutos: 0 },
        { nombre: 'Mal', costo: '1.00', duracionMinutos: 1.5 },
        { nombre: 'Mal', costo: '1.001', duracionMinutos: 30 },
        { nombre: 'Mal', costo: '1.00', duracionMinutos: 30, negocioId: negocios[1].id }]) {
        await request(http).post('/servicios').auth(tokens[0], { type: 'bearer' })
          .send(datos).expect(400);
      }
      const editado = await request(http).patch(`/servicios/${id}`).auth(tokens[0], { type: 'bearer' })
        .send({ costo: '12.34', duracionMinutos: 45 }).expect(200);
      expect(editado.body).toMatchObject({ costo: '12.34', duracionMinutos: 45 });
      await request(http).patch(`/servicios/${id}`).auth(tokens[0], { type: 'bearer' })
        .send({ sucursalId: 1 }).expect(400);
      await request(http).patch(`/servicios/${id}`).auth(tokens[0], { type: 'bearer' })
        .send({ activo: false }).expect(400);
      await request(http).post(`/servicios/${id}/desactivar`).auth(tokens[0], { type: 'bearer' })
        .send({}).expect(204);
      await request(http).post(`/servicios/${id}/desactivar`).auth(tokens[0], { type: 'bearer' })
        .send({}).expect(204);
      expect((await request(http).get(`/servicios/${id}`).auth(tokens[0], { type: 'bearer' })
        .expect(200)).body.activo).toBe(false);
      await request(http).post(`/servicios/${id}/reactivar`).auth(tokens[0], { type: 'bearer' })
        .send({}).expect(204);
      await request(http).post(`/servicios/${id}/reactivar`).auth(tokens[0], { type: 'bearer' })
        .send({}).expect(204);
      expect((await request(http).get('/servicios').auth(tokens[0], { type: 'bearer' })
        .expect(200)).body).toMatchObject([{ id, costo: '12.34', duracionMinutos: 45,
        activo: true }]);
      expect(Number((await db.query('SELECT COUNT(*) total FROM servicios WHERE id = ?', [id]) as
        { total: string }[])[0].total)).toBe(1);
      const auditoria = await db.query(`SELECT accion FROM eventos_auditoria
        WHERE recurso_tipo = 'servicio' AND recurso_id = ? ORDER BY id`, [id]) as
        { accion: string }[];
      expect(auditoria.map((evento) => evento.accion)).toEqual([
        'servicio_creado', 'servicio_editado', 'servicio_desactivado', 'servicio_reactivado',
      ]);
    });
  });

  it('mantiene control global administrativo y aísla el catálogo entre negocios', async () => {
    await conHttp(async (app, _db, tokens) => {
      const http = app.getHttpServer();
      const alta = await request(http).post('/servicios').auth(tokens[0], { type: 'bearer' })
        .send({ nombre: 'Consulta', costo: '99.99', duracionMinutos: 30 }).expect(201);
      const id = alta.body.id;
      await request(http).get('/servicios').auth(tokens[1], { type: 'bearer' }).expect(403);
      await request(http).post('/servicios').auth(tokens[1], { type: 'bearer' })
        .send({ nombre: 'Ajeno', costo: '1.00', duracionMinutos: 10 }).expect(403);
      // El Profesional puede consultar su catálogo; esta cuenta histórica sin perfil no puede crear.
      expect((await request(http).get('/servicios').auth(tokens[2], { type: 'bearer' })
        .expect(200)).body).toEqual([expect.objectContaining({ id })]);
      await request(http).post('/servicios').auth(tokens[2], { type: 'bearer' })
        .send({ nombre: 'Sin perfil', costo: '1.00', duracionMinutos: 10 }).expect(403);
      await request(http).patch(`/servicios/${id}`).auth(tokens[2], { type: 'bearer' })
        .send({ nombre: 'Ajeno' }).expect(403);
      await request(http).post(`/servicios/${id}/desactivar`)
        .auth(tokens[2], { type: 'bearer' }).send({}).expect(403);
      expect((await request(http).get('/servicios').auth(tokens[3], { type: 'bearer' })
        .expect(200)).body).toEqual([]);
      await request(http).get(`/servicios/${id}`).auth(tokens[3], { type: 'bearer' }).expect(404);
      await request(http).patch(`/servicios/${id}`).auth(tokens[3], { type: 'bearer' })
        .send({ nombre: 'Ajeno' }).expect(404);
      for (const accion of ['desactivar', 'reactivar']) {
        await request(http).post(`/servicios/${id}/${accion}`).auth(tokens[3], { type: 'bearer' })
          .send({}).expect(404);
      }
      await request(http).get('/servicios').expect(401);
    });
  });
});
