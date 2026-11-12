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
    finMinutos, activo: true, ...extra });

// Cuentas y sesiones reales ejercitan guard, matriz de roles y pertenencia actual.
async function conHttp(ejecutar: (app: INestApplication, datos: {
  db: DataSource; reloj: RelojPrueba;
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
        ['recepcionAjena', Rol.RECEPCIONISTA, negocios[1]],
        ['superadmin', Rol.SUPERADMIN, null],
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
      // Las dos zonas comparten negocio, pero cada sucursal requiere nombre único.
      for (const [indice, zona] of ['America/New_York', 'America/Phoenix'].entries()) {
        const alta = await db.query(`INSERT INTO sucursales
          (negocio_id,nombre,direccion,telefono,zona_horaria)
          VALUES (?,?,'Calle Uno','6141234567',?)`,
        [negocios[0], `Sede ${indice + 1}`, zona]);
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
      await ejecutar(app, { db, reloj, perfilId: perfiles[0], ajenoId: perfiles[1],
        sucursales, tokens });
    } finally { await app.close(); }
  });
}

describe('T093–T095 rutas de horario', () => {
  it('M4: Recepción lee semana y atención con bloqueos, sin adquirir escritura ni acceso al listado', async () => {
    await conHttp(async (app, { perfilId, ajenoId, sucursales, tokens }) => {
      const http = app.getHttpServer();
      const ruta = `/profesionales/${perfilId}`;
      const semana = (await request(http).put(`${ruta}/horario`)
        .auth(tokens.admin, { type: 'bearer' }).send({ franjas: [
          franja(sucursales[0], 540, 780),
        ] }).expect(200)).body;
      const bloques: { id: number }[] = [];
      // Bloqueos de otro perfil o negocio no deben cerrar esta atención.
      for (const [nombre, personalId] of [['admin', ajenoId], ['adminAjeno', null]] as const) {
        await request(http).post('/bloqueos').auth(tokens[nombre], { type: 'bearer' })
          .send({ personalId, sucursalId: null, tipo: 'vacaciones', motivo: 'Otro alcance',
            fechaInicio: '2026-07-06', fechaFin: '2026-07-06',
            inicioMinutos: 540, finMinutos: 780 }).expect(201);
      }
      for (const [personalId, inicioMinutos, finMinutos] of [
        [perfilId, 600, 660], [null, 690, 720],
      ]) {
        bloques.push((await request(http).post('/bloqueos')
          .auth(tokens.admin, { type: 'bearer' }).send({ personalId,
            sucursalId: sucursales[0], tipo: 'vacaciones', motivo: 'Ausencia',
            fechaInicio: '2026-07-06', fechaFin: '2026-07-06',
            inicioMinutos, finMinutos }).expect(201)).body);
      }
      expect((await request(http).get(`${ruta}/horario`)
        .auth(tokens.recepcion, { type: 'bearer' }).expect(200)).body).toEqual(semana);
      const consulta = `${ruta}/atencion?desde=2026-07-06&hasta=2026-07-06`;
      const atencion = (await request(http).get(consulta)
        .auth(tokens.recepcion, { type: 'bearer' }).expect(200)).body;
      expect(atencion.intervalos.map((x: { inicioMinutos: number; finMinutos: number }) =>
        [x.inicioMinutos, x.finMinutos])).toEqual([[540, 600], [660, 690], [720, 780]]);
      for (const nombre of ['admin', 'profesional']) {
        expect((await request(http).get(consulta)
          .auth(tokens[nombre], { type: 'bearer' }).expect(200)).body).toEqual(atencion);
      }
      await request(http).put(`${ruta}/horario`).auth(tokens.recepcion, { type: 'bearer' })
        .send({ franjas: [] }).expect(403);
      await request(http).get('/bloqueos').auth(tokens.recepcion, { type: 'bearer' }).expect(403);
      await request(http).post('/bloqueos').auth(tokens.recepcion, { type: 'bearer' })
        .send({}).expect(403);
      await request(http).patch(`/bloqueos/${bloques[0].id}`)
        .auth(tokens.recepcion, { type: 'bearer' }).send({ motivo: 'Cambio' }).expect(403);
      await request(http).delete(`/bloqueos/${bloques[0].id}`)
        .auth(tokens.recepcion, { type: 'bearer' }).expect(403);
      expect((await request(http).get(`${ruta}/horario`)
        .auth(tokens.admin, { type: 'bearer' }).expect(200)).body).toEqual(semana);
    });
  });

  it('M4: conserva aislamiento, propiedad profesional, validación y denegación de Superadmin', async () => {
    await conHttp(async (app, { perfilId, ajenoId, tokens }) => {
      const http = app.getHttpServer();
      for (const sufijo of ['horario', 'atencion?desde=2026-07-06&hasta=2026-07-06']) {
        const ruta = `/profesionales/${perfilId}/${sufijo}`;
        await request(http).get(ruta).auth(tokens.recepcionAjena, { type: 'bearer' }).expect(404);
        await request(http).get(`/profesionales/999999/${sufijo}`)
          .auth(tokens.recepcion, { type: 'bearer' }).expect(404);
        await request(http).get(ruta).auth(tokens.superadmin, { type: 'bearer' }).expect(403);
        await request(http).get(`/profesionales/${ajenoId}/${sufijo}`)
          .auth(tokens.profesional, { type: 'bearer' }).expect(403);
        await request(http).get(`/profesionales/${ajenoId}/${sufijo}`)
          .auth(tokens.recepcion, { type: 'bearer' }).expect(200);
      }
      await request(http).get(`/profesionales/${perfilId}/atencion?desde=invalida&hasta=2026-07-06`)
        .auth(tokens.recepcion, { type: 'bearer' }).expect(400);
    });
  });

  it('M4: revalida sesión, cuenta y licencia de Recepción en ambas lecturas', async () => {
    await conHttp(async (app, { db, reloj, perfilId, tokens }) => {
      const http = app.getHttpServer();
      const payload = app.get(JwtService).decode(tokens.recepcion);
      const rutas = ['horario', 'atencion?desde=2026-07-06&hasta=2026-07-06']
        .map((sufijo) => `/profesionales/${perfilId}/${sufijo}`);
      for (const ruta of rutas) await request(http).get(ruta).expect(401);
      await db.query('UPDATE sesiones SET revocada_en=? WHERE id=?', [reloj.ahora(), payload.sesionId]);
      for (const ruta of rutas) await request(http).get(ruta)
        .auth(tokens.recepcion, { type: 'bearer' }).expect(401);
      const sesion = await app.get(SesionesService).crear(payload.sub, reloj.ahora());
      const nuevo = app.get(JwtService).sign({ sub: payload.sub, rol: payload.rol,
        negocioId: payload.negocioId, sesionId: sesion.id });
      await db.query('UPDATE usuarios SET activo=0 WHERE id=?', [payload.sub]);
      for (const ruta of rutas) await request(http).get(ruta)
        .auth(nuevo, { type: 'bearer' }).expect(401);
      await db.query('UPDATE usuarios SET activo=1 WHERE id=?', [payload.sub]);
      for (const ruta of rutas) await request(http).get(ruta)
        .auth(nuevo, { type: 'bearer' }).expect(200);
      await db.query('UPDATE licencias SET creado_en=?, habilitada_en=?, vence_en=? WHERE negocio_id=?',
        [new Date(reloj.ahora().getTime() - 2 * 86400000),
          new Date(reloj.ahora().getTime() - 86400000),
          new Date(reloj.ahora().getTime() - 1000), payload.negocioId]);
      for (const ruta of rutas) await request(http).get(ruta)
        .auth(nuevo, { type: 'bearer' }).expect(401);
      await db.query('UPDATE licencias SET vence_en=? WHERE negocio_id=?',
        [new Date(reloj.ahora().getTime() + 86400000), payload.negocioId]);
      for (const ruta of rutas) await request(http).get(ruta)
        .auth(nuevo, { type: 'bearer' }).expect(200);
      await db.query('UPDATE licencias SET suspendida_en=?, plazo_suspension_dias=0 WHERE negocio_id=?',
        [reloj.ahora(), payload.negocioId]);
      for (const ruta of rutas) await request(http).get(ruta)
        .auth(nuevo, { type: 'bearer' }).expect(401);
    });
  });

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

  it('ALA RF-37 retira excepciones y conserva huecos semanales por HTTP', async () => {
    await conHttp(async (app, { perfilId, sucursales, tokens }) => {
      const http = app.getHttpServer();
      const ruta = `/profesionales/${perfilId}`;
      await request(http).put(`${ruta}/horario`).auth(tokens.admin, { type: 'bearer' })
        .send({ franjas: [franja(sucursales[0], 540, 600)] }).expect(200);
      const especial = `${ruta}/excepciones/2026-01-12`;
      await request(http).put(especial).auth(tokens.profesional, { type: 'bearer' })
        .send({ sucursalId: sucursales[0], franjas: [] }).expect(404);
      await request(http).get(`${ruta}/excepciones`)
        .auth(tokens.admin, { type: 'bearer' }).expect(404);
      await request(http).delete(`${especial}?sucursalId=${sucursales[0]}`)
        .auth(tokens.profesional, { type: 'bearer' }).expect(404);
      const dividida = await request(http).put(`${ruta}/horario`)
        .auth(tokens.profesional, { type: 'bearer' }).send({ franjas: [
          franja(sucursales[0], 540, 600),
          franja(sucursales[0], 630, 660, { orden: 1 }),
        ] }).expect(200);
      expect(dividida.body.map((f: { inicioMinutos: number }) => f.inicioMinutos))
        .toEqual([540, 630]);
    });
  });
});
