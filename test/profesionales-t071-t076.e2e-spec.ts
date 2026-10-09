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
import { AuditoriaService } from '../src/auditoria/auditoria.service';
import { CorreoAcceso } from '../src/altas/entities/correo-acceso.entity';

const password = 'Clave-profesional-123';

// Base desechable y sesiones reales: prueba las restricciones SQL y los guards juntos.
async function conHttp(ejecutar: (app: INestApplication, db: DataSource,
  tokens: string[], negocios: Negocio[], reloj: RelojPrueba) => Promise<void>) {
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
          slug: `http-prof-${letra}`, emailContacto: `${letra}@example.test`,
          activadoEn: reloj.ahora(), limiteSucursalesActivas: 3 });
        negocios.push(negocio);
        await db.getRepository(Licencia).save({ negocioId: negocio.id,
          habilitadaEn: reloj.ahora(), venceEn: new Date(reloj.ahora().getTime() + 365 * 86400000),
          suspendidaEn: null });
        for (const rol of [Rol.ADMIN_NEGOCIO, Rol.RECEPCIONISTA]) {
          usuarios.push(await db.getRepository(Usuario).save({ negocioId: negocio.id,
            nombre: rol, email: `prof-${rol}-${letra}@example.test`, passwordHash: 'hash',
            rol, activo: true, creadoEn: reloj.ahora(), activadoEn: reloj.ahora() }));
        }
      }
      const tokens: string[] = [];
      for (const usuario of usuarios) {
        const sesion = await app.get(SesionesService).crear(usuario.id, reloj.ahora());
        tokens.push(app.get(JwtService).sign({ sub: usuario.id, sesionId: sesion.id,
          rol: usuario.rol, negocioId: usuario.negocioId }));
      }
      await ejecutar(app, db, tokens, negocios, reloj);
    } finally { await app.close(); }
  });
}

const alta = { nombre: 'Ana Profesional', correo: 'ana-prof@example.test', password };
const sucursal = { nombre: 'Centro', direccion: 'Calle Uno 5', telefono: '6141234567',
  zonaHoraria: 'America/Chihuahua' };

describe('M1-T071–T076: perfil Profesional', () => {
  it('migra perfil y relaciones con unicidad y claves compuestas de tenant', async () => {
    await conHttp(async (_app, db, _tokens, negocios, reloj) => {
      const usuario = await db.getRepository(Usuario).save({ negocioId: negocios[0].id,
        nombre: 'Ana', email: 'modelo-prof@example.test', passwordHash: 'hash',
        rol: Rol.PROFESIONAL, activo: true, creadoEn: reloj.ahora(), activadoEn: reloj.ahora() });
      await db.query('INSERT INTO personal (id,negocio_id) VALUES (?,?)',
        [usuario.id, negocios[0].id]);
      await expect(db.query('INSERT INTO personal (id,negocio_id) VALUES (?,?)',
        [usuario.id, negocios[0].id])).rejects.toThrow();
      await expect(db.query('INSERT INTO personal (id,negocio_id) VALUES (?,?)',
        [usuario.id, negocios[1].id])).rejects.toThrow();
      const suc = await db.query(`INSERT INTO sucursales
        (negocio_id,nombre,direccion,telefono,zona_horaria) VALUES (?,'Centro','Calle','6141234567','UTC')`,
        [negocios[0].id]);
      const ajena = await db.query(`INSERT INTO sucursales
        (negocio_id,nombre,direccion,telefono,zona_horaria) VALUES (?,'Ajena','Calle','6141234567','UTC')`,
        [negocios[1].id]);
      await db.query('INSERT INTO personal_sucursales (negocio_id,personal_id,sucursal_id) VALUES (?,?,?)',
        [negocios[0].id, usuario.id, suc.insertId]);
      await expect(db.query('INSERT INTO personal_sucursales (negocio_id,personal_id,sucursal_id) VALUES (?,?,?)',
        [negocios[0].id, usuario.id, suc.insertId])).rejects.toThrow();
      await expect(db.query('INSERT INTO personal_sucursales (negocio_id,personal_id,sucursal_id) VALUES (?,?,?)',
        [negocios[0].id, usuario.id, ajena.insertId])).rejects.toThrow();
      const servicio = await db.query(`INSERT INTO servicios
        (negocio_id,nombre,costo,duracion_minutos) VALUES (?,'Consulta',0,30)`, [negocios[0].id]);
      await db.query('INSERT INTO personal_servicios (negocio_id,personal_id,servicio_id) VALUES (?,?,?)',
        [negocios[0].id, usuario.id, servicio.insertId]);
      await expect(db.query('INSERT INTO personal_servicios (negocio_id,personal_id,servicio_id) VALUES (?,?,?)',
        [negocios[0].id, usuario.id, servicio.insertId])).rejects.toThrow();
      const servicioAjeno = await db.query(`INSERT INTO servicios
        (negocio_id,nombre,costo,duracion_minutos) VALUES (?,'Ajeno',0,30)`, [negocios[1].id]);
      await expect(db.query('INSERT INTO personal_servicios (negocio_id,personal_id,servicio_id) VALUES (?,?,?)',
        [negocios[0].id, usuario.id, servicioAjeno.insertId])).rejects.toThrow();
      const columnas = await db.query('SHOW COLUMNS FROM personal') as { Field: string }[];
      expect(columnas.map((c) => c.Field)).not.toEqual(expect.arrayContaining([
        'nombre', 'email', 'password_hash', 'activo', 'usuario_id',
      ]));
    });
  });

  it('crea cuenta completa y perfil, reserva correo y revierte errores', async () => {
    await conHttp(async (app, db, tokens, negocios) => {
      const http = app.getHttpServer();
      await request(http).post('/profesionales').auth(tokens[1], { type: 'bearer' })
        .send(alta).expect(403);
      await request(http).post('/profesionales').auth(tokens[0], { type: 'bearer' })
        .send({ ...alta, password: 'corta' }).expect(400);
      expect(await db.getRepository(Usuario).countBy({ email: alta.correo })).toBe(0);
      const auditoria = jest.spyOn(app.get(AuditoriaService), 'registrar')
        .mockRejectedValueOnce(new Error('Fallo de auditoría inyectado'));
      try {
        await request(http).post('/profesionales').auth(tokens[0], { type: 'bearer' })
          .send(alta).expect(500);
      } finally { auditoria.mockRestore(); }
      // El error posterior al perfil debe revertir también usuario y reserva.
      expect(await db.getRepository(Usuario).countBy({ email: alta.correo })).toBe(0);
      expect(await db.getRepository(CorreoAcceso).countBy({ correo: alta.correo })).toBe(0);
      const creada = await request(http).post('/profesionales').auth(tokens[0], { type: 'bearer' })
        .send(alta).expect(201);
      expect(creada.body).toMatchObject({ negocioId: negocios[0].id, nombre: alta.nombre,
        correo: alta.correo, activo: true });
      expect(JSON.stringify(creada.body)).not.toMatch(/password|hash/i);
      const usuario = await db.getRepository(Usuario).findOneByOrFail({ email: alta.correo });
      expect(creada.body.id).toBe(usuario.id);
      expect(creada.body.usuarioId).toBe(usuario.id);
      expect(usuario.rol).toBe(Rol.PROFESIONAL);
      expect(usuario.passwordHash).not.toBe(password);
      expect((await db.query('SELECT COUNT(*) total FROM correos_acceso WHERE usuario_id = ?',
        [usuario.id]) as { total: string }[])[0].total).toBe('1');
      await request(http).post('/profesionales').auth(tokens[0], { type: 'bearer' })
        .send(alta).expect(409);
      expect(await db.getRepository(Usuario).countBy({ email: alta.correo })).toBe(1);
    });
  });

  it('asigna varias sucursales propias; rechaza ajenas, rol y perfil cruzado', async () => {
    await conHttp(async (app, db, tokens, _negocios, reloj) => {
      const http = app.getHttpServer();
      const perfil = await request(http).post('/profesionales').auth(tokens[0], { type: 'bearer' })
        .send(alta).expect(201);
      const ids: number[] = [];
      for (const nombre of ['Centro', 'Norte']) {
        const res = await request(http).post('/sucursales').auth(tokens[0], { type: 'bearer' })
          .send({ ...sucursal, nombre }).expect(201);
        ids.push(res.body.id);
      }
      const ajena = await request(http).post('/sucursales').auth(tokens[2], { type: 'bearer' })
        .send(sucursal).expect(201);
      await request(http).put(`/profesionales/${perfil.body.id}/sucursales`)
        .auth(tokens[0], { type: 'bearer' }).send({ sucursalIds: ids }).expect(200);
      expect((await request(http).get(`/profesionales/${perfil.body.id}/sucursales`)
        .auth(tokens[0], { type: 'bearer' }).expect(200)).body).toEqual(ids);
      await request(http).put(`/profesionales/${perfil.body.id}/sucursales`)
        .auth(tokens[0], { type: 'bearer' }).send({ sucursalIds: [ajena.body.id] }).expect(404);
      await request(http).put(`/profesionales/${perfil.body.id}/sucursales`)
        .auth(tokens[1], { type: 'bearer' }).send({ sucursalIds: [] }).expect(403);
      const profesional = await db.getRepository(Usuario).findOneByOrFail({ email: alta.correo });
      const sesion = await app.get(SesionesService).crear(profesional.id, reloj.ahora());
      const tokenPropio = app.get(JwtService).sign({ sub: profesional.id, sesionId: sesion.id,
        rol: Rol.PROFESIONAL, negocioId: profesional.negocioId });
      await request(http).put(`/profesionales/${perfil.body.id}/sucursales`)
        .auth(tokenPropio, { type: 'bearer' }).send({ sucursalIds: [] }).expect(403);
      await request(http).get(`/profesionales/${perfil.body.id}`).auth(tokens[2], { type: 'bearer' })
        .expect(404);
      expect((await request(http).get(`/profesionales/${perfil.body.id}/sucursales`)
        .auth(tokens[0], { type: 'bearer' }).expect(200)).body).toEqual(ids);
    });
  });

  it('desactiva y reactiva sin revivir sesión; edita nombre y correo con reserva', async () => {
    await conHttp(async (app, db, tokens, _negocios, reloj) => {
      const http = app.getHttpServer();
      const perfil = await request(http).post('/profesionales').auth(tokens[0], { type: 'bearer' })
        .send(alta).expect(201);
      const id = perfil.body.id;
      const usuario = await db.getRepository(Usuario).findOneByOrFail({ email: alta.correo });
      const sesion = await app.get(SesionesService).crear(usuario.id, reloj.ahora());
      const token = app.get(JwtService).sign({ sub: usuario.id, sesionId: sesion.id,
        rol: Rol.PROFESIONAL, negocioId: usuario.negocioId });
      await request(http).get('/auth/profile').auth(token, { type: 'bearer' }).expect(200);
      await request(http).post(`/profesionales/${id}/desactivar`).auth(tokens[0], { type: 'bearer' })
        .send({}).expect(204);
      await request(http).get('/auth/profile').auth(token, { type: 'bearer' }).expect(401);
      await request(http).post(`/profesionales/${id}/reactivar`).auth(tokens[0], { type: 'bearer' })
        .send({}).expect(204);
      await request(http).get('/auth/profile').auth(token, { type: 'bearer' }).expect(401);
      await request(http).patch(`/profesionales/${id}`).auth(tokens[0], { type: 'bearer' })
        .send({ nombre: 'Ana Nueva', correo: 'nuevo-prof@example.test' }).expect(200);
      await request(http).patch(`/profesionales/${id}`).auth(tokens[0], { type: 'bearer' })
        .send({ password: 'corta' }).expect(400);
      await request(http).patch(`/profesionales/${id}`).auth(tokens[0], { type: 'bearer' })
        .send({ correo: 'prof-admin_negocio-a@example.test' }).expect(409);
      expect((await request(http).get(`/profesionales/${id}`).auth(tokens[0], { type: 'bearer' })
        .expect(200)).body).toMatchObject({ nombre: 'Ana Nueva', correo: 'nuevo-prof@example.test',
        activo: true });
      const nuevaSesion = await app.get(SesionesService).crear(usuario.id, reloj.ahora());
      const nuevoToken = app.get(JwtService).sign({ sub: usuario.id, sesionId: nuevaSesion.id,
        rol: Rol.PROFESIONAL, negocioId: usuario.negocioId });
      await request(http).get('/auth/profile').auth(nuevoToken, { type: 'bearer' }).expect(200);
    });
  });
});
