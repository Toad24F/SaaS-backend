import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { Rol } from '../src/auth/enums/rol.enum';
import { Cliente } from '../src/disponibilidad/entities/cliente.entity';
import { Cita } from '../src/disponibilidad/entities/cita.entity';
import { UnionCliente } from '../src/clientes/entities/union-cliente.entity';
import { filasManuales, type EscenarioManualHttp } from './support/cita-manual';
import { conAgendaHttp } from './support/agenda-http';
import { enfrentarEscritores } from './support/carrera-escritores-m4';

async function escenario(f: EscenarioManualHttp) {
  const repo = f.db.getRepository(Cliente);
  const negocioId = f.negocios[0].id;
  const [origen, destino] = await repo.find({ where: { negocioId }, order: { id: 'ASC' } });
  const ajena = await repo.findOneByOrFail({ negocioId: f.negocios[1].id });
  await repo.update(origen.id, { nombreCompleto: 'Ficha original', email: 'origen@example.test' });
  await repo.update(destino.id, { nombreCompleto: 'María Peña', email: 'destino@example.test' });
  // Cada ficha tiene citas antes de la unión; se conservan las citas ya ligadas al destino.
  const cita = await f.db.getRepository(Cita).findOneOrFail({ where: { negocioId, clienteId: origen.id }, order: { id: 'DESC' } });
  await f.db.getRepository(Cita).update(cita.id, { clienteId: destino.id });
  const datosPropuestos = { nombreCompleto: ' MARI\u0301A  PEN\u0303A ' };
  const entrada = { destinoId: destino.id, versionOrigen: origen.version, versionDestino: destino.version, clave: randomUUID(), datosPropuestos };
  const cabecera = (rol = Rol.ADMIN_NEGOCIO) => `Bearer ${f.token(f.actor(rol).id)}`;
  const editar = (body: unknown, id = origen.id, auth = cabecera(), app = f.app) =>
    request(app.getHttpServer()).patch(`/clientes/${id}`).set('Authorization', auth).send(body);
  const unir = (body: unknown = entrada, id = origen.id, auth = cabecera(), app = f.app) =>
    request(app.getHttpServer()).post(`/clientes/${id}/uniones`).set('Authorization', auth).send(body);
  const filas = async () => ({ ...(await filasManuales(f.db)),
    uniones: await f.db.getRepository(UnionCliente).find({ order: { id: 'ASC' } }) });
  return { origen, destino, ajena, negocioId, datosPropuestos, entrada, cabecera, editar, unir, filas };
}

describe('M5-T018–T023: edición y unión explícita de clientes', () => {
  const anterior = process.env.CITAS_MANUALES_HMAC_SECRET;
  beforeAll(() => { process.env.CITAS_MANUALES_HMAC_SECRET = 'secreto-aislado-uniones-de-prueba-modulo-cinco'; });
  afterAll(() => {
    if (anterior === undefined) delete process.env.CITAS_MANUALES_HMAC_SECRET;
    else process.env.CITAS_MANUALES_HMAC_SECRET = anterior;
  });

  it.each([Rol.ADMIN_NEGOCIO, Rol.RECEPCIONISTA])('T018 %s recibe solo la ficha destino mínima sin escribir', async rol => {
    await conAgendaHttp(async f => {
      const s = await escenario(f);
      const antes = await s.filas();
      const choque = await s.editar({ version: s.origen.version, ...s.datosPropuestos }, s.origen.id, s.cabecera(rol)).expect(409);
      expect(choque.headers['cache-control']).toBe('no-store');
      expect(choque.body).toEqual({ statusCode: 409, message: expect.any(String), codigo: 'cliente_coincidente',
        destino: { id: s.destino.id, nombreCompleto: 'María Peña', version: s.destino.version } });
      // Regresar del aviso equivale a no enviar el POST: las filas permanecen completas.
      expect(await s.filas()).toEqual(antes);
    });
  });

  it('T018 acota la búsqueda a identidades activas del negocio y no elige entre varios destinos', async () => {
    await conAgendaHttp(async f => {
      const s = await escenario(f);
      const repo = f.db.getRepository(Cliente);
      // Reproducir un grupo previo al índice final en esta base desechable.
      await f.db.query('ALTER TABLE clientes DROP INDEX uq_clientes_identidad_activa');
      const duplicado = await repo.save({ negocioId: s.negocioId, nombreCompleto: 'MARÍA PEÑA',
        nombreNormalizado: Buffer.from('maría peña'), telefono: s.destino.telefono });
      const antes = await s.filas();
      const r = await s.editar({ version: s.origen.version, ...s.datosPropuestos }).expect(409);
      expect(r.body).not.toHaveProperty('destino');
      await s.unir().expect(409);
      expect(await s.filas()).toEqual(antes);
      await repo.update(duplicado.id, { fusionadoEnId: s.destino.id });
      await repo.update(s.ajena.id, { nombreCompleto: 'Exclusiva ajena', telefono: s.origen.telefono });
      const editada = await s.editar({ version: s.origen.version, nombreCompleto: 'Exclusiva ajena' }).expect(200);
      expect(editada.body).toMatchObject({ version: s.origen.version + 1, nombreCompleto: 'Exclusiva ajena' });
      expect((await repo.findOneByOrFail({ id: s.origen.id })).nombreNormalizado).toEqual(Buffer.from('exclusiva ajena'));
    });
  });

  it('T019/T022 deniega carga inválida, auto-unión, versiones obsoletas, fichas ajenas, absorbidas y no coincidentes', async () => {
    await conAgendaHttp(async f => {
      const s = await escenario(f);
      const base = s.entrada;
      const antes = await s.filas();
      await s.editar({ version: s.origen.version, ...s.datosPropuestos }, s.origen.id, s.cabecera(Rol.PROFESIONAL)).expect(403);
      await s.unir(base, s.origen.id, s.cabecera(Rol.PROFESIONAL)).expect(403);
      await s.unir(base, s.origen.id, `Bearer ${f.token(f.superadmin.id)}`).expect(403);
      await request(f.http).post(`/clientes/${s.origen.id}/uniones`).send(base).expect(401);
      for (const invalida of [{ destinoId: s.origen.id }, { clave: 'corta' }, { versionOrigen: '1' },
        { datosPropuestos: { id: 1 } }, { negocioId: s.negocioId }]) {
        await s.unir({ ...base, ...invalida }).expect(400);
      }
      const ajena = await s.unir({ ...base, destinoId: s.ajena.id }).expect(404);
      expect((await s.unir({ ...base, destinoId: 999999 }).expect(404)).body).toEqual(ajena.body);
      await s.unir(base, s.ajena.id).expect(404);
      for (const invalida of [{ versionOrigen: base.versionOrigen + 1 }, { versionDestino: base.versionDestino + 1 },
        { datosPropuestos: { nombreCompleto: 'Otro nombre' } }, { datosPropuestos: {} }]) {
        const estado = 'datosPropuestos' in invalida && Object.keys(invalida.datosPropuestos!).length === 0 ? 400 : 409;
        await s.unir({ ...base, ...invalida }).expect(estado);
      }
      expect(await s.filas()).toEqual(antes);
      await f.db.getRepository(Cliente).update(s.destino.id, { fusionadoEnId: s.origen.id });
      const absorcion = await s.filas();
      await s.unir().expect(409);
      expect(await s.filas()).toEqual(absorcion);
    });
  });

  it.each([Rol.ADMIN_NEGOCIO, Rol.RECEPCIONISTA])('T020–T022 %s mueve citas, audita una vez y recupera la misma unión', async rol => {
    await conAgendaHttp(async f => {
      const s = await escenario(f);
      const actor = f.actor(rol);
      const auth = s.cabecera(rol);
      await s.editar({ version: s.origen.version, ...s.datosPropuestos }, s.origen.id, auth).expect(409);
      const antes = await s.filas();
      const r = await s.unir(s.entrada, s.origen.id, auth).expect(200);
      expect(r.headers['cache-control']).toBe('no-store');
      expect(r.body).toEqual({ id: expect.any(String), origenId: s.origen.id, destinoId: s.destino.id,
        versionOrigen: s.origen.version + 1, versionDestino: s.destino.version + 1, ocurridoEn: f.reloj.ahora().toISOString() });
      const despues = await s.filas();
      const citaIds = antes.citas.filter(c => c.clienteId === s.origen.id).map(c => c.id);
      expect(citaIds.length).toBeGreaterThan(0);
      expect(despues.citas).toEqual(antes.citas.map(c => c.clienteId === s.origen.id
        ? { ...c, clienteId: s.destino.id } : c));
      expect(despues.clientes).toEqual(antes.clientes.map(c => c.id === s.origen.id
        ? { ...c, fusionadoEnId: s.destino.id, version: c.version + 1 }
        : c.id === s.destino.id ? { ...c, version: c.version + 1 } : c));
      expect(despues.eventos).toEqual(antes.eventos);
      expect(despues.uniones).toEqual([expect.objectContaining({ actorUsuarioId: actor.id, origenId: s.origen.id,
        destinoId: s.destino.id, clave: s.entrada.clave, contenidoHash: expect.stringMatching(/^[a-f0-9]{64}$/) })]);
      expect(despues.auditoria).toHaveLength(antes.auditoria.length + 1);
      const evento = despues.auditoria.at(-1);
      expect(evento).toMatchObject({ actorUsuarioId: actor.id, accion: 'cliente_unido', recursoTipo: 'cliente',
        recursoId: s.origen.id, ocurridoEn: f.reloj.ahora(),
        valoresDespues: { unionId: r.body.id, destinoId: s.destino.id, motivo: 'coincidencia_identidad', citaIds } });
      expect(JSON.stringify(evento)).not.toMatch(/@example|MARI|6141234567|contenidoHash/);
      expect(JSON.stringify(evento)).not.toContain(s.entrada.clave);
      expect((await s.unir(s.entrada, s.origen.id, auth).expect(200)).body).toEqual(r.body);
      await s.unir({ ...s.entrada, datosPropuestos: { nombreCompleto: 'María Peña' } }, s.origen.id, auth).expect(409);
      await s.unir({ destinoId: s.origen.id, versionOrigen: r.body.versionDestino,
        versionDestino: r.body.versionOrigen, clave: randomUUID() }, s.destino.id, auth).expect(409);
      expect(await s.filas()).toEqual(despues);
      // Un cambio posterior del destino no altera la respuesta durable de la unión.
      await s.editar({ version: r.body.versionDestino, nombreCompleto: 'Destino actualizado' }, s.destino.id, auth).expect(200);
      const actual = await s.filas();
      expect((await s.unir(s.entrada, s.origen.id, auth).expect(200)).body).toEqual(r.body);
      expect(await s.filas()).toEqual(actual);
    });
  });

  it('T023 revierte citas, versiones y operación si falla la auditoría y permite reintentar', async () => {
    await conAgendaHttp(async f => {
      const s = await escenario(f);
      const antes = await s.filas();
      // La auditoría se inserta al final, cuando las demás escrituras ya ocurrieron.
      await f.db.query(`CREATE TRIGGER fallo_union_m5 BEFORE INSERT ON eventos_auditoria
        FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='fallo controlado de union'`);
      try {
        const error = await s.unir().expect(500);
        expect(JSON.stringify(error.body)).not.toContain('fallo controlado');
        expect(await s.filas()).toEqual(antes);
      } finally {
        await f.db.query('DROP TRIGGER fallo_union_m5');
      }
      await s.unir().expect(200);
      expect((await s.filas()).uniones).toHaveLength(1);
    });
  });

  it.each(['editar', 'unir'])('T023 espera en negocio y %s confirma primero con dos conexiones reales', async primero => {
    await conAgendaHttp(async f => {
      const s = await escenario(f);
      const antes = await s.filas();
      const editar = (app = f.app) => s.editar({ version: s.destino.version, nombreCompleto: 'Destino cambiado' },
        s.destino.id, s.cabecera(Rol.RECEPCIONISTA), app).then(r => r);
      const unir = (app = f.app) => s.unir(s.entrada, s.origen.id, s.cabecera(), app).then(r => r);
      const orden = primero === 'editar' ? [editar, unir] : [unir, editar];
      const r = await enfrentarEscritores(f, orden[0], orden[1], { tablaPausa: 'clientes', tablaEspera: 'negocios' });
      expect(r.primero).toMatchObject({ status: 'fulfilled', value: { status: 200 } });
      expect(r.segundo).toMatchObject({ status: 'fulfilled', value: { status: 409 } });
      const despues = await s.filas();
      expect(despues.citas).toEqual(antes.citas.map(c => primero === 'unir' && c.clienteId === s.origen.id
        ? { ...c, clienteId: s.destino.id } : c));
      expect(despues.uniones).toHaveLength(Number(primero === 'unir'));
      expect(despues.auditoria).toHaveLength(antes.auditoria.length + 1);
      expect(despues.clientes.find(c => c.id === s.origen.id)?.fusionadoEnId).toBe(primero === 'unir' ? s.destino.id : null);
    });
  }, 120000);
});
