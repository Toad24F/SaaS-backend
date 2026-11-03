import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { RELOJ } from '../src/comun/reloj';
import { instalarLimiteCuerpoPublico } from '../src/reservas-publicas/limite-cuerpo-publico';
import { conBaseMigrada } from './support/mariadb';
import { crearEscenarioPortal } from './support/escenario-portal';
import { RelojPrueba } from './support/reloj';

const RUTA = '/publico/negocios/portal-prueba-1';
const ORIGEN = 'https://citas.example.test';
const CONTACTO = { nombre: 'Ana Pérez', telefono: '6141234567', notas: 'Consulta' };

/** Recorre las rutas reales con cookie, origen y CSRF en una base desechable. */
async function conPortal(ejecutar: (f: {
  db: DataSource; negocioId: number; apartadoId: number; intentoId: string;
  clave: string; preparar: (cuerpo: unknown) => request.Test;
  reservar: (clave: string, cuerpo: unknown) => request.Test;
  resolver: (clave: string) => request.Test;
}) => Promise<void>) {
  await conBaseMigrada(async (db) => {
    const reloj = new RelojPrueba(new Date('2026-10-20T12:00:00Z'));
    const { negocios: [negocio] } = await crearEscenarioPortal(db, reloj);
    const negocioId = negocio.id;
    const personalId = negocio.profesionales[0];
    const sucursalId = negocio.sucursales[0].id;
    const servicioId = Number((await db.query(
      'SELECT id FROM servicios WHERE negocio_id=? AND activo=1', [negocioId]))[0].id);
    await db.query(`INSERT INTO licencias (negocio_id,creado_en,habilitada_en,vence_en)
      VALUES (?,'2026-01-01','2026-01-01','2027-01-01')`, [negocioId]);
    await db.query(`INSERT INTO configuracion_agenda
      (negocio_id,modo,tiempo_entre_citas_minutos,anticipacion_minutos,dias_futuros)
      VALUES (?,'ventana_libre',0,15,1)`, [negocioId]);
    await db.query(`INSERT INTO horarios_personal (negocio_id,personal_id,sucursal_id,
      dia_semana,orden,inicio_minutos,fin_minutos,activo)
      VALUES (?,?,?,2,0,480,720,1)`, [negocioId, personalId, sucursalId]);
    const previos = { PORTAL_PUBLICO_ORIGEN: process.env.PORTAL_PUBLICO_ORIGEN,
      PORTAL_CSRF_SECRET: process.env.PORTAL_CSRF_SECRET,
      PORTAL_FORMULARIO_HMAC_SECRET: process.env.PORTAL_FORMULARIO_HMAC_SECRET };
    process.env.PORTAL_PUBLICO_ORIGEN = ORIGEN;
    process.env.PORTAL_CSRF_SECRET = 'secreto-csrf-prueba-http-1234567890123456';
    process.env.PORTAL_FORMULARIO_HMAC_SECRET = 'secreto-formulario-prueba-http-1234567890123456';
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DataSource).useValue(db).overrideProvider(RELOJ).useValue(reloj).compile();
    const app = modulo.createNestApplication();
    try {
      instalarLimiteCuerpoPublico(app);
      await app.init();
      const http = app.getHttpServer();
      const sesion = await request(http).post(`${RUTA}/sesion`)
        .set('Origin', ORIGEN).set('X-Portal-Inicializacion', '1').expect(201);
      const cookie = sesion.headers['set-cookie'][0].split(';')[0];
      const csrf = sesion.body.csrfToken as string;
      const post = (ruta: string, cuerpo: unknown) => request(http).post(`${RUTA}${ruta}`)
        .set('Origin', ORIGEN).set('Cookie', cookie)
        .set('X-CSRF-Token', csrf).send(cuerpo);
      const apartado = await post('/apartados', {
        clave: 'ala_118_apartado_123', personalId, sucursalId, servicioId,
        fechaLocal: '2026-10-20', horaInicio: '08:00' }).expect(201);
      const apartadoId = apartado.body.apartadoId as number;
      const clave = 'ala_118_intento_1234';
      const preparado = await post('/intentos', { clave, apartadoId }).expect(201);
      const intentoId = (await db.query(`SELECT id FROM intentos_reserva_publica
        WHERE negocio_id=? AND clave=?`, [negocioId, clave]))[0].id as string;
      expect(preparado.body).toMatchObject({ id: clave, apartadoId });
      await ejecutar({ db, negocioId, apartadoId, intentoId, clave,
        preparar: (cuerpo) => post('/intentos', cuerpo),
        reservar: (id, cuerpo) => post(`/intentos/${id}/reservar`, cuerpo),
        resolver: (id) => post(`/intentos/${id}/resolver`, { apartadoId }) });
    } finally {
      await app.close();
      for (const [clave, valor] of Object.entries(previos)) {
        if (valor === undefined) delete process.env[clave];
        else process.env[clave] = valor;
      }
    }
  });
}

describe('ALA-T118: corrección pública del cupo', () => {
  it('devuelve mensaje exacto, resuelve rechazo y acepta sucesor explícito', async () => {
    await conPortal(async (f) => {
      const [cliente] = await f.db.query('SELECT id FROM clientes WHERE negocio_id=?',
        [f.negocioId]);
      for (const [indice, inicio] of ['2026-10-20T17:00:00Z',
        '2026-10-20T18:00:00Z'].entries()) {
        const [apartado] = await f.db.query(`SELECT personal_id,sucursal_id,servicio_id
          FROM bloqueos_temporales WHERE id=?`, [f.apartadoId]);
        await f.db.query(`INSERT INTO citas (negocio_id,sucursal_id,personal_id,
          servicio_id,cliente_id,inicio_utc,fin_utc,zona_horaria_reserva,
          folio,estado,origen,telefono_contacto)
          VALUES (?,?,?,?,?,?,?,'America/Chihuahua',?,'pendiente','manual',?)`,
        [f.negocioId, apartado.sucursal_id, apartado.personal_id,
          apartado.servicio_id, cliente.id, new Date(inicio),
          new Date(new Date(inicio).getTime() + 1800000), `ALA118-${indice}`,
          CONTACTO.telefono]);
      }
      const rechazo = await f.reservar(f.clave, CONTACTO).expect(409);
      expect(rechazo.body).toEqual({ codigo: 'cupo_telefono_excedido',
        mensaje: 'No se puede registrar otra cita con este teléfono en esta sucursal. Contacta al negocio',
        accion: 'corregir' });
      expect(rechazo.headers['cache-control']).toBe('no-store');
      expect((await f.resolver(f.clave).expect(200)).body).toEqual({
        estado: 'no_registrado', causa: 'cupo_telefono_excedido', puedeCorregir: true });
      await f.preparar({ clave: 'ala_118_nueva_sin_id',
        apartadoId: f.apartadoId }).expect(409);
      const sucesor = { clave: 'ala_118_sucesor_1234',
        apartadoId: f.apartadoId, intentoAnteriorId: String(f.intentoId) };
      await f.preparar(sucesor).expect(201);
      await f.preparar(sucesor).expect(200);
      await f.preparar({ ...sucesor, negocioId: f.negocioId }).expect(400);
      await f.reservar(f.clave, { ...CONTACTO, telefono: '6149999999' }).expect(409);
      const registrada = await f.reservar(sucesor.clave,
        { ...CONTACTO, telefono: '6149999999' }).expect(201);
      expect(registrada.body.estado).toBe('pendiente');
      expect((await f.resolver(f.clave).expect(200)).body.puedeCorregir).toBe(false);
      expect((await f.db.query(`SELECT COUNT(*) AS n FROM citas
        WHERE negocio_id=? AND origen='portal_publico'`, [f.negocioId]))[0].n).toBe('1');
    });
  });
});
