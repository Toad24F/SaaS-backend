import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { DataSource, QueryFailedError } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { RELOJ } from '../src/comun/reloj';
import { Rol } from '../src/auth/enums/rol.enum';
import { SesionesService } from '../src/auth/services/sesiones.service';
import { MotorDisponibilidadService } from '../src/disponibilidad/motor-disponibilidad.service';
import { ConfiguracionAgendaService } from '../src/disponibilidad/configuracion-agenda.service';
import { crearDatosOcupaciones } from './support/ocupaciones-fase-3';
import { conBaseMigrada } from './support/mariadb';
import { RelojPrueba } from './support/reloj';

const inicio = new Date('2026-07-06T16:07:00Z');

async function escenario(ejecutar: (datos: {
  app: INestApplication; db: DataSource; reloj: RelojPrueba;
  a: Awaited<ReturnType<typeof crearDatosOcupaciones>>['negocios'][number];
  b: Awaited<ReturnType<typeof crearDatosOcupaciones>>['negocios'][number];
  tokens: Record<string, string>; otroPerfil: number; sesionAdmin: string;
}) => Promise<void>) {
  await conBaseMigrada(async (db) => {
    const reloj = new RelojPrueba(inicio);
    const [a, b] = (await crearDatosOcupaciones(db, reloj)).negocios;
    for (const negocio of [a, b]) {
      await db.query('UPDATE negocios SET activado_en=creado_en WHERE id=?', [negocio.id]);
      await db.query(`INSERT INTO licencias
        (negocio_id,creado_en,habilitada_en,vence_en)
        VALUES (?,'2026-01-01','2026-01-01','2027-01-01')`, [negocio.id]);
    }
    await db.query('DELETE FROM bloqueos_temporales');
    await db.query('DELETE FROM citas');
    await db.query(`INSERT INTO horarios_personal (negocio_id,personal_id,sucursal_id,
      dia_semana,orden,inicio_minutos,fin_minutos,activo)
      VALUES (?,?,?,1,0,540,780,1)`, [a.id, a.personalId, a.sucursales[0]]);
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DataSource).useValue(db)
      .overrideProvider(RELOJ).useValue(reloj).compile();
    const app = modulo.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true,
      forbidNonWhitelisted: true }));
    try {
      await app.init();
      const alta = async (negocioId: number | null, rol: Rol, nombre: string) => {
        const fila = await db.query(`INSERT INTO usuarios
          (negocio_id,nombre,email,password_hash,rol,activo,activado_en)
          VALUES (?,?,?,'hash',?,1,CURRENT_TIMESTAMP(6))`,
        [negocioId, nombre, `${nombre}@agenda-t062.test`, rol]);
        return Number(fila.insertId);
      };
      const token = async (usuarioId: number, rol: Rol, negocioId: number | null) => {
        const sesion = await app.get(SesionesService).crear(usuarioId, inicio);
        const valor = app.get(JwtService).sign({ sub: usuarioId, sesionId: sesion.id,
          rol, negocioId });
        return { valor, sesionId: sesion.id };
      };
      const admin = await token(await alta(a.id, Rol.ADMIN_NEGOCIO, 'admin-t062'),
        Rol.ADMIN_NEGOCIO, a.id);
      const tokens = {
        admin: admin.valor,
        recepcion: (await token(await alta(a.id, Rol.RECEPCIONISTA, 'recepcion-t062'),
          Rol.RECEPCIONISTA, a.id)).valor,
        profesional: (await token(a.personalId, Rol.PROFESIONAL, a.id)).valor,
        ajeno: (await token(await alta(b.id, Rol.ADMIN_NEGOCIO, 'admin-b-t062'),
          Rol.ADMIN_NEGOCIO, b.id)).valor,
        superadmin: (await token(await alta(null, Rol.SUPERADMIN, 'super-t062'),
          Rol.SUPERADMIN, null)).valor,
      };
      const otroPerfil = await alta(a.id, Rol.PROFESIONAL, 'otro-prof-t062');
      await db.query('INSERT INTO personal (id,negocio_id) VALUES (?,?)',
        [otroPerfil, a.id]);
      await ejecutar({ app, db, reloj, a, b, tokens, otroPerfil,
        sesionAdmin: admin.sesionId });
    } finally { await app.close(); }
  });
}

describe('M2-T062–T066: validación y errores HTTP', () => {
  it('T080 edita duración por HTTP y conserva la cita mientras rechaza el apartado previo', async () => {
    await escenario(async ({ app, db, a, tokens, sesionAdmin }) => {
      const http = app.getHttpServer();
      const cliente = await db.query('SELECT id FROM clientes WHERE negocio_id=? LIMIT 1',
        [a.id]);
      const cita = await db.query(`INSERT INTO citas (negocio_id,personal_id,
        sucursal_id,servicio_id,cliente_id,inicio_utc,fin_utc,zona_horaria_reserva,
        estado,folio,origen) VALUES (?,?,?,?,?,'2026-07-06 16:00:00',
        '2026-07-06 16:30:00','America/Chihuahua','confirmada',?,'manual')`,
      [a.id, a.personalId, a.sucursales[0], a.servicios[0], cliente[0].id,
        'T080-HTTP']);
      const hash = 'e'.repeat(64);
      const apartado = await db.query(`INSERT INTO bloqueos_temporales
        (negocio_id,personal_id,sucursal_id,servicio_id,inicio_utc,
        fin_utc,expira_en,titular_hash) VALUES (?,?,?,?,?,?,?,?)`,
      [a.id, a.personalId, a.sucursales[0], a.servicios[0],
        new Date('2026-07-06T17:00:00Z'), new Date('2026-07-06T17:30:00Z'),
        new Date('2026-07-06T18:00:00Z'), hash]);
      const query = { personalId: a.personalId, sucursalId: a.sucursales[0],
        servicioId: a.servicios[0], desde: '2026-07-06', hasta: '2026-07-06' };
      const consultar = () => request(http).get('/disponibilidad')
        .auth(tokens.admin, { type: 'bearer' }).query(query);
      const antes = (await consultar().expect(200)).body;
      expect(antes.ranuras).toEqual(expect.arrayContaining([
        expect.objectContaining({ inicioUtc: '2026-07-06T16:30:00.000Z',
          finUtc: '2026-07-06T17:00:00.000Z' })]));
      await request(http).patch(`/servicios/${a.servicios[0]}`)
        .auth(tokens.admin, { type: 'bearer' })
        .send({ duracionMinutos: 45 }).expect(200);
      const despues = (await consultar().expect(200)).body;
      expect(despues.ranuras.some((ranura: { inicioUtc: string }) =>
        ranura.inicioUtc === '2026-07-06T16:30:00.000Z')).toBe(false);
      expect(despues.ranuras).toEqual(expect.arrayContaining([
        expect.objectContaining({ inicioUtc: '2026-07-06T17:30:00.000Z',
          finUtc: '2026-07-06T18:15:00.000Z' })]));
      const actor = await db.query('SELECT usuario_id FROM sesiones WHERE id=?',
        [sesionAdmin]);
      const revalidado = await db.transaction('READ COMMITTED', (manager) =>
        app.get(MotorDisponibilidadService).revalidarEnTransaccion(manager,
          { sub: Number(actor[0].usuario_id), sesionId: sesionAdmin },
          { personalId: a.personalId, sucursalId: a.sucursales[0],
            servicioId: a.servicios[0], fechaLocal: '2026-07-06',
            horaInicio: '11:00', modalidad: 'manual',
            apartadoPropio: { id: Number(apartado.insertId), titularHash: hash } }));
      expect(revalidado).toMatchObject({ valido: false,
        motivos: expect.arrayContaining(['apartado_no_vigente_o_incompatible']) });
      // La edición operativa no reescribe intervalos guardados ni consume el apartado.
      const historica = await db.query('SELECT fin_utc,estado FROM citas WHERE id=?',
        [cita.insertId]);
      const retenido = await db.query('SELECT fin_utc,liberado_en FROM bloqueos_temporales WHERE id=?',
        [apartado.insertId]);
      expect(new Date(historica[0].fin_utc).toISOString()).toBe('2026-07-06T16:30:00.000Z');
      expect(historica[0].estado).toBe('confirmada');
      expect(new Date(retenido[0].fin_utc).toISOString()).toBe('2026-07-06T17:30:00.000Z');
      expect(retenido[0].liberado_en).toBeNull();
    });
  });

  it('T083 omite datos privados en las cinco rutas y en la auditoría nueva', async () => {
    await escenario(async ({ app, db, a, b, tokens }) => {
      const http = app.getHttpServer();
      const cliente = await db.query('SELECT id FROM clientes WHERE negocio_id=? LIMIT 1',
        [a.id]);
      await db.query('UPDATE clientes SET nombre_completo=? WHERE id=?',
        ['CLIENTE-PRIVADO-T083', cliente[0].id]);
      const hash = 'f'.repeat(64);
      await db.query(`INSERT INTO citas (negocio_id,personal_id,sucursal_id,
        servicio_id,cliente_id,inicio_utc,fin_utc,zona_horaria_reserva,
        estado,folio,origen) VALUES (?,?,?,?,?,'2026-07-06 16:30:00',
        '2026-07-06 17:00:00','America/Chihuahua','confirmada',?,'manual')`,
      [a.id, a.personalId, a.sucursales[0], a.servicios[0], cliente[0].id,
        'FOLIO-PRIVADO-T083']);
      await db.query(`INSERT INTO bloqueos_temporales
        (negocio_id,personal_id,sucursal_id,servicio_id,inicio_utc,
        fin_utc,expira_en,titular_hash) VALUES (?,?,?,?,?,?,?,?)`,
      [a.id, a.personalId, a.sucursales[0], a.servicios[0],
        new Date('2026-07-06T17:00:00Z'), new Date('2026-07-06T17:30:00Z'),
        new Date('2026-07-06T18:00:00Z'), hash]);
      const auth = (solicitud: request.Test) => solicitud.auth(tokens.admin,
        { type: 'bearer' });
      const base = { personalId: a.personalId, sucursalId: a.sucursales[0],
        servicioId: a.servicios[0] };
      const cuerpos = [
        (await auth(request(http).get('/disponibilidad/configuracion')).expect(200)).body,
        (await auth(request(http).put('/disponibilidad/configuracion'))
          .send({ modo: 'ventana_libre', intervaloMinutos: 10,
            anticipacionMinutos: 15, diasFuturos: 60 }).expect(200)).body,
        (await auth(request(http).get('/disponibilidad')).query({ ...base,
          desde: '2026-07-06', hasta: '2026-07-06' }).expect(200)).body,
        (await auth(request(http).post('/disponibilidad/validar')).send({ ...base,
          fechaLocal: '2026-07-06', horaInicio: '10:30' }).expect(200)).body,
      ];
      await db.query('UPDATE servicios SET activo=0 WHERE id=?', [a.servicios[0]]);
      cuerpos.push((await auth(request(http).get('/disponibilidad/citas-afectadas'))
        .query({ desde: '2026-07-06', hasta: '2026-07-06' }).expect(200)).body);
      // Las respuestas solo transportan estado operativo; tampoco exponen secretos en errores.
      for (const cuerpo of cuerpos) {
        expect(JSON.stringify(cuerpo)).not.toMatch(/CLIENTE-PRIVADO-T083|FOLIO-PRIVADO-T083|titular_hash|titularHash|password_hash|stack|SELECT/i);
        expect(JSON.stringify(cuerpo)).not.toContain(hash);
        expect(JSON.stringify(cuerpo)).not.toContain(tokens.admin);
      }
      const ajeno = await auth(request(http).get('/disponibilidad'))
        .query({ ...base, sucursalId: b.sucursales[0],
          desde: '2026-07-06', hasta: '2026-07-06' }).expect(404);
      const inexistente = await auth(request(http).get('/disponibilidad'))
        .query({ ...base, sucursalId: 2147483647,
          desde: '2026-07-06', hasta: '2026-07-06' }).expect(404);
      expect(ajeno.body).toEqual(inexistente.body);
      const eventos = await db.query(`SELECT accion,valores_antes,valores_despues
        FROM eventos_auditoria WHERE negocio_id=? AND accion='configuracion_agenda_modificada'`,
      [a.id]);
      expect(eventos).toHaveLength(1);
      expect(JSON.stringify(eventos)).not.toMatch(/CLIENTE-PRIVADO-T083|FOLIO-PRIVADO-T083|titular_hash|titularHash|password_hash|token|SELECT/i);
      expect(JSON.stringify(eventos)).not.toContain(hash);
      expect(JSON.stringify(eventos)).not.toContain(tokens.admin);
    });
  });

  it('valida sin escribir, respeta roles/negocios y distingue vacío de error', async () => {
    await escenario(async ({ app, db, a, b, tokens, otroPerfil }) => {
      const http = app.getHttpServer();
      const cuerpo = { personalId: a.personalId, sucursalId: a.sucursales[0],
        servicioId: a.servicios[0], fechaLocal: '2026-07-06', horaInicio: '10:30' };
      const query = { personalId: a.personalId, sucursalId: a.sucursales[0],
        servicioId: a.servicios[0], desde: cuerpo.fechaLocal, hasta: cuerpo.fechaLocal };
      const validar = (token: string, datos: Record<string, unknown> = cuerpo) =>
        request(http).post('/disponibilidad/validar')
          .auth(token, { type: 'bearer' }).send(datos);
      const leer = (token: string, datos: Record<string, unknown> = query) =>
        request(http).get('/disponibilidad').auth(token, { type: 'bearer' }).query(datos);
      await request(http).post('/disponibilidad/validar').send(cuerpo).expect(401);
      for (const rol of ['admin', 'recepcion', 'profesional']) {
        const respuesta = await validar(tokens[rol]).expect(200);
        expect(respuesta.body).toMatchObject({ valido: true,
          finUtc: expect.any(String), motivos: [] });
      }
      await validar(tokens.superadmin).expect(403);
      await leer(tokens.superadmin).expect(403);
      await request(http).get('/disponibilidad/configuracion')
        .auth(tokens.recepcion, { type: 'bearer' }).expect(403);
      await validar(tokens.profesional, { ...cuerpo, personalId: otroPerfil }).expect(403);
      await validar(tokens.profesional, { ...cuerpo, personalId: b.personalId }).expect(404);
      await validar(tokens.ajeno).expect(404);
      await validar(tokens.admin, { ...cuerpo, sucursalId: b.sucursales[0] }).expect(404);
      for (const malo of [{ ...cuerpo, apartadoId: 1 },
        { ...cuerpo, personalId: '1' }, { ...cuerpo, horaInicio: '25:00' },
        { ...cuerpo, fechaLocal: '2026-02-30' }]) {
        await validar(tokens.admin, malo).expect(400);
      }
      await leer(tokens.admin, { ...query, hasta: '2026-08-06' }).expect(400);
      const antes = await Promise.all(['citas', 'bloqueos_temporales'].map(async (tabla) =>
        Number((await db.query(`SELECT COUNT(*) total FROM ${tabla}`))[0].total)));
      await validar(tokens.admin, { ...cuerpo, modalidad: 'manual' }).expect(200);
      await validar(tokens.admin).expect(200);
      const despues = await Promise.all(['citas', 'bloqueos_temporales'].map(async (tabla) =>
        Number((await db.query(`SELECT COUNT(*) total FROM ${tabla}`))[0].total)));
      expect(despues).toEqual(antes);
      const vacio = await leer(tokens.admin, { ...query, desde: '2026-07-07',
        hasta: '2026-07-07' }).expect(200);
      expect(vacio.body.ranuras).toEqual([]);
      // Una cita que ocupa toda la atención produce un 200 vacío, no un 503.
      await db.query(`INSERT INTO citas
        (negocio_id,personal_id,sucursal_id,servicio_id,cliente_id,
        inicio_utc,fin_utc,zona_horaria_reserva,estado,folio,origen)
        SELECT ?,?,?,?,id,'2026-07-06 15:00:00','2026-07-06 19:00:00',
          'America/Chihuahua','confirmada','T062-LLENO','manual'
        FROM clientes WHERE negocio_id=? LIMIT 1`,
      [a.id, a.personalId, a.sucursales[0], a.servicios[0], a.id]);
      expect((await leer(tokens.admin).expect(200)).body.ranuras).toEqual([]);
      expect((await validar(tokens.admin).expect(200)).body).toMatchObject({
        valido: false, motivos: expect.arrayContaining(['ocupado']) });
      await db.query("DELETE FROM citas WHERE folio='T062-LLENO'");
      await db.query('UPDATE servicios SET activo=0 WHERE id=?', [a.servicios[0]]);
      expect((await validar(tokens.admin).expect(200)).body).toMatchObject({
        valido: false, motivos: expect.arrayContaining([expect.any(String)]) });
      expect((await leer(tokens.admin).expect(200)).body.ranuras).toEqual([]);
      await db.query('UPDATE servicios SET activo=1 WHERE id=?', [a.servicios[0]]);
      // El rechazo por hora local ambigua sucede después de leer la zona autorizada.
      await db.query(`UPDATE sucursales SET zona_horaria='America/New_York'
        WHERE id=?`, [a.sucursales[0]]);
      await validar(tokens.admin, { ...cuerpo, fechaLocal: '2026-11-01',
        horaInicio: '01:30' }).expect(400);
      await db.query(`UPDATE sucursales SET zona_horaria='America/Chihuahua'
        WHERE id=?`, [a.sucursales[0]]);
      expect(JSON.stringify((await validar(tokens.admin).expect(200)).body))
        .not.toMatch(/clienteId|titularHash|apartadoId|SELECT|QueryFailedError/);
    });
  });

  it('mantiene una sesión abierta durante la gracia y niega acceso en los límites', async () => {
    await escenario(async ({ app, db, reloj, a, tokens, sesionAdmin }) => {
      const query = { personalId: a.personalId, sucursalId: a.sucursales[0],
        servicioId: a.servicios[0], desde: '2026-07-06', hasta: '2026-07-06' };
      let tokenActual = tokens.admin;
      let sesionActual = sesionAdmin;
      const renovarSesion = async () => {
        const usuarioId = Number((await db.query('SELECT usuario_id id FROM sesiones WHERE id=?',
          [sesionAdmin]))[0].id);
        const sesion = await app.get(SesionesService).crear(usuarioId, reloj.ahora());
        sesionActual = sesion.id;
        tokenActual = app.get(JwtService).sign({ sub: usuarioId, sesionId: sesion.id,
          rol: Rol.ADMIN_NEGOCIO, negocioId: a.id });
      };
      const leer = () => request(app.getHttpServer()).get('/disponibilidad')
        .auth(tokenActual, { type: 'bearer' }).query(query);
      await db.query(`UPDATE licencias SET suspension_solicitada_en='2026-07-06 16:07:00',
        bloqueo_programado_en='2026-07-08 16:07:00' WHERE negocio_id=?`, [a.id]);
      reloj.fijar(new Date('2026-07-08T15:00:00Z'));
      await renovarSesion();
      reloj.fijar(new Date('2026-07-08T16:06:59.999Z'));
      await leer().expect(200);
      reloj.avanzar(1);
      await leer().expect(401);
      reloj.avanzar(1);
      await leer().expect(401);
      await db.query(`UPDATE licencias SET suspension_solicitada_en=NULL,
        bloqueo_programado_en=NULL, vence_en='2026-07-09 04:00:00'
        WHERE negocio_id=?`, [a.id]);
      reloj.fijar(new Date('2026-07-09T03:59:00Z'));
      await renovarSesion();
      reloj.fijar(new Date('2026-07-09T04:00:00Z'));
      await leer().expect(401);
      await db.query(`UPDATE licencias SET vence_en='2027-01-01' WHERE negocio_id=?`, [a.id]);
      await db.query(`UPDATE usuarios SET activo=0 WHERE id=(SELECT usuario_id
        FROM sesiones WHERE id=?)`, [sesionActual]);
      await leer().expect(401);
      await db.query(`UPDATE usuarios SET activo=1 WHERE id=(SELECT usuario_id
        FROM sesiones WHERE id=?)`, [sesionActual]);
      await db.query('UPDATE sesiones SET revocada_en=? WHERE id=?',
        [reloj.ahora(), sesionActual]);
      await leer().expect(401);
    });
  });

  it('traduce indisponibilidad de fuente y fallo inesperado sin ocultarlos como vacío', async () => {
    await escenario(async ({ app, db, a, tokens }) => {
      const motor = app.get(MotorDisponibilidadService);
      const config = app.get(ConfiguracionAgendaService);
      const query = { personalId: a.personalId, sucursalId: a.sucursales[0],
        servicioId: a.servicios[0], desde: '2026-07-06', hasta: '2026-07-06' };
      const leer = () => request(app.getHttpServer()).get('/disponibilidad')
        .auth(tokens.admin, { type: 'bearer' }).query(query);
      const errorBd = new QueryFailedError('SELECT secreto FROM clientes', [],
        Object.assign(new Error('conexión perdida'), { code: 'ECONNRESET' }));
      const temporal = jest.spyOn(motor, 'consultar').mockRejectedValueOnce(errorBd);
      const respuesta503 = await leer().expect(503);
      expect(JSON.stringify(respuesta503.body)).not.toMatch(/secreto|clientes|ECONNRESET|ranuras|stack/);
      temporal.mockRestore();
      const inesperado = jest.spyOn(motor, 'consultar')
        .mockRejectedValueOnce(new Error('detalle privado del motor'));
      const respuesta500 = await leer().expect(500);
      expect(JSON.stringify(respuesta500.body)).not.toMatch(/detalle privado|ranuras|stack/);
      inesperado.mockRestore();
      const falloConfig = jest.spyOn(config, 'consultar').mockRejectedValueOnce(errorBd);
      await request(app.getHttpServer()).get('/disponibilidad/configuracion')
        .auth(tokens.admin, { type: 'bearer' }).expect(503);
      falloConfig.mockRestore();
      const respuesta = await leer().expect(200);
      expect(respuesta.body.ranuras.length).toBeGreaterThan(0);
      expect(Number((await db.query('SELECT COUNT(*) total FROM citas'))[0].total)).toBe(0);
      expect(Number((await db.query('SELECT COUNT(*) total FROM bloqueos_temporales'))[0].total)).toBe(0);
    });
  });
});
