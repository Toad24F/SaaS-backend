import { ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { AuditoriaService } from '../src/auditoria/auditoria.service';
import { Rol } from '../src/auth/enums/rol.enum';
import { SesionesService } from '../src/auth/services/sesiones.service';
import { CodigosService } from '../src/codigos/codigos.service';
import { RELOJ } from '../src/comun/reloj';
import { ProcesadorCorreoService } from '../src/correos/procesador-correo.service';
import { TransporteCorreoControlado } from '../src/correos/transporte-correo-controlado';
import { Licencia } from '../src/licencias/entities/licencia.entity';
import { ProfesionalesService } from '../src/profesionales/profesionales.service';
import { Usuario } from '../src/usuarios/entities/usuario.entity';
import { conBaseMigrada } from './support/mariadb';
import { RelojPrueba } from './support/reloj';
import { derivadorPrueba } from './support/invitaciones-fase-2';

// El alta usa sellos SQL actuales: el reloj de prueba empieza después del reloj de la base.
const INICIO = new Date(Date.now() + 120_000);
const PASSWORD = 'Clave-recorrido-t133-123';
const lunes = new Date(INICIO);
lunes.setUTCDate(lunes.getUTCDate() + ((8 - lunes.getUTCDay()) % 7 || 7));
const FECHA = lunes.toISOString().slice(0, 10);

describe('M1-T133: recorrido funcional conjunto sin citas', () => {
  it('conserva horario al vaciar y restablecer servicios, y recupera acceso tras reactivar', async () => {
    await conBaseMigrada(async (db) => {
      const reloj = new RelojPrueba(INICIO);
      const correo = new TransporteCorreoControlado();
      const procesador = new ProcesadorCorreoService(db, correo, derivadorPrueba, reloj);
      const modulo = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(DataSource).useValue(db)
        .overrideProvider(RELOJ).useValue(reloj)
        .overrideProvider(CodigosService)
        .useValue(new CodigosService(new AuditoriaService(), derivadorPrueba))
        .overrideProvider(ProcesadorCorreoService).useValue(procesador).compile();
      const app = modulo.createNestApplication();
      app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true,
        forbidNonWhitelisted: true }));
      try {
        await app.init();
        const http = app.getHttpServer();
        const superadmin = await db.getRepository(Usuario).save({ negocioId: null,
          nombre: 'Superadmin', email: 'super-t133@example.test', passwordHash: 'hash',
          rol: Rol.SUPERADMIN, activo: true, creadoEn: reloj.ahora(), activadoEn: reloj.ahora() });
        const sesion = await app.get(SesionesService).crear(superadmin.id, reloj.ahora());
        const superToken = app.get(JwtService).sign({ sub: superadmin.id,
          sesionId: sesion.id, rol: Rol.SUPERADMIN, negocioId: null });

        // El alta HTTP deja una licencia pendiente y un envío; solo el transporte falso ve el código.
        const alta = (await request(http).post('/negocios')
          .auth(superToken, { type: 'bearer' }).send({ nombre: 'Agenda integral',
            identificadorPublico: 'agenda-integral-t133', rfc: 'ABC010101AB1',
            emailAdministrador: 'admin-t133@example.test', limiteSucursales: 2 })
          .expect(201)).body;
        expect(alta).not.toHaveProperty('codigo');
        expect(await db.getRepository(Usuario).countBy({ negocioId: alta.negocioId })).toBe(0);
        expect((await procesador.procesarUno())?.estado).toBe('enviado');
        expect(correo.intentos).toHaveLength(1);
        expect(correo.intentos[0].destinatario).toBe('admin-t133@example.test');
        const codigo = correo.intentos[0].texto.match(/es: ([^\n]+)/)?.[1];
        expect(codigo).toBeTruthy();
        reloj.avanzar(60_000);
        await request(http).post('/auth/activar-administrador').send({ codigo,
          correo: 'admin-t133@example.test',
          nombre: 'Administradora', password: PASSWORD }).expect(200);
        const adminToken = (await request(http).post('/auth/login').send({
          email: 'admin-t133@example.test', password: PASSWORD }).expect(200)).body.accessToken;

        // Catálogos, cuenta Profesional y relaciones se crean por sus rutas reales.
        const sede = (await request(http).post('/sucursales')
          .auth(adminToken, { type: 'bearer' }).send({ nombre: 'Centro',
            direccion: 'Calle Uno', telefono: '6141234567',
            zonaHoraria: 'America/Phoenix' }).expect(201)).body;
        const servicio = (await request(http).post('/servicios')
          .auth(adminToken, { type: 'bearer' }).send({ nombre: 'Consulta',
            costo: '100.00', duracionMinutos: 30 }).expect(201)).body;
        const profesional = (await request(http).post('/profesionales')
          .auth(adminToken, { type: 'bearer' }).send({ nombre: 'Profesional',
            correo: 'prof-t133@example.test', password: PASSWORD }).expect(201)).body;
        const ruta = `/profesionales/${profesional.id}`;
        await request(http).put(`${ruta}/sucursales`).auth(adminToken, { type: 'bearer' })
          .send({ sucursalIds: [sede.id] }).expect(200);
        const profToken = (await request(http).post('/auth/login').send({
          email: 'prof-t133@example.test', password: PASSWORD }).expect(200)).body.accessToken;
        const horario = { franjas: [{ diaSemana: 1, orden: 0, sucursalId: sede.id,
          inicioMinutos: 540, finMinutos: 720, descansoInicioMinutos: null,
          descansoFinMinutos: null, activo: true }] };
        const semana = (await request(http).put(`${ruta}/horario`)
          .auth(profToken, { type: 'bearer' }).send(horario).expect(200)).body;
        expect(semana).toHaveLength(1);
        await request(http).put(`${ruta}/servicios`).auth(profToken, { type: 'bearer' })
          .send({ servicioIds: [servicio.id] }).expect(200);
        const adminId = Number((await db.getRepository(Usuario)
          .findOneByOrFail({ email: 'admin-t133@example.test' })).id);
        const oferta = () => app.get(ProfesionalesService).ofertaSucursal(adminId, sede.id);
        expect((await oferta()).map((item) => item.id)).toEqual([servicio.id]);
        await request(http).put(`${ruta}/servicios`).auth(profToken, { type: 'bearer' })
          .send({ servicioIds: [] }).expect(200);
        expect(await oferta()).toEqual([]);
        expect((await request(http).get(`${ruta}/horario`)
          .auth(profToken, { type: 'bearer' }).expect(200)).body).toEqual(semana);
        await request(http).put(`${ruta}/servicios`).auth(profToken, { type: 'bearer' })
          .send({ servicioIds: [servicio.id] }).expect(200);
        expect((await oferta()).map((item) => item.id)).toEqual([servicio.id]);
        const bloqueo = (await request(http).post('/bloqueos')
          .auth(profToken, { type: 'bearer' }).send({ personalId: profesional.id,
            sucursalId: sede.id, tipo: 'vacaciones', motivo: 'Descanso',
            fechaInicio: FECHA, fechaFin: FECHA,
            inicioMinutos: 600, finMinutos: 660 }).expect(201)).body;
        const atencion = (await request(http).get(`${ruta}/atencion`)
          .query({ desde: FECHA, hasta: FECHA })
          .auth(profToken, { type: 'bearer' }).expect(200)).body;
        expect(atencion.intervalos.map((item: { inicioMinutos: number;
          finMinutos: number }) => [item.inicioMinutos, item.finMinutos]))
          .toEqual([[540, 600], [660, 720]]);

        // La suspensión corta sesiones existentes exactamente a las 48 h; reactivar conserva datos.
        const licencia = await db.getRepository(Licencia).findOneByOrFail({ negocioId: alta.negocioId });
        const suspendidaEn = reloj.ahora();
        await request(http).post(`/licencias/${licencia.id}/suspender`)
          .auth(superToken, { type: 'bearer' }).send({}).expect(200);
        await request(http).get(`${ruta}/horario`)
          .auth(profToken, { type: 'bearer' }).expect(200);
        // Sesiones emitidas al final de la gracia evitan atribuir el 401 a su caducidad.
        reloj.fijar(new Date(suspendidaEn.getTime() + 48 * 60 * 60 * 1000 - 60_000));
        const profUsuario = await db.getRepository(Usuario)
          .findOneByOrFail({ email: 'prof-t133@example.test' });
        const sesionProf = await app.get(SesionesService).crear(profUsuario.id, reloj.ahora());
        const profVigente = app.get(JwtService).sign({ sub: profUsuario.id,
          sesionId: sesionProf.id, rol: Rol.PROFESIONAL, negocioId: alta.negocioId });
        const sesionSuper = await app.get(SesionesService).crear(superadmin.id, reloj.ahora());
        const superVigente = app.get(JwtService).sign({ sub: superadmin.id,
          sesionId: sesionSuper.id, rol: Rol.SUPERADMIN, negocioId: null });
        reloj.fijar(new Date(suspendidaEn.getTime() + 48 * 60 * 60 * 1000));
        await request(http).get(`${ruta}/horario`)
          .auth(profVigente, { type: 'bearer' }).expect(401);
        await request(http).post(`/licencias/${licencia.id}/reactivar`)
          .auth(superVigente, { type: 'bearer' }).send({}).expect(200);
        expect((await request(http).get(`${ruta}/horario`)
          .auth(profVigente, { type: 'bearer' }).expect(200)).body).toEqual(semana);
        expect((await oferta()).map((item) => item.id)).toEqual([servicio.id]);
        expect((await request(http).get('/bloqueos')
          .auth(profVigente, { type: 'bearer' }).expect(200)).body)
          .toEqual([expect.objectContaining({ id: bloqueo.id })]);
        // La instalación de módulo 1 todavía no incorpora la tabla ni el flujo de citas.
        expect(await db.query("SHOW TABLES LIKE 'citas'")).toEqual([]);
      } finally { await app.close(); }
    });
  });
});
