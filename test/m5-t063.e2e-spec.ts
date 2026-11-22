import request from 'supertest';
import { Rol } from '../src/auth/enums/rol.enum';
import { conAgendaHttp } from './support/agenda-http';

const RUTA = '/negocio/automatizaciones';
const INICIAL = { version: 0, plazoConfirmacionHoras: 12, recordatorioHoras: 24 };
const MINIMOS = { version: 0, plazoConfirmacionHoras: 6, recordatorioHoras: 12 };
const MAXIMOS = { version: 1, plazoConfirmacionHoras: 24, recordatorioHoras: 48 };

type Escenario = Parameters<Parameters<typeof conAgendaHttp>[0]>[0];

function api(f: Escenario, indice = 0, rol = Rol.ADMIN_NEGOCIO) {
  const token = `Bearer ${f.token(f.actor(rol, indice).id)}`;
  return {
    leer: () => request(f.http).get(RUTA).set('Authorization', token),
    guardar: (entrada: object) => request(f.http).put(RUTA)
      .set('Authorization', token).send(entrada),
  };
}

describe('M5-T063 · configuración de automatizaciones', () => {
  it('resuelve el negocio de la sesión y reserva la lectura y escritura para Administración', async () => {
    await conAgendaHttp(async (f) => {
      await request(f.http).get(RUTA).expect(401);
      await request(f.http).put(RUTA).send(MINIMOS).expect(401);
      for (const rol of [Rol.RECEPCIONISTA, Rol.PROFESIONAL]) {
        await api(f, 0, rol).leer().expect(403);
        await api(f, 0, rol).guardar(MINIMOS).expect(403);
      }
      const superadmin = `Bearer ${f.token(f.superadmin.id)}`;
      await request(f.http).get(RUTA).set('Authorization', superadmin).expect(403);
      await request(f.http).put(RUTA).set('Authorization', superadmin).send(MINIMOS).expect(403);

      // La consulta inicial es efectiva aunque el negocio aún no tenga configuración guardada.
      await api(f).leer().expect(200, INICIAL);
      expect(await f.db.query('SELECT negocio_id FROM configuracion_automatizaciones')).toEqual([]);
      await api(f).guardar(MINIMOS).expect(200, { ...MINIMOS, version: 1 });
      await api(f, 1).leer().expect(200, INICIAL);
      await api(f, 1).guardar({ ...MINIMOS, negocioId: f.negocios[0].id }).expect(400);
      await api(f).leer().expect(200, { ...MINIMOS, version: 1 });
    });
  });

  it('acepta los extremos enteros y conserva ambos valores ante una entrada inválida o una versión vencida', async () => {
    await conAgendaHttp(async (f) => {
      const admin = api(f);
      await admin.guardar(MINIMOS).expect(200, { ...MINIMOS, version: 1 });

      // Los dos plazos y la versión son obligatorios y se reciben como números JSON.
      await admin.guardar({ version: 1, recordatorioHoras: 24 }).expect(400);
      await admin.guardar({ plazoConfirmacionHoras: 12, recordatorioHoras: 24 }).expect(400);
      for (const invalido of [
        { plazoConfirmacionHoras: 5 }, { plazoConfirmacionHoras: 25 },
        { plazoConfirmacionHoras: 6.5 }, { plazoConfirmacionHoras: '12' },
        { recordatorioHoras: 11 }, { recordatorioHoras: 49 },
        { recordatorioHoras: 12.5 }, { recordatorioHoras: null },
        { version: -1 }, { version: 1.5 }, { version: '1' }, { version: 2 ** 32 },
      ]) {
        await admin.guardar({ ...MAXIMOS, ...invalido }).expect(400);
      }
      await admin.guardar({ ...MAXIMOS, version: 0 }).expect(409);
      await admin.leer().expect(200, { ...MINIMOS, version: 1 });
      await admin.guardar(MAXIMOS).expect(200, { ...MAXIMOS, version: 2 });
      await admin.leer().expect(200, { ...MAXIMOS, version: 2 });
    });
  });

  it('aplica una sola primera escritura concurrente para la misma versión', async () => {
    await conAgendaHttp(async (f) => {
      const admin = api(f);
      const respuestas = await Promise.all([
        admin.guardar(MINIMOS),
        admin.guardar({ ...MAXIMOS, version: 0 }),
      ]);
      expect(respuestas.map(({ status }) => status).sort()).toEqual([200, 409]);
      const ganador = respuestas[0].status === 200 ? MINIMOS : MAXIMOS;
      await admin.leer().expect(200, { ...ganador, version: 1 });
    });
  });

  it('registra el cambio con su actor y conserva la cita, sus condiciones y su recordatorio', async () => {
    await conAgendaHttp(async (f) => {
      const negocio = f.negocios[0];
      const citaId = negocio.ocupaciones[0];
      const ahora = f.reloj.ahora();
      const desde = new Date(ahora.getTime() + 86_400_000);
      const hasta = new Date(desde.getTime() + 300_000);

      // La condición y el trabajo ya programado guardan la política aplicada antes de editarla.
      await api(f).guardar({ ...INICIAL, plazoConfirmacionHoras: 6 })
        .expect(200, { ...INICIAL, version: 1, plazoConfirmacionHoras: 6 });
      await f.db.query(`INSERT INTO canales_whatsapp (negocio_id,remitente_externo_id,secreto_ref)
        VALUES (?,'phone-t063','secret://whatsapp/prueba-t063')`, [negocio.id]);
      await f.db.query(`INSERT INTO condiciones_confirmacion_cita
        (negocio_id,cita_id,generacion,categoria,instante_base,plazo_aplicado_minutos,
          vencimiento_utc,version_configuracion) VALUES (?,?,1,'normal',?,360,?,1)`,
      [negocio.id, citaId, ahora, new Date(ahora.getTime() + 6 * 3_600_000)]);
      await f.db.query(`INSERT INTO envios_whatsapp
        (negocio_id,cita_id,generacion,tipo,clave_efecto,programado_en,util_hasta,
          proximo_intento_en,destino_e164,parametros_plantilla)
        VALUES (?,?,1,'recordatorio','recordatorio-t063',?,?,?,'+526141234567','{}')`,
      [negocio.id, citaId, desde, hasta, desde]);

      const leerHistorico = () => Promise.all([
        f.db.query('SELECT * FROM citas WHERE id = ?', [citaId]),
        f.db.query('SELECT * FROM condiciones_confirmacion_cita WHERE cita_id = ?', [citaId]),
        f.db.query('SELECT * FROM envios_whatsapp WHERE cita_id = ?', [citaId]),
      ]);
      const anterior = await leerHistorico();
      await api(f).guardar(MAXIMOS).expect(200, { ...MAXIMOS, version: 2 });
      expect(await leerHistorico()).toEqual(anterior);

      const eventos = await f.db.query(`SELECT negocio_id, actor_usuario_id FROM eventos_auditoria
        WHERE accion = 'configuracion_automatizaciones_modificada'`);
      expect(eventos).toEqual(Array.from({ length: 2 }, () => ({
        negocio_id: negocio.id, actor_usuario_id: f.actor(Rol.ADMIN_NEGOCIO).id,
      })));
    });
  });
});
