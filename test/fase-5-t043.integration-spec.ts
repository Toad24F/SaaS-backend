import { Rol } from '../src/auth/enums/rol.enum';
import { Cliente } from '../src/disponibilidad/entities/cliente.entity';
import { conBaseOperativa } from './support/operacion-fase-5';
import { crearClientesOperativos } from './support/clientes-operativos';

describe('M4-T043: elección explícita de cliente existente', () => {
  it('resuelve exactamente el ID propio con el manager del escritor, nunca por teléfono', async () => {
    await conBaseOperativa(async (db, segunda) => {
      const f = await crearClientesOperativos(db, segunda);
      const propias = await db.getRepository(Cliente).findBy({ negocioId: f.negocios[0].id });
      const ajena = await db.getRepository(Cliente).findOneByOrFail({ negocioId: f.negocios[1].id });
      expect(propias[0].telefono).toBe(propias[1].telefono);
      for (const rol of [Rol.ADMIN_NEGOCIO, Rol.RECEPCIONISTA]) {
        await db.transaction('READ COMMITTED', async (manager) => {
          for (const ficha of propias) {
            const elegida = await f.clientes.resolverExistenteEnTransaccion(manager, f.identidad(rol), String(ficha.id));
            expect(elegida).toMatchObject({ id: ficha.id, nombreCompleto: ficha.nombreCompleto, telefono: ficha.telefono });
          }
          // Igual teléfono no autoriza un ID ajeno ni permite suplir una selección ausente.
          for (const id of [String(ajena.id), '999999']) {
            await expect(f.clientes.resolverExistenteEnTransaccion(manager, f.identidad(rol), id)).rejects.toMatchObject({ status: 404 });
          }
          for (const id of [undefined, { telefono: propias[0].telefono }, '01']) {
            await expect(f.clientes.resolverExistenteEnTransaccion(manager, f.identidad(rol), id)).rejects.toMatchObject({ status: 400 });
          }
        });
      }
    });
  });

  it('relee permisos y sesión y rechaza managers sin transacción activa', async () => {
    await conBaseOperativa(async (db, segunda) => {
      const f = await crearClientesOperativos(db, segunda);
      const ficha = await db.getRepository(Cliente).findOneByOrFail({ negocioId: f.negocios[0].id });
      await db.transaction(async (manager) => {
        await expect(f.clientes.resolverExistenteEnTransaccion(manager, f.identidad(Rol.PROFESIONAL), String(ficha.id))).rejects.toMatchObject({ status: 403 });
        const actor = f.identidad(Rol.RECEPCIONISTA);
        await manager.query('UPDATE sesiones SET revocada_en=? WHERE id=?', [f.reloj.ahora(), actor.sesionId]);
        await expect(f.clientes.resolverExistenteEnTransaccion(manager, actor, String(ficha.id))).rejects.toMatchObject({ status: 401 });
      });
      await expect(f.clientes.resolverExistenteEnTransaccion(db.manager, f.identidad(Rol.ADMIN_NEGOCIO), String(ficha.id))).rejects.toMatchObject({ status: 500 });
    });
  });
});
