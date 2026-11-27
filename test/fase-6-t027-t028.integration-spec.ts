import { Cliente } from '../src/disponibilidad/entities/cliente.entity';
import { IdentidadActivaClientes1760000053000 } from '../src/database/migrations/1760000053000-IdentidadActivaClientes';
import { conAgendaHttp } from './support/agenda-http';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { Rol } from '../src/auth/enums/rol.enum';

// Cada caso crea y destruye un esquema MariaDB test; nunca toca datos operativos.
describe('M5-T027/T028: unicidad de identidad activa', () => {
  it('rechaza grupos heredados antes de crear el índice', async () => {
    await conAgendaHttp(async f => {
      const repo = f.db.getRepository(Cliente);
      const negocioId = f.negocios[0].id;
      const [base] = await repo.find({ where: { negocioId }, order: { id: 'ASC' } });
      await repo.update(base.id, { nombreNormalizado: Buffer.from('ana prueba') });
      await f.db.query('ALTER TABLE clientes DROP INDEX uq_clientes_identidad_activa, DROP COLUMN nombre_activo');
      await f.db.query('INSERT INTO clientes(negocio_id,nombre_completo,nombre_normalizado,telefono) VALUES (?,?,?,?)',
        [negocioId, 'ANA PRUEBA', Buffer.from('ana prueba'), base.telefono]);
      const runner = f.db.createQueryRunner();
      try {
        await runner.connect();
        await expect(new IdentidadActivaClientes1760000053000().up(runner)).rejects.toThrow(/duplicad/i);
        const [indice] = await f.db.query("SHOW INDEX FROM clientes WHERE Key_name='uq_clientes_identidad_activa'");
        expect(indice).toBeUndefined();
      } finally { await runner.release(); }
    });
  });

  it('rechaza duplicado activo y conserva una ficha absorbida con el mismo nombre', async () => {
    await conAgendaHttp(async f => {
      const repo = f.db.getRepository(Cliente);
      const negocioId = f.negocios[0].id;
      const [base] = await repo.find({ where: { negocioId }, order: { id: 'ASC' } });
      await repo.update(base.id, { nombreCompleto: 'Ana', nombreNormalizado: Buffer.from('ana') });
      await expect(repo.save({ negocioId, nombreCompleto: 'ANA', nombreNormalizado: Buffer.from('ana'), telefono: base.telefono }))
        .rejects.toThrow();
      const absorbida = await repo.save({ negocioId, nombreCompleto: 'ANA', nombreNormalizado: Buffer.from('ana'),
        telefono: base.telefono, fusionadoEnId: base.id });
      expect(absorbida.id).toBeGreaterThan(0);
      const distinta = await repo.save({ negocioId, nombreCompleto: 'Ána', nombreNormalizado: Buffer.from('ána'), telefono: base.telefono });
      expect(distinta.id).toBeGreaterThan(0);
      await expect(repo.save({ negocioId, nombreCompleto: 'Sin clave', telefono: base.telefono })).rejects.toThrow();
    });
  });

  it('concilia expresamente un grupo heredado y después permite crear el índice', async () => {
    const secreto = process.env.CITAS_MANUALES_HMAC_SECRET;
    process.env.CITAS_MANUALES_HMAC_SECRET = 'secreto-test-conciliacion-fase-seis-2026';
    try {
      await conAgendaHttp(async f => {
        const negocioId = f.negocios[0].id;
        const [destino] = await f.db.getRepository(Cliente).find({ where: { negocioId }, order: { id: 'ASC' } });
        await f.db.query('ALTER TABLE clientes DROP INDEX uq_clientes_identidad_activa, DROP CONSTRAINT chk_clientes_clave_activa, DROP COLUMN nombre_activo');
        const creado = await f.db.query('INSERT INTO clientes(negocio_id,nombre_completo,nombre_normalizado,telefono) VALUES (?,?,?,?)',
          [negocioId, destino.nombreCompleto, Buffer.from(destino.nombreCompleto.toLowerCase()), destino.telefono]);
        const origenId = Number(creado.insertId);
        const auth = `Bearer ${f.token(f.actor(Rol.ADMIN_NEGOCIO).id)}`;
        const grupo = await request(f.http).get('/clientes').set('Authorization', auth).expect(200);
        expect(grupo.body.clientes.map((fila: { id: number }) => fila.id)).toEqual(expect.arrayContaining([origenId, destino.id]));
        const aceptada = await request(f.http).post(`/clientes/${origenId}/uniones`).set('Authorization', auth)
          .send({ destinoId: destino.id, versionOrigen: 1, versionDestino: destino.version, clave: randomUUID() }).expect(200);
        expect(aceptada.body).toMatchObject({ origenId, destinoId: destino.id });
        expect((await f.db.query('SELECT fusionado_en_id FROM clientes WHERE id=?', [origenId]))[0].fusionado_en_id).toBe(destino.id);
        const runner = f.db.createQueryRunner();
        try { await runner.connect(); await new IdentidadActivaClientes1760000053000().up(runner); }
        finally { await runner.release(); }
      });
    } finally {
      if (secreto === undefined) delete process.env.CITAS_MANUALES_HMAC_SECRET;
      else process.env.CITAS_MANUALES_HMAC_SECRET = secreto;
    }
  });
});
