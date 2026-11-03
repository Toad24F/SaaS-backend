import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { Rol } from '../src/auth/enums/rol.enum';
import { SesionesService } from '../src/auth/services/sesiones.service';
import { RELOJ } from '../src/comun/reloj';
import { MotorDisponibilidadService } from '../src/disponibilidad/motor-disponibilidad.service';
import { RegistroReservaPublicaService } from '../src/reservas-publicas/registro-reserva-publica.service';
import { CoordinacionReservaPublicaService } from '../src/reservas-publicas/coordinacion-reserva-publica.service';
import { COOKIE_RESERVA } from '../src/reservas-publicas/proteccion-portal.service';
import { instalarLimiteCuerpoPublico } from '../src/reservas-publicas/limite-cuerpo-publico';
import { conBaseMigrada } from './support/mariadb';
import { crearEscenarioPortal } from './support/escenario-portal';
import { RelojPrueba } from './support/reloj';

const AHORA = new Date('2026-10-20T12:00:00Z');
const ORIGEN = 'https://citas.example.test';
const RUTA = '/publico/negocios/portal-prueba-1';
const CONTACTO = { nombre: 'Ana Pérez', telefono: '6141234567', notas: 'Consulta' };
const CONFIG = { modo: 'ventana_libre', tiempoEntreCitasMinutos: 0,
  anticipacionMinutos: 15, diasFuturos: 1 };
type Portal = { cookie: string; csrf: string };
type Contexto = { app: INestApplication; db: DataSource; reloj: RelojPrueba;
  negocios: { id: number; profesionalId: number; sucursalId: number; servicioId: number }[];
  tokens: Record<string, string>; iniciar: (ruta?: string) => Promise<Portal>;
  post: (ruta: string, cuerpo: unknown, portal: Portal, base?: string) => request.Test };

/** Base migrada, dos tenants y sesiones JWT/cookie reales para la matriz HTTP. */
async function escenario(ejecutar: (f: Contexto) => Promise<void>) {
  await conBaseMigrada(async (db) => {
    const reloj = new RelojPrueba(AHORA);
    const semilla = await crearEscenarioPortal(db, reloj);
    const negocios = [];
    for (const negocio of semilla.negocios) {
      const profesionalId = negocio.profesionales[0];
      const sucursalId = negocio.sucursales[0].id;
      const servicioId = Number((await db.query(`SELECT id FROM servicios
        WHERE negocio_id=? AND activo=1`, [negocio.id]))[0].id);
      await db.query(`INSERT INTO licencias (negocio_id,creado_en,habilitada_en,vence_en)
        VALUES (?,'2026-01-01','2026-01-01','2027-01-01')`, [negocio.id]);
      await db.query(`INSERT INTO configuracion_agenda
        (negocio_id,modo,tiempo_entre_citas_minutos,anticipacion_minutos,dias_futuros)
        VALUES (?,'ventana_libre',0,15,1)`, [negocio.id]);
      await db.query(`INSERT INTO horarios_personal (negocio_id,personal_id,sucursal_id,
        dia_semana,orden,inicio_minutos,fin_minutos,activo)
        VALUES (?,?,?,2,0,480,720,1)`, [negocio.id, profesionalId, sucursalId]);
      negocios.push({ id: negocio.id, profesionalId, sucursalId, servicioId });
    }
    const entorno = { PORTAL_PUBLICO_ORIGEN: process.env.PORTAL_PUBLICO_ORIGEN,
      PORTAL_CSRF_SECRET: process.env.PORTAL_CSRF_SECRET,
      PORTAL_FORMULARIO_HMAC_SECRET: process.env.PORTAL_FORMULARIO_HMAC_SECRET };
    process.env.PORTAL_PUBLICO_ORIGEN = ORIGEN;
    process.env.PORTAL_CSRF_SECRET = 'secreto-csrf-prueba-http-1234567890123456';
    process.env.PORTAL_FORMULARIO_HMAC_SECRET = 'secreto-formulario-prueba-http-1234567890123456';
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DataSource).useValue(db).overrideProvider(RELOJ).useValue(reloj).compile();
    const app = modulo.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true,
      forbidNonWhitelisted: true, transform: true }));
    instalarLimiteCuerpoPublico(app);
    try {
      await app.init();
      const tokens: Record<string, string> = {};
      for (const [clave, rol, negocioId] of [
        ['super', Rol.SUPERADMIN, null], ['adminA', Rol.ADMIN_NEGOCIO, negocios[0].id],
        ['adminB', Rol.ADMIN_NEGOCIO, negocios[1].id],
        ['recepcion', Rol.RECEPCIONISTA, negocios[0].id],
        ['profesional', Rol.PROFESIONAL, negocios[0].id],
      ] as const) {
        let id: number;
        if (clave === 'profesional') id = negocios[0].profesionalId;
        else {
          const alta = await db.query(`INSERT INTO usuarios
            (negocio_id,nombre,email,password_hash,rol,activo,activado_en,creado_en)
            VALUES (?,?,?,'hash',?,1,?,?)`,
          [negocioId, clave, `${clave.toLowerCase()}@ala-133.test`, rol, AHORA, AHORA]);
          id = Number(alta.insertId);
        }
        const sesion = await app.get(SesionesService).crear(id, AHORA);
        tokens[clave] = app.get(JwtService).sign({ sub: id, sesionId: sesion.id,
          rol, negocioId });
      }
      const http = app.getHttpServer();
      const iniciar = async (ruta = RUTA) => {
        const respuesta = await request(http).post(`${ruta}/sesion`)
          .set('Origin', ORIGEN).set('X-Portal-Inicializacion', '1').send({}).expect(201);
        return { cookie: respuesta.headers['set-cookie'][0].split(';')[0],
          csrf: respuesta.body.csrfToken as string };
      };
      const post = (ruta: string, cuerpo: unknown, portal: Portal, base = RUTA) =>
        request(http).post(`${base}${ruta}`).set('Origin', ORIGEN)
          .set('Cookie', portal.cookie).set('X-CSRF-Token', portal.csrf).send(cuerpo);
      await ejecutar({ app, db, reloj, negocios, tokens, iniciar, post });
    } finally {
      await app.close();
      for (const [clave, valor] of Object.entries(entorno)) {
        if (valor === undefined) delete process.env[clave];
        else process.env[clave] = valor;
      }
    }
  });
}

function seleccion(f: Contexto) {
  const n = f.negocios[0];
  return { clave: 'ala_134_apartado_1234', personalId: n.profesionalId,
    sucursalId: n.sucursalId, servicioId: n.servicioId,
    fechaLocal: '2026-10-20', horaInicio: '08:00' };
}

describe('ALA-T133–T140: contratos HTTP y seguridad', () => {
  it('T133 autoriza cupos, bajas, restauración, precio y configuración por rol y tenant', async () => {
    await escenario(async (f) => {
      const http = f.app.getHttpServer();
      const [a, b] = f.negocios;
      const auth = (peticion: request.Test, token: string) =>
        peticion.auth(f.tokens[token], { type: 'bearer' });
      await request(http).get(`/negocios/${a.id}/cupo-usuarios`).expect(401);
      await auth(request(http).get(`/negocios/${a.id}/cupo-usuarios`), 'adminA').expect(403);
      await auth(request(http).get(`/negocios/${a.id}/cupo-usuarios`), 'super').expect(200);
      await auth(request(http).patch(`/negocios/${a.id}/limites-usuarios`), 'adminA')
        .send({ limiteProfesionalesActivos: 5, limiteRecepcionistasActivos: 3 }).expect(403);
      await auth(request(http).patch(`/negocios/${a.id}/limites-usuarios`), 'super')
        .send({ limiteProfesionalesActivos: 5, limiteRecepcionistasActivos: 3 }).expect(200);
      await auth(request(http).post(`/servicios/${a.servicioId}/inhabilitar`),
        'profesional').send({}).expect(403);
      for (const [ruta, id] of [['profesionales', a.profesionalId],
        ['sucursales', a.sucursalId], ['servicios', a.servicioId]] as const) {
        await auth(request(http).post(`/${ruta}/${id}/inhabilitar`), 'recepcion')
          .send({}).expect(403);
        await auth(request(http).post(`/${ruta}/${id}/inhabilitar`), 'adminB')
          .send({}).expect(404);
        await auth(request(http).post(`/${ruta}/${id}/inhabilitar`), 'adminA')
          .send({}).expect(200);
        await auth(request(http).post(`/${ruta}/${id}/restaurar`), 'adminB')
          .send({}).expect(404);
        await auth(request(http).post(`/${ruta}/${id}/restaurar`), 'adminA')
          .send({}).expect(200);
      }
      await auth(request(http).patch('/negocios/publicacion-catalogo'), 'recepcion')
        .send({ mostrarPreciosPublicos: false }).expect(403);
      await auth(request(http).patch('/negocios/publicacion-catalogo'), 'adminA')
        .send({ mostrarPreciosPublicos: false }).expect(200);
      expect((await auth(request(http).get('/negocios/publicacion-catalogo'),
        'adminB').expect(200)).body.mostrarPreciosPublicos).toBe(true);
      await auth(request(http).put('/disponibilidad/configuracion'), 'recepcion')
        .send(CONFIG).expect(403);
      await auth(request(http).put('/disponibilidad/configuracion'), 'adminA')
        .send({ ...CONFIG, tiempoEntreCitasMinutos: 5 }).expect(200);
      expect((await auth(request(http).get('/disponibilidad/configuracion'),
        'adminB').expect(200)).body.tiempoEntreCitasMinutos).toBe(0);
      expect((await f.db.query('SELECT activo FROM sucursales WHERE id=?', [b.sucursalId]))[0].activo)
        .toBe(1);
    });
  });

  it('T134 rechaza autoridad de negocio, precio, separación, estado y exclusiones', async () => {
    await escenario(async (f) => {
      const portal = await f.iniciar();
      const base = seleccion(f);
      for (const campo of ['negocioId', 'costoAceptado', 'separacionMinutos',
        'estado', 'modalidad', 'excluirCitaId']) {
        await f.post('/apartados', { ...base, [campo]: 1 }, portal).expect(400);
      }
      expect((await f.db.query(`SELECT COUNT(*) AS n FROM operaciones_apartado
        WHERE negocio_id=?`, [f.negocios[0].id]))[0].n).toBe('0');
      const apartado = await f.post('/apartados', base, portal).expect(201);
      for (const campo of ['negocioId', 'costoAceptado', 'estado', 'modalidad']) {
        await f.post('/intentos', { clave: 'ala_134_intento_1234',
          apartadoId: apartado.body.apartadoId, [campo]: 1 }, portal).expect(400);
      }
      await f.post('/intentos', { clave: 'ala_134_intento_1234',
        apartadoId: apartado.body.apartadoId }, portal).expect(201);
      for (const campo of ['negocioId', 'costoAceptado', 'estado', 'modalidad']) {
        await f.post('/intentos/ala_134_intento_1234/reservar',
          { ...CONTACTO, [campo]: 1 }, portal).expect(400);
      }
      expect((await f.db.query(`SELECT COUNT(*) AS n FROM citas
        WHERE negocio_id=? AND origen='portal_publico'`, [f.negocios[0].id]))[0].n).toBe('0');
    });
  });

  it('T135 conserva cookie, origen, CSRF y límite exacto del cuerpo', async () => {
    await escenario(async (f) => {
      const http = f.app.getHttpServer();
      await request(http).post(`${RUTA}/sesion`).set('Origin', 'https://ajeno.test')
        .set('X-Portal-Inicializacion', '1').send({}).expect(403);
      const inicio = await request(http).post(`${RUTA}/sesion`)
        .set('Origin', ORIGEN).set('X-Portal-Inicializacion', '1')
        .send({}).expect(201);
      expect(inicio.headers['set-cookie'][0]).toMatch(/HttpOnly; SameSite=Strict/);
      const portal = { cookie: inicio.headers['set-cookie'][0].split(';')[0],
        csrf: inicio.body.csrfToken as string };
      const cookie = portal.cookie;
      expect(cookie.startsWith(`${COOKIE_RESERVA}=`)).toBe(true);
      const otroNegocio = await f.iniciar('/publico/negocios/portal-prueba-2');
      const correcta = seleccion(f);
      await f.post('/apartados', correcta, otroNegocio).expect(401);
      await request(http).post(`${RUTA}/apartados`).set('Origin', ORIGEN)
        .set('X-CSRF-Token', portal.csrf).send(correcta).expect(401);
      await request(http).post(`${RUTA}/apartados`).set('Cookie', cookie)
        .set('X-CSRF-Token', portal.csrf).send(correcta).expect(403);
      await request(http).post(`${RUTA}/apartados`).set('Origin', ORIGEN)
        .set('Cookie', cookie).set('X-CSRF-Token', 'incorrecto')
        .send(correcta).expect(403);
      const exceso = await f.post('/apartados',
        { ...correcta, notas: 'x'.repeat(32768) }, portal).expect(400);
      expect(exceso.headers['cache-control']).toBe('no-store');
      expect(exceso.body).toMatchObject({ codigo: 'portal_400', accion: 'corregir' });
      expect((await f.db.query(`SELECT COUNT(*) AS n FROM operaciones_apartado
        WHERE negocio_id=?`, [f.negocios[0].id]))[0].n).toBe('0');
    });
  });

  it('T136 reintenta deadlock y devuelve 503 al agotar sin crear cita', async () => {
    await escenario(async (f) => {
      const portal = await f.iniciar();
      const apartado = await f.post('/apartados', seleccion(f), portal).expect(201);
      const clave = 'ala_136_intento_1234';
      await f.post('/intentos', { clave, apartadoId: apartado.body.apartadoId }, portal)
        .expect(201);
      const coordinacion = f.app.get(CoordinacionReservaPublicaService);
      const original = coordinacion.transaccion.bind(coordinacion);
      let veces = 0;
      const claves: string[] = [];
      const espia = jest.spyOn(coordinacion, 'transaccion').mockImplementation(
        (claveEstable, ejecutar) => original(claveEstable, async (manager) => {
          claves.push(claveEstable);
          if (++veces === 1) throw Object.assign(new Error('deadlock interno'),
            { code: 'ER_LOCK_DEADLOCK' });
          return ejecutar(manager);
        }));
      try {
        const resultado = await f.post(`/intentos/${clave}/reservar`, CONTACTO, portal)
          .expect(201);
        expect(resultado.body.estado).toBe('pendiente');
        expect(veces).toBe(2);
        expect(claves).toEqual([clave, clave]);
      } finally { espia.mockRestore(); }
      const segundo = await f.post('/apartados', { ...seleccion(f),
        clave: 'ala_136_apartado_2222', horaInicio: '09:00' }, portal).expect(201);
      const otraClave = 'ala_136_intento_2222';
      await f.post('/intentos', { clave: otraClave,
        apartadoId: segundo.body.apartadoId }, portal).expect(201);
      const clavesAgotadas: string[] = [];
      const agotado = jest.spyOn(coordinacion, 'transaccion').mockImplementation(
        (claveEstable, ejecutar) => original(claveEstable, async (_manager) => {
          void ejecutar;
          clavesAgotadas.push(claveEstable);
          throw Object.assign(new Error('timeout interno'), { code: 'ER_LOCK_WAIT_TIMEOUT' });
        }));
      try {
        const respuesta = await f.post(`/intentos/${otraClave}/reservar`,
          CONTACTO, portal).expect(503);
        expect(JSON.stringify(respuesta.body)).not.toContain('timeout interno');
        expect(clavesAgotadas).toEqual([otraClave, otraClave, otraClave]);
      } finally { agotado.mockRestore(); }
      expect((await f.db.query(`SELECT COUNT(*) AS n FROM citas
        WHERE negocio_id=? AND origen='portal_publico'`, [f.negocios[0].id]))[0].n)
        .toBe('1');
      expect((await f.db.query(`SELECT estado FROM intentos_reserva_publica
        WHERE clave=?`, [otraClave]))[0].estado).toBe('preparado');
    });
  });

  it('T137 redacta SQL, oculta importes y protege resultados personales', async () => {
    await escenario(async (f) => {
      const http = f.app.getHttpServer();
      const portal = await f.iniciar();
      const ajeno = await f.iniciar();
      const apartado = await f.post('/apartados', seleccion(f), portal).expect(201);
      const clave = 'ala_137_intento_1234';
      await f.post('/intentos', { clave, apartadoId: apartado.body.apartadoId }, portal)
        .expect(201);
      await f.post(`/intentos/${clave}/reservar`, CONTACTO, ajeno).expect(404);
      const registro = f.app.get(RegistroReservaPublicaService);
      const fallo = jest.spyOn(registro, 'registrarConMeta')
        .mockRejectedValueOnce(new Error('SELECT password_hash FROM usuarios; stack secreto'));
      try {
        const respuesta = await f.post(`/intentos/${clave}/reservar`,
          CONTACTO, portal).expect(500);
        expect(respuesta.headers['cache-control']).toBe('no-store');
        expect(JSON.stringify(respuesta.body)).not.toMatch(/SELECT|password_hash|stack secreto|Ana Pérez/);
      } finally { fallo.mockRestore(); }
      await request(http).patch('/negocios/publicacion-catalogo')
        .auth(f.tokens.adminA, { type: 'bearer' })
        .send({ mostrarPreciosPublicos: false }).expect(200);
      const registrada = await f.post(`/intentos/${clave}/reservar`,
        CONTACTO, portal).expect(201);
      expect(registrada.headers['cache-control']).toBe('no-store');
      expect(JSON.stringify(registrada.body)).not.toMatch(/costo|100\.00/i);
      const recuperada = await f.post(`/intentos/${clave}/resolver`,
        { apartadoId: apartado.body.apartadoId }, portal).expect(200);
      expect(recuperada.headers['cache-control']).toBe('no-store');
      expect(JSON.stringify(recuperada.body)).not.toMatch(/costo|100\.00/i);
      const ajena = await f.post(`/intentos/${clave}/resolver`,
        { apartadoId: apartado.body.apartadoId }, ajeno).expect(404);
      expect(JSON.stringify(ajena.body)).not.toContain(CONTACTO.nombre);
    });
  });

  it('T138 audita cambios reales y no duplica eventos por repetición', async () => {
    await escenario(async (f) => {
      const http = f.app.getHttpServer();
      const a = f.negocios[0];
      const eventos = () => f.db.query(`SELECT accion,valores_antes,valores_despues
        FROM eventos_auditoria WHERE negocio_id=? ORDER BY id`, [a.id]);
      const antes = (await eventos()).length;
      const publicar = () => request(http).patch('/negocios/publicacion-catalogo')
        .auth(f.tokens.adminA, { type: 'bearer' })
        .send({ mostrarPreciosPublicos: false });
      await publicar().expect(200);
      await publicar().expect(200);
      const config = () => request(http).put('/disponibilidad/configuracion')
        .auth(f.tokens.adminA, { type: 'bearer' })
        .send({ ...CONFIG, tiempoEntreCitasMinutos: 5 });
      await config().expect(200);
      await config().expect(200);
      const baja = () => request(http).post(`/servicios/${a.servicioId}/inhabilitar`)
        .auth(f.tokens.adminA, { type: 'bearer' }).send({});
      await baja().expect(200);
      await baja().expect(200);
      await request(http).patch(`/negocios/${a.id}/limites-usuarios`)
        .auth(f.tokens.super, { type: 'bearer' })
        .send({ limiteProfesionalesActivos: 6,
          limiteRecepcionistasActivos: 3 }).expect(200);
      await request(http).patch(`/negocios/${a.id}/limites-usuarios`)
        .auth(f.tokens.super, { type: 'bearer' })
        .send({ limiteProfesionalesActivos: 6,
          limiteRecepcionistasActivos: 3 }).expect(200);
      await f.db.query(`UPDATE negocios SET correo_administrador=email_contacto
        WHERE id=?`, [a.id]);
      const licenciaId = Number((await f.db.query(`SELECT id FROM licencias
        WHERE negocio_id=?`, [a.id]))[0].id);
      const suspender = () => request(http).post(`/licencias/${licenciaId}/suspender`)
        .auth(f.tokens.super, { type: 'bearer' })
        .set('Idempotency-Key', 'ala-138-suspender-1234567890')
        .send({ plazoDias: 2 });
      await suspender().expect(200);
      await suspender().expect(200);
      const posteriores = await eventos();
      expect(posteriores.length - antes).toBe(5);
      expect(posteriores.map((e: { accion: string }) => e.accion))
        .toEqual(expect.arrayContaining(['publicacion_catalogo_modificada']));
      expect(posteriores.every((e: { valores_antes: unknown; valores_despues: unknown }) =>
        e.valores_antes !== null || e.valores_despues !== null)).toBe(true);
      const publicacion = posteriores.find((e: { accion: string }) =>
        e.accion === 'publicacion_catalogo_modificada');
      expect(JSON.stringify(publicacion.valores_antes)).toContain('true');
      expect(JSON.stringify(publicacion.valores_despues)).toContain('false');
      expect(JSON.stringify(posteriores)).not.toMatch(/password_hash|secreto|6141234567/i);
    });
  });

  it('T139 recorre las nueve rutas públicas y sus estados', async () => {
    await escenario(async (f) => {
      const http = f.app.getHttpServer();
      const n = f.negocios[0];
      await request(http).get(`${RUTA}/catalogo`).expect(200);
      await request(http).get(`${RUTA}/catalogo`)
        .query({ servicioId: n.servicioId, sucursalId: n.sucursalId }).expect(200);
      await request(http).get(`${RUTA}/disponibilidad`).query({ personalId: n.profesionalId,
        sucursalId: n.sucursalId, servicioId: n.servicioId,
        desde: '2026-10-20', hasta: '2026-10-20' }).expect(200);
      const portal = await f.iniciar();
      const apartado = await f.post('/apartados', seleccion(f), portal).expect(201);
      await request(http).get(`${RUTA}/apartados/${apartado.body.apartadoId}`)
        .set('Cookie', portal.cookie).expect(200);
      const clave = 'ala_139_intento_1234';
      await f.post('/intentos', { clave, apartadoId: apartado.body.apartadoId }, portal)
        .expect(201);
      await f.post(`/intentos/${clave}/reservar`, CONTACTO, portal).expect(201);
      await f.post(`/intentos/${clave}/resolver`,
        { apartadoId: apartado.body.apartadoId }, portal).expect(200);
      const segundo = await f.post('/apartados', { ...seleccion(f),
        clave: 'ala_139_apartado_2222', horaInicio: '09:00' }, portal).expect(201);
      await f.post(`/apartados/${segundo.body.apartadoId}/liberar`,
        { generacion: segundo.body.generacion }, portal).expect(204);
    });
  });

  it('T140 distingue negativo funcional de fallo técnico en cinco rutas privadas', async () => {
    await escenario(async (f) => {
      const http = f.app.getHttpServer();
      const n = f.negocios[0];
      const auth = (peticion: request.Test, token = 'adminA') =>
        peticion.auth(f.tokens[token], { type: 'bearer' });
      await request(http).get('/disponibilidad/configuracion').expect(401);
      await auth(request(http).get('/disponibilidad/configuracion'), 'recepcion')
        .expect(403);
      await auth(request(http).get('/disponibilidad/configuracion'), 'profesional')
        .expect(403);
      await auth(request(http).get('/disponibilidad/configuracion')).expect(200);
      await auth(request(http).put('/disponibilidad/configuracion').send(CONFIG))
        .expect(200);
      const query = { personalId: n.profesionalId, sucursalId: n.sucursalId,
        servicioId: n.servicioId, desde: '2026-10-20', hasta: '2026-10-20' };
      await auth(request(http).get('/disponibilidad').query(query)).expect(200);
      await auth(request(http).get('/disponibilidad').query(query),
        'profesional').expect(200);
      const validacion = await auth(request(http).post('/disponibilidad/validar')
        .send({ personalId: n.profesionalId, sucursalId: n.sucursalId,
          servicioId: n.servicioId, fechaLocal: '2026-10-20',
          horaInicio: '07:00' })).expect(200);
      expect(validacion.body.valido).toBe(false);
      await auth(request(http).get('/disponibilidad/citas-afectadas')
        .query({ desde: '2026-10-20', hasta: '2026-10-20',
          personalId: n.profesionalId })).expect(200);
      const motor = f.app.get(MotorDisponibilidadService);
      const fallo = jest.spyOn(motor, 'consultar')
        .mockRejectedValueOnce(Object.assign(new Error('SELECT secreto'),
          { code: 'ER_LOCK_WAIT_TIMEOUT' }));
      try {
        const respuesta = await auth(request(http).get('/disponibilidad')
          .query(query)).expect(503);
        expect(JSON.stringify(respuesta.body)).not.toContain('SELECT secreto');
      } finally { fallo.mockRestore(); }
      const inesperado = jest.spyOn(motor, 'consultar')
        .mockRejectedValueOnce(new Error('SELECT privado'));
      try {
        const respuesta = await auth(request(http).get('/disponibilidad')
          .query(query)).expect(500);
        expect(JSON.stringify(respuesta.body)).not.toContain('SELECT privado');
      } finally { inesperado.mockRestore(); }
    });
  });
});
