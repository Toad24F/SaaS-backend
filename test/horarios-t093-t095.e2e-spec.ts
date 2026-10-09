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

const franja = (sucursalId: number, inicioMinutos: number, finMinutos: number,
  extra = {}) => ({ diaSemana: 1, orden: 0, sucursalId, inicioMinutos,
    finMinutos, descansoInicioMinutos: null, descansoFinMinutos: null,
    activo: true, ...extra });

// Cuentas y sesiones reales ejercitan guard, matriz de roles y pertenencia actual.
async function conHttp(ejecutar: (app: INestApplication, datos: {
  perfilId: number; ajenoId: number; sucursales: number[];
  tokens: Record<string, string> }) => Promise<void>) {
  await conBaseMigrada(async (db) => {
    const reloj = new RelojPrueba(new Date(Date.now() + 120000));
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DataSource).useValue(db).overrideProvider(RELOJ).useValue(reloj).compile();
    const app = modulo.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true,
      forbidNonWhitelisted: true }));
    try {
      await app.init();
      const negocios: number[] = [];
      for (const letra of ['a', 'b']) {
        const negocio = await db.getRepository(Negocio).save({ nombre: letra,
          slug: `http-horarios-${letra}`, emailContacto: `${letra}@example.test`,
          creadoEn: reloj.ahora(), activadoEn: reloj.ahora(),
          limiteSucursalesActivas: 3 });
        negocios.push(negocio.id);
        await db.getRepository(Licencia).save({ negocioId: negocio.id,
          habilitadaEn: reloj.ahora(),
          venceEn: new Date(reloj.ahora().getTime() + 365 * 86400000),
          suspendidaEn: null });
      }
      const usuarios = new Map<string, Usuario>();
      for (const [nombre, rol, negocioId] of [
        ['admin', Rol.ADMIN_NEGOCIO, negocios[0]],
        ['recepcion', Rol.RECEPCIONISTA, negocios[0]],
        ['profesional', Rol.PROFESIONAL, negocios[0]],
        ['otroProfesional', Rol.PROFESIONAL, negocios[0]],
        ['adminAjeno', Rol.ADMIN_NEGOCIO, negocios[1]],
      ] as const) {
        usuarios.set(nombre, await db.getRepository(Usuario).save({ negocioId,
          nombre, email: `${nombre}@horarios.test`, passwordHash: 'hash',
          rol, activo: true, creadoEn: reloj.ahora(), activadoEn: reloj.ahora() }));
      }
      const perfiles: number[] = [];
      for (const nombre of ['profesional', 'otroProfesional']) {
        const usuarioId = usuarios.get(nombre)!.id;
        await db.query('INSERT INTO personal (id,negocio_id) VALUES (?,?)',
          [usuarioId, negocios[0]]);
        perfiles.push(usuarioId);
      }
      const sucursales: number[] = [];
      for (const zona of ['America/New_York', 'America/Phoenix']) {
        const alta = await db.query(`INSERT INTO sucursales
          (negocio_id,nombre,direccion,telefono,zona_horaria)
          VALUES (?,'Sede','Calle Uno','6141234567',?)`, [negocios[0], zona]);
        sucursales.push(Number(alta.insertId));
        await db.query(`INSERT INTO personal_sucursales
          (negocio_id,personal_id,sucursal_id) VALUES (?,?,?)`,
        [negocios[0], perfiles[0], alta.insertId]);
      }
      const tokens: Record<string, string> = {};
      for (const [nombre, usuario] of usuarios) {
        const sesion = await app.get(SesionesService).crear(usuario.id, reloj.ahora());
        tokens[nombre] = app.get(JwtService).sign({ sub: usuario.id,
          sesionId: sesion.id, rol: usuario.rol, negocioId: usuario.negocioId });
      }
      await ejecutar(app, { perfilId: perfiles[0], ajenoId: perfiles[1],
        sucursales, tokens });
    } finally { await app.close(); }
  });
}

describe('T093–T095 rutas de horario', () => {
  it('admin y dueño consultan y guardan; recepción y otro profesional no editan', async () => {
    await conHttp(async (app, { perfilId, ajenoId, sucursales, tokens }) => {
      const http = app.getHttpServer();
      const ruta = `/profesionales/${perfilId}/horario`;
      await request(http).put(ruta).auth(tokens.recepcion, { type: 'bearer' })
        .send({ franjas: [] }).expect(403);
      await request(http).put(ruta).auth(tokens.otroProfesional, { type: 'bearer' })
        .send({ franjas: [] }).expect(403);
      await request(http).get(ruta).auth(tokens.adminAjeno, { type: 'bearer' }).expect(404);
      const guardada = await request(http).put(ruta)
        .auth(tokens.admin, { type: 'bearer' }).send({ franjas: [
          franja(sucursales[0], 540, 600),
          franja(sucursales[1], 720, null, { activo: false }),
        ] }).expect(200);
      expect(guardada.body).toHaveLength(2);
      expect(guardada.body[0].id).toEqual(expect.any(Number));
      const lectura = await request(http).get(ruta)
        .auth(tokens.profesional, { type: 'bearer' }).expect(200);
      expect(lectura.body).toEqual(guardada.body);
      await request(http).get(`/profesionales/${ajenoId}/horario`)
        .auth(tokens.profesional, { type: 'bearer' }).expect(403);
      const invalida = await request(http).put(ruta)
        .auth(tokens.profesional, { type: 'bearer' })
        .send({ franjas: [{ ...guardada.body[0], finMinutos: null }] }).expect(400);
      expect(JSON.stringify(invalida.body)).toMatch(/fila 0.*finMinutos/);
      expect((await request(http).get(ruta)
        .auth(tokens.admin, { type: 'bearer' }).expect(200)).body).toEqual(guardada.body);
    });
  });

  it('expone excepción vacía, conflicto entre zonas y retiro con propietario', async () => {
    await conHttp(async (app, { perfilId, sucursales, tokens }) => {
      const http = app.getHttpServer();
      const ruta = `/profesionales/${perfilId}`;
      await request(http).put(`${ruta}/horario`).auth(tokens.admin, { type: 'bearer' })
        .send({ franjas: [franja(sucursales[0], 540, 600)] }).expect(200);
      const fecha = '2026-01-12';
      const especial = `${ruta}/excepciones/${fecha}`;
      await request(http).put(especial).auth(tokens.recepcion, { type: 'bearer' })
        .send({ sucursalId: sucursales[0], franjas: [] }).expect(403);
      await request(http).put(especial).auth(tokens.otroProfesional, { type: 'bearer' })
        .send({ sucursalId: sucursales[0], franjas: [] }).expect(403);
      const cierre = await request(http).put(especial)
        .auth(tokens.profesional, { type: 'bearer' })
        .send({ sucursalId: sucursales[0], franjas: [] }).expect(200);
      expect(cierre.body).toMatchObject({ fechaLocal: fecha, franjas: [] });
      const consulta = await request(http).get(`${ruta}/excepciones`)
        .auth(tokens.admin, { type: 'bearer' }).expect(200);
      expect(consulta.body).toEqual([cierre.body]);
      await request(http).put(especial).auth(tokens.admin, { type: 'bearer' })
        .send({ sucursalId: sucursales[1], franjas: [{ orden: 0,
          inicioMinutos: 420, finMinutos: 480,
          descansoInicioMinutos: null, descansoFinMinutos: null }] }).expect(200);
      await request(http).delete(`${especial}?sucursalId=${sucursales[0]}`)
        .auth(tokens.profesional, { type: 'bearer' }).expect(409);
      expect((await request(http).get(`${ruta}/excepciones`)
        .auth(tokens.admin, { type: 'bearer' }).expect(200)).body).toHaveLength(2);
    });
  });
});
