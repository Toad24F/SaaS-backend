import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { RELOJ } from '../src/comun/reloj';
import { MotorDisponibilidadService } from '../src/disponibilidad/motor-disponibilidad.service';
import { conBaseMigrada } from './support/mariadb';
import { crearEscenarioPortal } from './support/escenario-portal';
import { RelojPrueba } from './support/reloj';

const AHORA = new Date('2026-10-20T12:00:00.000Z');
const ORIGEN = 'https://citas.example.test';
const RUTA = '/publico/negocios/portal-prueba-1';
type Sesion = { cookie: string; csrf: string };
type Negocio = Awaited<ReturnType<typeof crearEscenarioPortal>>['negocios'][number];

/** Cada prueba usa una base migrada aislada y restaura la configuración HTTP. */
async function conApartados(ejecutar: (f: { db: DataSource; app: INestApplication;
  reloj: RelojPrueba; a: Negocio; b: Negocio; servicioId: number;
  iniciar: (ruta?: string) => Promise<Sesion>;
  crear: (sesion: Sesion, clave: string, horaInicio: string,
    cambios?: Record<string, unknown>) => ReturnType<typeof request>;
  consultar: (sesion: Sesion, id: number, ruta?: string) => ReturnType<typeof request>;
  liberar: (sesion: Sesion, id: number, generacion: string,
    ruta?: string) => ReturnType<typeof request>;
}) => Promise<void>) {
  await conBaseMigrada(async (db) => {
    const reloj = new RelojPrueba(AHORA);
    const { negocios: [a, b] } = await crearEscenarioPortal(db, reloj);
    for (const negocio of [a, b]) await db.query(`INSERT INTO licencias
      (negocio_id,creado_en,habilitada_en,vence_en)
      VALUES (?,'2026-01-01','2026-01-01','2027-01-01')`, [negocio.id]);
    await db.query(`INSERT INTO horarios_personal (negocio_id,personal_id,sucursal_id,
      dia_semana,orden,inicio_minutos,fin_minutos,activo)
      VALUES (?,?,?,2,0,480,720,1)`, [a.id, a.profesionales[0], a.sucursales[0].id]);
    const servicioId = Number((await db.query('SELECT id FROM servicios WHERE negocio_id=? AND activo=1',
      [a.id]))[0].id);
    const anterior = { origen: process.env.PORTAL_PUBLICO_ORIGEN,
      secreto: process.env.PORTAL_CSRF_SECRET };
    process.env.PORTAL_PUBLICO_ORIGEN = ORIGEN;
    process.env.PORTAL_CSRF_SECRET = 'secreto-de-pruebas-del-portal-de-32-caracteres';
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DataSource).useValue(db).overrideProvider(RELOJ).useValue(reloj).compile();
    const app = modulo.createNestApplication();
    try {
      await app.init();
      const http = app.getHttpServer();
      const iniciar = async (ruta = RUTA) => {
        const respuesta = await request(http).post(`${ruta}/sesion`)
          .set('Origin', ORIGEN).set('X-Portal-Inicializacion', '1').expect(201);
        return { cookie: respuesta.headers['set-cookie'][0].split(';')[0],
          csrf: respuesta.body.csrfToken as string };
      };
      const crear = (sesion: Sesion, clave: string, horaInicio: string,
        cambios: Record<string, unknown> = {}) => request(http).post(`${RUTA}/apartados`)
        .set('Cookie', sesion.cookie).set('Origin', ORIGEN)
        .set('X-CSRF-Token', sesion.csrf).send({ clave,
          personalId: a.profesionales[0], sucursalId: a.sucursales[0].id,
          servicioId, fechaLocal: '2026-10-20', horaInicio, ...cambios });
      const consultar = (sesion: Sesion, id: number, ruta = RUTA) =>
        request(http).get(`${ruta}/apartados/${id}`).set('Cookie', sesion.cookie);
      const liberar = (sesion: Sesion, id: number, generacion: string,
        ruta = RUTA) => request(http).post(`${ruta}/apartados/${id}/liberar`)
        .set('Cookie', sesion.cookie).set('Origin', ORIGEN)
        .set('X-CSRF-Token', sesion.csrf).send({ generacion });
      await ejecutar({ db, app, reloj, a, b, servicioId,
        iniciar, crear, consultar, liberar });
    } finally {
      await app.close();
      process.env.PORTAL_PUBLICO_ORIGEN = anterior.origen;
      process.env.PORTAL_CSRF_SECRET = anterior.secreto;
    }
  });
}

describe('M3-T065–T068: plazo, reemplazo, interrupción y propiedad', () => {
  it('mantiene los cinco minutos ante consultas, errores y repetición; vence en el límite exacto', async () => {
    await conApartados(async ({ db, reloj, a, iniciar, crear, consultar }) => {
      const sesion = await iniciar();
      const clave = 'apartado_plazo_12345';
      const primero = await crear(sesion, clave, '08:00').expect(201);
      const id = primero.body.apartadoId as number;
      const expiraEn = '2026-10-20T12:05:00.000Z';
      expect(primero.body.expiraEn).toBe(expiraEn);
      reloj.fijar(new Date('2026-10-20T12:04:59.999Z'));
      expect((await consultar(sesion, id).expect(200)).body)
        .toMatchObject({ estado: 'vigente', expiraEn,
          servidorAhora: reloj.ahora().toISOString() });
      // Ni una entrada inválida ni una clave incompatible alteran el plazo.
      await crear(sesion, 'apartado_error_1234', '08:30', { costoAceptado: '0.01' })
        .expect(400);
      await crear(sesion, clave, '09:00').expect(409);
      expect((await crear(sesion, clave, '08:00').expect(200)).body)
        .toMatchObject({ apartadoId: id, expiraEn });
      reloj.fijar(new Date(expiraEn));
      expect((await consultar(sesion, id).expect(200)).body.estado).toBe('vencido');
      reloj.fijar(new Date('2026-10-20T12:05:00.001Z'));
      expect((await consultar(sesion, id).expect(200)).body.estado).toBe('vencido');
      expect((await crear(sesion, clave, '08:00').expect(200)).body.expiraEn).toBe(expiraEn);
      const filas = await db.query(`SELECT expira_en,liberado_en FROM bloqueos_temporales
        WHERE id=? AND negocio_id=?`, [id, a.id]);
      expect(new Date(filas[0].expira_en).toISOString()).toBe(expiraEn);
      expect(filas[0].liberado_en).toBeNull();
      expect((await db.query(`SELECT COUNT(*) AS total FROM bloqueos_temporales
        WHERE negocio_id=? AND operacion_id IS NOT NULL`, [a.id]))[0].total).toBe('1');
    });
  }, 120000);

  it('deja liberado el anterior cuando la nueva selección falla y descarta avisos viejos', async () => {
    await conApartados(async ({ db, reloj, a, iniciar, crear, consultar, liberar }) => {
      const sesion = await iniciar();
      const primero = await crear(sesion, 'apartado_primero_123', '08:00').expect(201);
      const primerId = primero.body.apartadoId as number;
      const fallido = await crear(sesion, 'apartado_fallido_123', '17:00').expect(409);
      expect(fallido.body).toMatchObject({ codigo: 'portal_409' });
      expect((await consultar(sesion, primerId).expect(200)).body.estado).toBe('sustituido');
      expect((await db.query('SELECT liberado_en FROM bloqueos_temporales WHERE id=?',
        [primerId]))[0].liberado_en).not.toBeNull();
      expect((await db.query(`SELECT estado,generacion FROM operaciones_apartado
        WHERE negocio_id=? AND clave=?`, [a.id, 'apartado_fallido_123']))[0])
        .toMatchObject({ estado: 'rechazada', generacion: '2' });
      await crear(sesion, 'apartado_fallido_123', '17:00').expect(409);
      const segundo = await crear(sesion, 'apartado_segundo_123', '09:00').expect(201);
      const tercero = await crear(sesion, 'apartado_tercero_123', '10:00').expect(201);
      await liberar(sesion, primerId, '1').expect(204);
      await liberar(sesion, segundo.body.apartadoId, '3').expect(204);
      expect((await consultar(sesion, tercero.body.apartadoId).expect(200)).body.estado)
        .toBe('vigente');
      // El estado histórico no revive al consultar o repetir una clave vieja.
      await crear(sesion, 'apartado_primero_123', '08:00').expect(200);
      expect((await consultar(sesion, tercero.body.apartadoId).expect(200)).body.estado)
        .toBe('vigente');
      const vigentes = await db.query(`SELECT COUNT(*) AS total FROM bloqueos_temporales
        WHERE negocio_id=? AND sesion_id IS NOT NULL AND liberado_en IS NULL
        AND expira_en>?`, [a.id, reloj.ahora()]);
      expect(vigentes[0].total).toBe('1');
    });
  }, 120000);

  it('retoma una operación preparada tras fallo entre commits y conserva negativas terminales', async () => {
    await conApartados(async ({ db, app, a, iniciar, crear, consultar }) => {
      const sesion = await iniciar();
      const primero = await crear(sesion, 'apartado_inicio_1234', '08:00').expect(201);
      const motor = app.get(MotorDisponibilidadService);
      const fallo = jest.spyOn(motor, 'revalidarPublicoEnTransaccion')
        .mockRejectedValueOnce(new Error('Fallo técnico entre fases: SQL privado'));
      const error = await crear(sesion, 'apartado_retomar_123', '09:00').expect(500);
      expect(JSON.stringify(error.body)).not.toMatch(/SQL privado|bloqueos_temporales/i);
      fallo.mockRestore();
      // El primer commit ya liberó el anterior; solo la segunda fase falló.
      expect((await db.query('SELECT liberado_en FROM bloqueos_temporales WHERE id=?',
        [primero.body.apartadoId]))[0].liberado_en).not.toBeNull();
      expect((await db.query(`SELECT estado FROM operaciones_apartado
        WHERE negocio_id=? AND clave=?`, [a.id, 'apartado_retomar_123']))[0].estado)
        .toBe('preparada');
      expect((await consultar(sesion, primero.body.apartadoId).expect(200)).body.estado)
        .toBe('sustituido');
      const retomada = await crear(sesion, 'apartado_retomar_123', '09:00').expect(200);
      expect(retomada.body).toMatchObject({ estado: 'concedida', generacion: '2' });
      expect((await crear(sesion, 'apartado_retomar_123', '09:00').expect(200)).body)
        .toMatchObject({ apartadoId: retomada.body.apartadoId,
          expiraEn: retomada.body.expiraEn });
      expect((await db.query(`SELECT COUNT(*) AS total FROM bloqueos_temporales
        WHERE negocio_id=? AND operacion_id=(SELECT id FROM operaciones_apartado
          WHERE negocio_id=? AND clave=?)`, [a.id, a.id, 'apartado_retomar_123']))[0].total)
        .toBe('1');
      await crear(sesion, 'apartado_terminal_123', '17:00').expect(409);
      await crear(sesion, 'apartado_terminal_123', '17:00').expect(409);
      expect((await db.query(`SELECT estado FROM operaciones_apartado
        WHERE negocio_id=? AND clave=?`, [a.id, 'apartado_terminal_123']))[0].estado)
        .toBe('rechazada');
    });
  }, 120000);

  it('aísla titulares y negocios, conserva precio aceptado y no consume filas heredadas', async () => {
    await conApartados(async ({ db, reloj, a, b, servicioId,
      iniciar, crear, consultar, liberar }) => {
      const titular = await iniciar();
      const ajeno = await iniciar();
      const otroNegocio = await iniciar('/publico/negocios/portal-prueba-2');
      const primero = await crear(titular, 'apartado_precio_1234', '08:00').expect(201);
      const id = primero.body.apartadoId as number;
      expect(primero.body.costoAceptado).toBe('100.00');
      await consultar(ajeno, id).expect(404);
      await liberar(ajeno, id, '1').expect(404);
      await consultar(otroNegocio, id, '/publico/negocios/portal-prueba-2').expect(404);
      await liberar(otroNegocio, id, '1', '/publico/negocios/portal-prueba-2').expect(404);
      await db.query('UPDATE servicios SET costo=150 WHERE id=? AND negocio_id=?',
        [servicioId, a.id]);
      expect((await crear(titular, 'apartado_precio_1234', '08:00').expect(200))
        .body.costoAceptado).toBe('100.00');
      const segundo = await crear(titular, 'apartado_precio_2345', '09:00').expect(201);
      expect(segundo.body.costoAceptado).toBe('150.00');
      expect((await db.query('SELECT costo_aceptado FROM bloqueos_temporales WHERE id=?',
        [id]))[0].costo_aceptado).toBe('100.00');
      // La fila anterior al portal no tiene sesión ni operación, pero el motor
      // la considera ocupación mientras no llegue su vencimiento.
      const historico = await db.query(`INSERT INTO bloqueos_temporales
        (negocio_id,personal_id,sucursal_id,servicio_id,inicio_utc,fin_utc,
         expira_en,titular_hash) VALUES (?,?,?,?,?,?,?,?)`,
      [a.id, a.profesionales[0], a.sucursales[0].id, servicioId,
        new Date('2026-10-20T16:00:00Z'), new Date('2026-10-20T16:30:00Z'),
        new Date(reloj.ahora().getTime() + 300_000), 'f'.repeat(64)]);
      const historicoId = Number(historico.insertId);
      await consultar(titular, historicoId).expect(404);
      await liberar(titular, historicoId, '1').expect(404);
      await crear(ajeno, 'apartado_ocupado_123', '10:00').expect(409);
      const fila = (await db.query(`SELECT sesion_id,operacion_id,liberado_en
        FROM bloqueos_temporales WHERE id=? AND negocio_id=?`, [historicoId, a.id]))[0];
      expect(fila).toMatchObject({ sesion_id: null, operacion_id: null, liberado_en: null });
      expect((await db.query('SELECT COUNT(*) AS total FROM bloqueos_temporales WHERE negocio_id=?',
        [b.id]))[0].total).toBe('1');
    });
  }, 120000);
});
