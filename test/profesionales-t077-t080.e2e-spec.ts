import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { Rol } from '../src/auth/enums/rol.enum';
import { SesionesService } from '../src/auth/services/sesiones.service';
import { RELOJ } from '../src/comun/reloj';
import { Licencia } from '../src/licencias/entities/licencia.entity';
import { Negocio } from '../src/negocios/entities/negocio.entity';
import { ProfesionalesService } from '../src/profesionales/profesionales.service';
import { Usuario } from '../src/usuarios/entities/usuario.entity';
import { conBaseMigrada } from './support/mariadb';
import { RelojPrueba } from './support/reloj';

// JWT y base migrada reales permiten verificar rutas, permisos y relaciones persistidas.
async function conHttp(ejecutar: (app: INestApplication, db: DataSource,
  tokens: string[], usuarios: Usuario[]) => Promise<void>) {
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
      for (const letra of ['a', 'b']) {
        const negocio = await db.getRepository(Negocio).save({ nombre: letra,
          slug: `seleccion-${letra}`, emailContacto: `${letra}@example.test`,
          activadoEn: reloj.ahora(), limiteSucursalesActivas: 3 });
        await db.getRepository(Licencia).save({ negocioId: negocio.id,
          habilitadaEn: reloj.ahora(), venceEn: new Date(reloj.ahora().getTime() + 365 * 86400000),
          suspendidaEn: null });
        for (const rol of [Rol.ADMIN_NEGOCIO, Rol.RECEPCIONISTA]) {
          usuarios.push(await db.getRepository(Usuario).save({ negocioId: negocio.id,
            nombre: rol, email: `seleccion-${rol}-${letra}@example.test`, passwordHash: 'hash',
            rol, activo: true, creadoEn: reloj.ahora(), activadoEn: reloj.ahora() }));
        }
      }
      const tokens: string[] = [];
      for (const usuario of usuarios) {
        const sesion = await app.get(SesionesService).crear(usuario.id, reloj.ahora());
        tokens.push(app.get(JwtService).sign({ sub: usuario.id, sesionId: sesion.id,
          rol: usuario.rol, negocioId: usuario.negocioId }));
      }
      await ejecutar(app, db, tokens, usuarios);
    } finally { await app.close(); }
  });
}

async function tokenProfesional(app: INestApplication, db: DataSource, correo: string) {
  const usuario = await db.getRepository(Usuario).findOneByOrFail({ email: correo });
  const ahora = new Date(Date.now() + 120000);
  const sesion = await app.get(SesionesService).crear(usuario.id, ahora);
  return app.get(JwtService).sign({ sub: usuario.id, sesionId: sesion.id,
    rol: usuario.rol, negocioId: usuario.negocioId });
}

const alta = (n: number) => ({ nombre: `Profesional ${n}`,
  correo: `seleccion-prof-${n}@example.test`, password: 'Clave-profesional-123' });

describe('M1-T077–T080: selección y oferta de servicios', () => {
  it('consulta opciones activas y conserva selecciones desactivadas sin ofrecerlas', async () => {
    await conHttp(async (app, _db, tokens) => {
      const http = app.getHttpServer();
      const perfil = (await request(http).post('/profesionales').auth(tokens[0], { type: 'bearer' })
        .send(alta(1)).expect(201)).body;
      const activo = (await request(http).post('/servicios').auth(tokens[0], { type: 'bearer' })
        .send({ nombre: 'Corte', costo: '10.00', duracionMinutos: 30 }).expect(201)).body;
      const retirado = (await request(http).post('/servicios').auth(tokens[0], { type: 'bearer' })
        .send({ nombre: 'Tinte', costo: '20.00', duracionMinutos: 60 }).expect(201)).body;
      const ruta = `/profesionales/${perfil.id}/servicios`;
      expect((await request(http).get(ruta).auth(tokens[0], { type: 'bearer' })
        .expect(200)).body).toEqual([
        expect.objectContaining({ id: activo.id, activo: true, seleccionado: false }),
        expect.objectContaining({ id: retirado.id, activo: true, seleccionado: false }),
      ]);
      await request(http).put(ruta).auth(tokens[0], { type: 'bearer' })
        .send({ servicioIds: [activo.id, retirado.id] }).expect(200);
      await request(http).post(`/servicios/${retirado.id}/desactivar`)
        .auth(tokens[0], { type: 'bearer' }).send({}).expect(204);
      expect((await request(http).get(ruta).auth(tokens[0], { type: 'bearer' })
        .expect(200)).body).toEqual([
        expect.objectContaining({ id: activo.id, activo: true, seleccionado: true }),
        expect.objectContaining({ id: retirado.id, activo: false, seleccionado: true }),
      ]);
      await request(http).put(ruta).auth(tokens[0], { type: 'bearer' })
        .send({ servicioIds: [activo.id, retirado.id] }).expect(200);
      await request(http).put(ruta).auth(tokens[0], { type: 'bearer' })
        .send({ servicioIds: [activo.id] }).expect(200);
      expect((await request(http).get(ruta).auth(tokens[0], { type: 'bearer' })
        .expect(200)).body).toEqual([
        expect.objectContaining({ id: activo.id, activo: true, seleccionado: true }),
      ]);
    });
  });

  it('reemplaza el conjunto sin tocar catálogo, sucursales ni otros perfiles y resuelve oferta', async () => {
    await conHttp(async (app, db, tokens, usuarios) => {
      const http = app.getHttpServer();
      const perfiles = [];
      for (const n of [2, 3]) perfiles.push((await request(http).post('/profesionales')
        .auth(tokens[0], { type: 'bearer' }).send(alta(n)).expect(201)).body);
      const servicios = [];
      for (const nombre of ['Uno', 'Dos']) servicios.push((await request(http).post('/servicios')
        .auth(tokens[0], { type: 'bearer' }).send({ nombre, costo: '0.00', duracionMinutos: 20 })
        .expect(201)).body);
      const sucursal = (await request(http).post('/sucursales').auth(tokens[0], { type: 'bearer' })
        .send({ nombre: 'Centro', direccion: 'Calle 1', telefono: '6141234567',
          zonaHoraria: 'America/Chihuahua' }).expect(201)).body;
      for (const perfil of perfiles) await request(http)
        .put(`/profesionales/${perfil.id}/sucursales`).auth(tokens[0], { type: 'bearer' })
        .send({ sucursalIds: [sucursal.id] }).expect(200);
      await request(http).put(`/profesionales/${perfiles[0].id}/servicios`)
        .auth(tokens[0], { type: 'bearer' })
        .send({ servicioIds: servicios.map((s) => s.id) }).expect(200);
      await request(http).put(`/profesionales/${perfiles[1].id}/servicios`)
        .auth(tokens[0], { type: 'bearer' })
        .send({ servicioIds: [servicios[1].id] }).expect(200);
      const oferta = () => (app.get(ProfesionalesService) as unknown as {
        ofertaSucursal(actorId: number, sucursalId: number): Promise<{ id: number }[]>;
      }).ofertaSucursal(usuarios[0].id, sucursal.id);
      expect((await oferta()).map((s) => s.id)).toEqual(servicios.map((s) => s.id));
      await request(http).post(`/servicios/${servicios[1].id}/desactivar`)
        .auth(tokens[0], { type: 'bearer' }).send({}).expect(204);
      expect((await oferta()).map((s) => s.id)).toEqual([servicios[0].id]);
      await request(http).post(`/servicios/${servicios[1].id}/reactivar`)
        .auth(tokens[0], { type: 'bearer' }).send({}).expect(204);
      await request(http).put(`/profesionales/${perfiles[0].id}/servicios`)
        .auth(tokens[0], { type: 'bearer' }).send({ servicioIds: [] }).expect(200);
      expect((await oferta()).map((s) => s.id)).toEqual([servicios[1].id]);
      await request(http).put(`/profesionales/${perfiles[1].id}/servicios`)
        .auth(tokens[0], { type: 'bearer' }).send({ servicioIds: [] }).expect(200);
      expect(await oferta()).toEqual([]);
      await request(http).put(`/profesionales/${perfiles[1].id}/servicios`)
        .auth(tokens[0], { type: 'bearer' })
        .send({ servicioIds: [servicios[1].id] }).expect(200);
      expect((await request(http).get(`/profesionales/${perfiles[1].id}/servicios`)
        .auth(tokens[0], { type: 'bearer' }).expect(200)).body)
        .toEqual(expect.arrayContaining([expect.objectContaining({ id: servicios[1].id,
          seleccionado: true })]));
      expect((await request(http).get(`/profesionales/${perfiles[0].id}/sucursales`)
        .auth(tokens[0], { type: 'bearer' }).expect(200)).body).toEqual([sucursal.id]);
      expect((await request(http).get('/servicios').auth(tokens[0], { type: 'bearer' })
        .expect(200)).body).toHaveLength(2);
      await request(http).post(`/profesionales/${perfiles[1].id}/desactivar`)
        .auth(tokens[0], { type: 'bearer' }).send({}).expect(204);
      expect(await oferta()).toEqual([]);
      await request(http).post(`/profesionales/${perfiles[1].id}/reactivar`)
        .auth(tokens[0], { type: 'bearer' }).send({}).expect(204);
      await request(http).post(`/sucursales/${sucursal.id}/desactivar`)
        .auth(tokens[0], { type: 'bearer' }).send({}).expect(204);
      expect(await oferta()).toEqual([]);
    });
  });

  it('autoriza admin y Profesional propio; rechaza perfil ajeno, servicio ajeno e inactivo nuevo', async () => {
    await conHttp(async (app, db, tokens) => {
      const http = app.getHttpServer();
      const p1 = (await request(http).post('/profesionales').auth(tokens[0], { type: 'bearer' })
        .send(alta(4)).expect(201)).body;
      const p2 = (await request(http).post('/profesionales').auth(tokens[0], { type: 'bearer' })
        .send(alta(5)).expect(201)).body;
      const propio = await tokenProfesional(app, db, alta(4).correo);
      const s1 = (await request(http).post('/servicios').auth(tokens[0], { type: 'bearer' })
        .send({ nombre: 'Propio', costo: '1.00', duracionMinutos: 20 }).expect(201)).body;
      const ajeno = (await request(http).post('/servicios').auth(tokens[2], { type: 'bearer' })
        .send({ nombre: 'Ajeno', costo: '1.00', duracionMinutos: 20 }).expect(201)).body;
      const ruta = `/profesionales/${p1.id}/servicios`;
      await request(http).get(ruta).auth(propio, { type: 'bearer' }).expect(200);
      await request(http).put(ruta).auth(propio, { type: 'bearer' })
        .send({ servicioIds: [s1.id] }).expect(200);
      await request(http).get(`/profesionales/${p2.id}/servicios`)
        .auth(propio, { type: 'bearer' }).expect(403);
      await request(http).put(`/profesionales/${p2.id}/servicios`)
        .auth(propio, { type: 'bearer' }).send({ servicioIds: [] }).expect(403);
      await request(http).get(ruta).auth(tokens[1], { type: 'bearer' }).expect(403);
      await request(http).get(ruta).auth(tokens[2], { type: 'bearer' }).expect(404);
      await request(http).put(ruta).auth(tokens[0], { type: 'bearer' })
        .send({ servicioIds: [ajeno.id] }).expect(404);
      await request(http).post(`/servicios/${s1.id}/desactivar`)
        .auth(tokens[0], { type: 'bearer' }).send({}).expect(204);
      await request(http).put(`/profesionales/${p2.id}/servicios`)
        .auth(tokens[0], { type: 'bearer' }).send({ servicioIds: [s1.id] }).expect(409);
      for (const cuerpo of [{ servicioIds: [s1.id, s1.id] }, { servicioIds: [0] },
        { servicioIds: ['1'] }, { servicioIds: [], sucursalIds: [] }]) {
        await request(http).put(ruta).auth(tokens[0], { type: 'bearer' })
          .send(cuerpo).expect(400);
      }
      expect((await request(http).get(ruta).auth(tokens[0], { type: 'bearer' })
        .expect(200)).body.find((s: { id: number }) => s.id === s1.id).seleccionado).toBe(true);
    });
  });
});
