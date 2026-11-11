import request from 'supertest';
import { QueryFailedError } from 'typeorm';
import { Rol } from '../src/auth/enums/rol.enum';
import { Cliente } from '../src/disponibilidad/entities/cliente.entity';
import { Cita } from '../src/disponibilidad/entities/cita.entity';
import { ClientesService } from '../src/clientes/clientes.service';
import { conAgendaHttp } from './support/agenda-http';

describe('M4-T044–T047: directorio HTTP privado', () => {
  it.each([Rol.ADMIN_NEGOCIO, Rol.RECEPCIONISTA])('T044/T045 %s crea fichas compartidas, busca, pagina y consulta por ID', async (rol) => {
    await conAgendaHttp(async (f) => {
      const auth = `Bearer ${f.token(f.actor(rol).id)}`;
      const ids: number[] = [];
      for (const nombreCompleto of ['Persona uno', 'Persona dos']) {
        const alta = await request(f.http).post('/clientes').set('Authorization', auth)
          .send({ nombreCompleto, telefono: '+52 614-777-1234' }).expect(201);
        expect(alta.headers['cache-control']).toBe('no-store');
        expect(alta.body).toMatchObject({ nombreCompleto, telefono: '6147771234', version: 1 });
        ids.push(alta.body.id);
      }
      expect(new Set(ids).size).toBe(2);
      const listado = await request(f.http).get('/clientes').query({ busqueda: '6147771234', limite: '1' }).set('Authorization', auth).expect(200);
      expect(listado.body.clientes).toHaveLength(1);
      expect(listado.body.hayMas).toBe(true);
      expect(listado.headers['cache-control']).toBe('no-store');
      const segunda = await request(f.http).get('/clientes').query({ busqueda: '6147771234', pagina: '2', limite: '1' }).set('Authorization', auth).expect(200);
      expect(segunda.body.clientes[0].id).not.toBe(listado.body.clientes[0].id);
      const porNombre = await request(f.http).get('/clientes').query({ busqueda: 'Persona uno' }).set('Authorization', auth).expect(200);
      expect(porNombre.body.clientes.map((c: Cliente) => c.id)).toEqual([ids[0]]);
      for (const id of ids) {
        const ficha = await request(f.http).get(`/clientes/${id}`).set('Authorization', auth).expect(200);
        expect(ficha.body.id).toBe(id);
        expect(ficha.headers['cache-control']).toBe('no-store');
        const historial = await request(f.http).get(`/clientes/${id}/citas`).set('Authorization', auth).expect(200);
        expect(historial.body.citas).toEqual([]);
        expect(historial.headers['cache-control']).toBe('no-store');
      }
    });
  });

  it('T046 corrige ficha, conserva todas las citas y rechaza una versión antigua con 409', async () => {
    await conAgendaHttp(async (f) => {
      const auth = `Bearer ${f.token(f.actor(Rol.RECEPCIONISTA).id)}`;
      const citas = await f.db.getRepository(Cita).find();
      const cita = citas.find((c) => c.negocioId === f.negocios[0].id)!;
      const url = `/clientes/${cita.clienteId}`;
      const antes = await request(f.http).get(`${url}/citas`).query({ limite: '2' }).set('Authorization', auth).expect(200);
      expect(antes.body.citas).toHaveLength(2);
      expect(antes.body.hayMas).toBe(true);
      const corregida = await request(f.http).patch(url).set('Authorization', auth)
        .send({ version: 1, nombreCompleto: 'Contacto corregido', telefono: '6140000000' }).expect(200);
      expect(corregida.body.version).toBe(2);
      expect(corregida.headers['cache-control']).toBe('no-store');
      const obsoleta = await request(f.http).patch(url).set('Authorization', auth).send({ version: 1, nombreCompleto: 'Perdido' }).expect(409);
      expect(obsoleta.headers['cache-control']).toBe('no-store');
      expect(await f.db.getRepository(Cita).find()).toEqual(citas);
      const despues = await request(f.http).get(`${url}/citas`).query({ limite: '2' }).set('Authorization', auth).expect(200);
      expect(despues.body).toEqual(antes.body);
      expect((await f.db.getRepository(Cliente).findOneByOrFail({ id: cita.clienteId })).nombreCompleto).toBe('Contacto corregido');
    });
  });

  it('T047 oculta fichas ajenas/ausentes y deniega las cinco operaciones a Profesional y Superadmin', async () => {
    await conAgendaHttp(async (f) => {
      const antes = await f.db.getRepository(Cliente).find();
      const propia = antes.find((c) => c.negocioId === f.negocios[0].id)!;
      const ajena = antes.find((c) => c.negocioId === f.negocios[1].id)!;
      const auth = `Bearer ${f.token(f.actor(Rol.ADMIN_NEGOCIO).id)}`;
      for (const sufijo of ['', '/citas']) {
        const a = await request(f.http).get(`/clientes/${ajena.id}${sufijo}`).set('Authorization', auth).expect(404);
        const b = await request(f.http).get(`/clientes/999999${sufijo}`).set('Authorization', auth).expect(404);
        expect(a.body).toEqual(b.body);
      }
      const a = await request(f.http).patch(`/clientes/${ajena.id}`).set('Authorization', auth).send({ version: 1, nombreCompleto: 'Ajeno' }).expect(404);
      const b = await request(f.http).patch('/clientes/999999').set('Authorization', auth).send({ version: 1, nombreCompleto: 'Ajeno' }).expect(404);
      expect(a.body).toEqual(b.body);
      const lista = await request(f.http).get('/clientes').set('Authorization', auth).expect(200);
      expect(lista.body.clientes.every((c: Cliente) => c.negocioId === f.negocios[0].id)).toBe(true);
      // La misma respuesta por rol se exige tanto para fichas propias como ajenas o inexistentes.
      for (const u of f.actores.filter((u) => u.rol === Rol.PROFESIONAL || u.rol === Rol.SUPERADMIN)) {
        const cabecera = `Bearer ${f.token(u.id)}`;
        await request(f.http).get('/clientes').set('Authorization', cabecera).expect(403);
        await request(f.http).post('/clientes').set('Authorization', cabecera).send({ nombreCompleto: 'Denegado', telefono: '6141234567' }).expect(403);
        for (const id of [propia.id, ajena.id, 999999]) {
          for (const sufijo of ['', '/citas']) await request(f.http).get(`/clientes/${id}${sufijo}`).set('Authorization', cabecera).expect(403);
          await request(f.http).patch(`/clientes/${id}`).set('Authorization', cabecera).send({ version: 1, nombreCompleto: 'Denegado' }).expect(403);
        }
      }
      expect(await f.db.getRepository(Cliente).find()).toEqual(antes);
    });
  });

  it('T044 valida campos cerrados y protege las rutas anónimas con no-store', async () => {
    await conAgendaHttp(async (f) => {
      const auth = `Bearer ${f.token(f.actor(Rol.ADMIN_NEGOCIO).id)}`;
      for (const url of ['/clientes', '/clientes/1', '/clientes/1/citas']) {
        expect((await request(f.http).get(url).expect(401)).headers['cache-control']).toBe('no-store');
      }
      await request(f.http).post('/clientes').send({}).expect(401);
      await request(f.http).patch('/clientes/1').send({}).expect(401);
      for (const url of ['/clientes?negocioId=2', '/clientes/01', '/clientes/1?telefono=6141234567', '/clientes/1/citas?limite=101']) {
        expect((await request(f.http).get(url).set('Authorization', auth).expect(400)).headers['cache-control']).toBe('no-store');
      }
      for (const datos of [{ nombreCompleto: '', telefono: '6141234567' }, { nombreCompleto: 'Persona', telefono: 'abc' },
        { nombreCompleto: 'Persona', telefono: '6141234567', negocioId: 2 }]) {
        await request(f.http).post('/clientes').set('Authorization', auth).send(datos).expect(400);
      }
      await request(f.http).patch('/clientes/1').set('Authorization', auth).send({ nombreCompleto: 'Sin versión' }).expect(400);
      await request(f.http).get('/publico/clientes').expect(404);
    });
  });

  it.each([['ER_LOCK_WAIT_TIMEOUT', 503], ['ER_PARSE_ERROR', 500]] as const)('T044 distingue vacío de %s sin filtrar SQL', async (code, estado) => {
    await conAgendaHttp(async (f) => {
      const auth = `Bearer ${f.token(f.actor(Rol.ADMIN_NEGOCIO).id)}`;
      const vacia = await request(f.http).get('/clientes').query({ busqueda: 'Inexistente' }).set('Authorization', auth).expect(200);
      expect(vacia.body.clientes).toEqual([]);
      const servicio = f.app.get(ClientesService);
      // Se fuerza el fallo en la frontera del servicio; el filtro HTTP debe sanearlo sin devolver filas.
      const fallo = new QueryFailedError('SELECT secreto', ['6149999999'], Object.assign(new Error('secreto SQL'), { code }));
      const espia = jest.spyOn(servicio, 'listar').mockRejectedValueOnce(fallo);
      try {
        const r = await request(f.http).get('/clientes').set('Authorization', auth).expect(estado);
        expect(r.headers['cache-control']).toBe('no-store');
        expect(r.body).not.toHaveProperty('clientes');
        expect(JSON.stringify(r.body)).not.toMatch(/SELECT|secreto|6149999999|SQL/);
      } finally { espia.mockRestore(); }
    });
  });
});
