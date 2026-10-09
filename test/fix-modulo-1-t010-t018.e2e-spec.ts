import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
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

const alta = (n: number) => ({ nombre: `Profesional ${n}`,
  correo: `fix-prof-${n}@example.test`, password: 'Clave-profesional-123',
  especialidad: '  Estilismo  ' });
const servicio = { nombre: 'Corte', costo: '20.00', duracionMinutos: 30 };

async function escenario(ejecutar: (app: INestApplication, db: DataSource,
  token: (usuario: Usuario) => Promise<string>, actores: Usuario[], negocios: Negocio[]) => Promise<void>) {
  await conBaseMigrada(async (db) => {
    const reloj = new RelojPrueba(new Date(Date.now() + 120000));
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DataSource).useValue(db).overrideProvider(RELOJ).useValue(reloj).compile();
    const app = modulo.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true,
      forbidNonWhitelisted: true }));
    try {
      await app.init();
      const actores: Usuario[] = [];
      const negocios: Negocio[] = [];
      for (const letra of ['a', 'b']) {
        const negocio = await db.getRepository(Negocio).save({ nombre: letra,
          slug: `fix-catalogo-${letra}`, emailContacto: `${letra}@example.test`,
          activadoEn: reloj.ahora(), limiteSucursalesActivas: 3 });
        negocios.push(negocio);
        await db.getRepository(Licencia).save({ negocioId: negocio.id,
          habilitadaEn: reloj.ahora(), venceEn: new Date(reloj.ahora().getTime() + 365 * 86400000),
          suspendidaEn: null });
        for (const rol of [Rol.ADMIN_NEGOCIO, Rol.RECEPCIONISTA]) {
          actores.push(await db.getRepository(Usuario).save({ negocioId: negocio.id,
            nombre: rol, email: `fix-${rol}-${letra}@example.test`, passwordHash: 'hash',
            rol, activo: true, creadoEn: reloj.ahora(), activadoEn: reloj.ahora() }));
        }
      }
      const token = async (usuario: Usuario) => {
        const sesion = await app.get(SesionesService).crear(usuario.id, reloj.ahora());
        return app.get(JwtService).sign({ sub: usuario.id, sesionId: sesion.id,
          rol: usuario.rol, negocioId: usuario.negocioId });
      };
      await ejecutar(app, db, token, actores, negocios);
    } finally { await app.close(); }
  });
}

describe('FIX-T010–T018: especialidad y catálogo compartido', () => {
  it('exige especialidad nueva y en próxima edición, pero consulta perfiles heredados', async () => {
    await escenario(async (app, db, token, actores, negocios) => {
      const http = app.getHttpServer();
      const admin = await token(actores[0]);
      await request(http).post('/profesionales').auth(admin, { type: 'bearer' })
        .send({ ...alta(1), especialidad: undefined }).expect(400);
      await request(http).post('/profesionales').auth(admin, { type: 'bearer' })
        .send({ ...alta(1), especialidad: '  ' }).expect(400);
      const creado = (await request(http).post('/profesionales').auth(admin, { type: 'bearer' })
        .send(alta(1)).expect(201)).body;
      expect(creado).toMatchObject({ especialidad: 'Estilismo' });
      expect((await request(http).get('/profesionales').auth(admin, { type: 'bearer' })
        .expect(200)).body).toEqual([expect.objectContaining({ id: creado.id,
        especialidad: 'Estilismo' })]);
      const heredado = await db.getRepository(Usuario).save({ negocioId: negocios[0].id,
        nombre: 'Heredado', email: 'heredado@example.test', passwordHash: 'hash',
        rol: Rol.PROFESIONAL, activo: true, activadoEn: new Date() });
      await db.query('INSERT INTO personal (id,negocio_id) VALUES (?,?)',
        [heredado.id, negocios[0].id]);
      expect((await request(http).get(`/profesionales/${heredado.id}`)
        .auth(admin, { type: 'bearer' }).expect(200)).body.especialidad).toBeNull();
      await request(http).patch(`/profesionales/${heredado.id}`)
        .auth(admin, { type: 'bearer' }).send({ nombre: 'Cambio' }).expect(400);
      await request(http).patch(`/profesionales/${heredado.id}`)
        .auth(admin, { type: 'bearer' }).send({ nombre: 'Cambio', especialidad: '  Uñas  ' })
        .expect(200).expect(({ body }) => expect(body.especialidad).toBe('Uñas'));
      expect((await db.query('SELECT nombre FROM usuarios WHERE id=?', [heredado.id]))[0].nombre)
        .toBe('Cambio');
    });
  });

  it('guarda descripción opcional y permite editarla sin variar precio ni duración', async () => {
    await escenario(async (app, db, token, actores) => {
      const http = app.getHttpServer();
      const admin = await token(actores[0]);
      const previo = (await request(http).post('/servicios').auth(admin, { type: 'bearer' })
        .send(servicio).expect(201)).body;
      expect(previo.descripcion).toBeNull();
      const nuevo = (await request(http).post('/servicios').auth(admin, { type: 'bearer' })
        .send({ ...servicio, nombre: 'Tinte', descripcion: '  Color completo  ' })
        .expect(201)).body;
      expect(nuevo.descripcion).toBe('Color completo');
      const editado = (await request(http).patch(`/servicios/${nuevo.id}`)
        .auth(admin, { type: 'bearer' }).send({ descripcion: 'Retoque' }).expect(200)).body;
      expect(editado).toMatchObject({ descripcion: 'Retoque', costo: '20.00', duracionMinutos: 30 });
      await request(http).patch(`/servicios/${nuevo.id}`).auth(admin, { type: 'bearer' })
        .send({ descripcion: null }).expect(400);
      expect((await request(http).get(`/servicios/${previo.id}`)
        .auth(admin, { type: 'bearer' }).expect(200)).body.descripcion).toBeNull();
      expect((await db.query('SELECT descripcion FROM servicios WHERE id=?', [nuevo.id]))[0]
        .descripcion).toBe('Retoque');
    });
  });

  it('crea servicio compartido solo para su autor y revierte la operación si falla auditoría', async () => {
    await escenario(async (app, db, token, actores, negocios) => {
      const http = app.getHttpServer();
      const admin = await token(actores[0]);
      const ajeno = await token(actores[2]);
      const primero = (await request(http).post('/profesionales').auth(admin, { type: 'bearer' })
        .send(alta(2)).expect(201)).body;
      const segundo = (await request(http).post('/profesionales').auth(admin, { type: 'bearer' })
        .send(alta(3)).expect(201)).body;
      const autor = await db.getRepository(Usuario).findOneByOrFail({ id: primero.id });
      const tokenAutor = await token(autor);
      const sucursales: number[] = [];
      for (const nombre of ['Centro', 'Norte']) {
        const sucursal = (await request(http).post('/sucursales').auth(admin, { type: 'bearer' })
          .send({ nombre, direccion: 'Calle', telefono: '6141234567', zonaHoraria: 'UTC' })
          .expect(201)).body;
        sucursales.push(sucursal.id);
      }
      await request(http).put(`/profesionales/${primero.id}/sucursales`)
        .auth(admin, { type: 'bearer' }).send({ sucursalIds: sucursales }).expect(200);
      const creado = (await request(http).post('/servicios').auth(tokenAutor, { type: 'bearer' })
        .send({ ...servicio, descripcion: 'Autor' }).expect(201)).body;
      expect(creado).toMatchObject({ negocioId: negocios[0].id,
        creadorPersonalId: primero.id, descripcion: 'Autor' });
      expect((await db.query(`SELECT personal_id id FROM personal_servicios
        WHERE servicio_id=?`, [creado.id]))).toEqual([{ id: primero.id }]);
      expect((await db.query(`SELECT sucursal_id id FROM personal_servicios_sucursales
        WHERE servicio_id=? ORDER BY sucursal_id`, [creado.id])).map((fila: { id: number }) => fila.id))
        .toEqual(sucursales);
      expect((await request(http).get(`/profesionales/${segundo.id}/servicios`)
        .auth(admin, { type: 'bearer' }).expect(200)).body)
        .toEqual([expect.objectContaining({ id: creado.id, seleccionado: false })]);
      await request(http).get(`/servicios/${creado.id}`).auth(ajeno, { type: 'bearer' }).expect(404);
      // La falla final de auditoría debe revertir también selección y oferta inicial.
      const contar = async (tabla: string) => Number((await db.query(`SELECT COUNT(*) total FROM ${tabla}`))[0].total);
      const antes = await Promise.all(['servicios', 'personal_servicios',
        'personal_servicios_sucursales', 'eventos_auditoria'].map(contar));
      const auditoria = jest.spyOn(app.get(AuditoriaService), 'registrar')
        .mockRejectedValueOnce(new Error('Fallo controlado de auditoría'));
      try {
        await request(http).post('/servicios').auth(tokenAutor, { type: 'bearer' })
          .send({ ...servicio, nombre: 'Revertir' }).expect(500);
      } finally { auditoria.mockRestore(); }
      expect((await db.query("SELECT COUNT(*) total FROM servicios WHERE nombre='Revertir'"))[0]
        .total).toBe('0');
      expect(await Promise.all(['servicios', 'personal_servicios',
        'personal_servicios_sucursales', 'eventos_auditoria'].map(contar))).toEqual(antes);
    });
  });

  it('autoriza edición al administrador y autor; deniega otro Profesional y control global', async () => {
    await escenario(async (app, db, token, actores, negocios) => {
      const http = app.getHttpServer();
      const admin = await token(actores[0]);
      const recepcionista = await token(actores[1]);
      const ajeno = await token(actores[2]);
      const ids: number[] = [];
      for (const n of [4, 5]) ids.push((await request(http).post('/profesionales')
        .auth(admin, { type: 'bearer' }).send(alta(n)).expect(201)).body.id);
      const [autor, otro] = await Promise.all(ids.map((id) => db.getRepository(Usuario)
        .findOneByOrFail({ id })));
      const tokenAutor = await token(autor);
      const tokenOtro = await token(otro);
      const profesional = (await request(http).post('/servicios')
        .auth(tokenAutor, { type: 'bearer' }).send(servicio).expect(201)).body;
      const administrativo = (await request(http).post('/servicios')
        .auth(admin, { type: 'bearer' }).send({ ...servicio, nombre: 'Admin' }).expect(201)).body;
      expect(administrativo.creadorPersonalId).toBeNull();
      await request(http).patch(`/servicios/${administrativo.id}`)
        .auth(tokenAutor, { type: 'bearer' }).send({ nombre: 'No' }).expect(403);
      await request(http).patch(`/servicios/${profesional.id}`)
        .auth(tokenOtro, { type: 'bearer' }).send({ nombre: 'No' }).expect(403);
      await request(http).patch(`/servicios/${profesional.id}`)
        .auth(tokenAutor, { type: 'bearer' })
        .send({ creadorPersonalId: otro.id }).expect(400);
      await request(http).patch(`/servicios/${profesional.id}`)
        .auth(recepcionista, { type: 'bearer' }).send({ nombre: 'No' }).expect(403);
      await request(http).patch(`/servicios/${profesional.id}`)
        .auth(ajeno, { type: 'bearer' }).send({ nombre: 'No' }).expect(404);
      await request(http).post(`/servicios/${profesional.id}/desactivar`)
        .auth(tokenAutor, { type: 'bearer' }).send({}).expect(403);
      await request(http).delete(`/servicios/${profesional.id}`)
        .auth(tokenAutor, { type: 'bearer' }).expect(403);
      const editado = (await request(http).patch(`/servicios/${profesional.id}`)
        .auth(tokenAutor, { type: 'bearer' })
        .send({ nombre: 'Nuevo', costo: '22.50', duracionMinutos: 45,
          descripcion: 'Actualizada' }).expect(200)).body;
      expect(editado).toMatchObject({ nombre: 'Nuevo', costo: '22.50', duracionMinutos: 45,
        descripcion: 'Actualizada', creadorPersonalId: autor.id });
      await request(http).patch(`/servicios/${profesional.id}`)
        .auth(admin, { type: 'bearer' }).send({ descripcion: 'Admin editó' }).expect(200);
      // Una falla posterior al UPDATE revierte todos los campos editados y su evento.
      const falloEdicion = jest.spyOn(app.get(AuditoriaService), 'registrar')
        .mockRejectedValueOnce(new Error('Fallo controlado en edición'));
      try {
        await request(http).patch(`/servicios/${profesional.id}`)
          .auth(tokenAutor, { type: 'bearer' })
          .send({ nombre: 'Parcial', descripcion: 'Parcial' }).expect(500);
      } finally { falloEdicion.mockRestore(); }
      const final = (await request(http).get(`/servicios/${profesional.id}`)
        .auth(admin, { type: 'bearer' }).expect(200)).body;
      expect(final).toMatchObject({ creadorPersonalId: autor.id, nombre: 'Nuevo',
        descripcion: 'Admin editó' });
      expect((await db.query('SELECT negocio_id negocioId FROM servicios WHERE id=?',
        [profesional.id]))[0].negocioId).toBe(negocios[0].id);
      const auditoria = await db.query(`SELECT accion FROM eventos_auditoria
        WHERE recurso_tipo='servicio' AND recurso_id=? ORDER BY id`, [profesional.id]);
      expect(auditoria.map((fila: { accion: string }) => fila.accion))
        .toEqual(['servicio_creado', 'servicio_editado', 'servicio_editado']);
    });
  });
});
