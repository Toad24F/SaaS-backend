import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { Rol } from '../src/auth/enums/rol.enum';
import { SesionesService } from '../src/auth/services/sesiones.service';
import { RELOJ } from '../src/comun/reloj';
import { Cita } from '../src/disponibilidad/entities/cita.entity';
import { Negocio } from '../src/negocios/entities/negocio.entity';
import { PersonalServicioSucursal } from '../src/profesionales/entities/personal-servicio-sucursal.entity';
import { Servicio } from '../src/servicios/entities/servicio.entity';
import { Sucursal } from '../src/sucursales/entities/sucursal.entity';
import { Usuario } from '../src/usuarios/entities/usuario.entity';
import { conBaseMigrada } from './support/mariadb';
import { crearDatosOcupaciones } from './support/ocupaciones-fase-3';
import { RelojPrueba } from './support/reloj';

const ahora = new Date('2026-11-02T17:00:00Z');

describe('ALA-T071–T074: oferta, afectaciones y recuperación', () => {
  it('retiene identidad e historia, explica inhabilitación y recupera solo oferta individual activa', async () => {
    await conBaseMigrada(async (db) => {
      const reloj = new RelojPrueba(ahora);
      // Las citas sembradas empiezan una hora después del reloj de lectura.
      const [a, b] = (await crearDatosOcupaciones(db,
        new RelojPrueba(new Date(ahora.getTime() + 3_600_000)))).negocios;
      for (const negocio of [a, b]) {
        await db.query('UPDATE negocios SET activado_en=creado_en WHERE id=?', [negocio.id]);
        await db.query(`INSERT INTO licencias
          (negocio_id,creado_en,habilitada_en,vence_en)
          VALUES (?,? ,?,?)`, [negocio.id, ahora, ahora,
          new Date(ahora.getTime() + 90 * 86_400_000)]);
      }
      const modulo = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(DataSource).useValue(db)
        .overrideProvider(RELOJ).useValue(reloj).compile();
      const app: INestApplication = modulo.createNestApplication();
      app.useGlobalPipes(new ValidationPipe({ whitelist: true,
        forbidNonWhitelisted: true, transform: true }));
      try {
        await app.init();
        const admin = await db.getRepository(Usuario).save({ negocioId: a.id,
          nombre: 'Admin ALA afectadas', email: 'admin-ala-afectadas@example.test',
          passwordHash: 'hash', rol: Rol.ADMIN_NEGOCIO, activo: true,
          creadoEn: ahora, activadoEn: ahora });
        const sesion = await app.get(SesionesService).crear(admin.id, ahora);
        const token = app.get(JwtService).sign({ sub: admin.id, sesionId: sesion.id,
          rol: Rol.ADMIN_NEGOCIO, negocioId: a.id, email: admin.email,
          nombre: admin.nombre });
        const http = app.getHttpServer();
        const auth = (peticion: request.Test) => peticion.auth(token, { type: 'bearer' });
        const base = '/publico/negocios/ocupaciones-1/catalogo';
        const catalogo = () => request(http).get(base);
        const seleccion = () => request(http).get(base)
          .query({ servicioId: a.servicios[0], sucursalId: a.sucursales[0] });
        const validar = () => auth(request(http).post('/disponibilidad/validar'))
          .send({ personalId: a.personalId, sucursalId: a.sucursales[0],
            servicioId: a.servicios[0], fechaLocal: '2026-11-02', horaInicio: '13:00' });
        const afectadas = () => auth(request(http).get('/disponibilidad/citas-afectadas'))
          .query({ desde: '2026-11-02', hasta: '2026-11-02',
            personalId: a.personalId, sucursalId: a.sucursales[0] });
        const causas = async () => (await afectadas().expect(200)).body.citas
          .find((fila: { citaId: number }) => fila.citaId === a.citas[0])?.causas
          .map((fila: { codigo: string }) => fila.codigo) as string[];
        const citaAntes = await db.getRepository(Cita).findOneByOrFail({ id: a.citas[0] });
        expect((await catalogo().expect(200)).body.servicios)
          .toEqual(expect.arrayContaining([expect.objectContaining({ id: a.servicios[0] })]));
        // DELETE de los cuatro tipos debe ser 404 y no tocar ninguna fila.
        for (const [ruta, id] of [
          ['profesionales', a.personalId], ['recepcionistas', admin.id],
          ['servicios', a.servicios[0]], ['sucursales', a.sucursales[0]],
        ] as const) {
          await auth(request(http).delete(`/${ruta}/${id}`)).expect(404);
        }
        expect(await db.getRepository(Cita).findOneByOrFail({ id: a.citas[0] }))
          .toMatchObject({ estado: citaAntes.estado, inicioUtc: citaAntes.inicioUtc,
            finUtc: citaAntes.finUtc });
        for (const [ruta, id] of [
          ['sucursales', a.sucursales[0]], ['servicios', a.servicios[0]],
          ['profesionales', a.personalId],
        ] as const) {
          await auth(request(http).post(`/${ruta}/${id}/inhabilitar`)).send({}).expect(200);
          expect((await catalogo().expect(200)).body.servicios)
            .not.toEqual(expect.arrayContaining([expect.objectContaining({ id: a.servicios[0] })]));
          expect((await validar().expect(200)).body.motivos)
            .toEqual(expect.arrayContaining([ruta === 'profesionales'
              ? 'cuenta_inhabilitada' : ruta === 'sucursales'
                ? 'sucursal_inhabilitada' : 'servicio_inhabilitado']));
        }
        expect(await causas()).toEqual(expect.arrayContaining([
          'sucursal_inhabilitada', 'servicio_inhabilitado', 'cuenta_inhabilitada',
          'horario_insuficiente',
        ]));
        expect(await db.getRepository(Cita).findOneByOrFail({ id: a.citas[0] }))
          .toMatchObject({ estado: citaAntes.estado, inicioUtc: citaAntes.inicioUtc,
            finUtc: citaAntes.finUtc });
        // La marca no libera nombres ni correos que impedirían restaurar.
        await expect(db.query(`INSERT INTO servicios
          (negocio_id,nombre,costo,duracion_minutos) VALUES (?,'Servicio 1-1',100,30)`,
        [a.id])).rejects.toMatchObject({ code: 'ER_DUP_ENTRY' });
        await expect(db.query(`INSERT INTO sucursales
          (negocio_id,nombre,direccion,telefono,zona_horaria)
          VALUES (?,'Sucursal 1-1','Calle','6141234567','America/Chihuahua')`,
        [a.id])).rejects.toMatchObject({ code: 'ER_DUP_ENTRY' });
        await expect(db.query(`INSERT INTO usuarios
          (negocio_id,nombre,email,password_hash,rol,activo,creado_en,activado_en)
          VALUES (?,'Profesional 1','nuevo-ala@example.test','hash','profesional',1,?,?)`,
        [a.id, ahora, ahora])).rejects.toMatchObject({ code: 'ER_DUP_ENTRY' });
        await expect(db.query(`INSERT INTO usuarios
          (negocio_id,nombre,email,password_hash,rol,activo,creado_en,activado_en)
          VALUES (?,'Nuevo ALA','ocupaciones-prof-1@example.test','hash','profesional',1,?,?)`,
        [a.id, ahora, ahora])).rejects.toMatchObject({ code: 'ER_DUP_ENTRY' });
        // Restaurar cambia la causa específica por inactividad, sin quitar horario.
        for (const [ruta, id] of [
          ['sucursales', a.sucursales[0]], ['servicios', a.servicios[0]],
          ['profesionales', a.personalId],
        ] as const) {
          await auth(request(http).post(`/${ruta}/${id}/restaurar`)).send({}).expect(200);
        }
        expect(await causas()).toEqual(expect.arrayContaining([
          'sucursal_inactiva', 'servicio_inactivo', 'cuenta_inactiva',
          'horario_insuficiente',
        ]));
        expect(await causas()).not.toEqual(expect.arrayContaining([
          'sucursal_inhabilitada', 'servicio_inhabilitado', 'cuenta_inhabilitada',
        ]));
        // La otra sede activa llena el cupo inicial: reactivar exige un límite vigente.
        await auth(request(http).post(`/sucursales/${a.sucursales[0]}/reactivar`))
          .send({}).expect(409);
        await db.getRepository(Negocio).update(a.id, { limiteSucursalesActivas: 2 });
        await db.getRepository(PersonalServicioSucursal).update({ negocioId: a.id,
          personalId: a.personalId, sucursalId: a.sucursales[0],
          servicioId: a.servicios[0] }, { activo: false });
        await auth(request(http).post(`/sucursales/${a.sucursales[0]}/reactivar`))
          .send({}).expect(204);
        await auth(request(http).post(`/servicios/${a.servicios[0]}/reactivar`))
          .send({}).expect(204);
        await auth(request(http).post(`/profesionales/${a.personalId}/reactivar`))
          .send({}).expect(204);
        expect((await catalogo().expect(200)).body.servicios)
          .not.toEqual(expect.arrayContaining([expect.objectContaining({ id: a.servicios[0] })]));
        expect((await seleccion().expect(200)).body.profesionales).toEqual([]);
        expect(await db.getRepository(PersonalServicioSucursal).countBy({ negocioId: a.id,
          personalId: a.personalId, sucursalId: a.sucursales[0],
          servicioId: a.servicios[0], activo: false })).toBe(1);
        await db.getRepository(PersonalServicioSucursal).update({ negocioId: a.id,
          personalId: a.personalId, sucursalId: a.sucursales[0],
          servicioId: a.servicios[0] }, { activo: true });
        expect((await catalogo().expect(200)).body.servicios)
          .toEqual(expect.arrayContaining([expect.objectContaining({ id: a.servicios[0] })]));
        expect((await seleccion().expect(200)).body.profesionales)
          .toEqual(expect.arrayContaining([expect.objectContaining({ id: a.personalId })]));
        expect(await db.getRepository(Servicio).countBy({ id: a.servicios[0] })).toBe(1);
        expect(await db.getRepository(Sucursal).countBy({ id: a.sucursales[0] })).toBe(1);
        expect(await db.getRepository(Usuario).countBy({ id: a.personalId })).toBe(1);
        expect(await db.getRepository(Cita).findOneByOrFail({ id: a.citas[0] }))
          .toMatchObject({ estado: citaAntes.estado, inicioUtc: citaAntes.inicioUtc,
            finUtc: citaAntes.finUtc });
        expect((await request(http).get('/publico/negocios/ocupaciones-2/catalogo')
          .expect(200)).body.servicios).toHaveLength(2);
      } finally { await app.close(); }
    });
  });
});
