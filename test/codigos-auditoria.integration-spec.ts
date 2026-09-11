import { createHash, randomUUID } from 'node:crypto';
import type { DataSource, EntityManager } from 'typeorm';
import { AuditoriaService } from '../src/auditoria/auditoria.service';
import { EventoAuditoria } from '../src/auditoria/entities/evento-auditoria.entity';
import { CodigosService } from '../src/codigos/codigos.service';
import {
  CodigoAcceso,
  PropositoCodigoAcceso,
} from '../src/codigos/entities/codigo-acceso.entity';
import { Negocio } from '../src/negocios/entities/negocio.entity';
import { Rol } from '../src/auth/enums/rol.enum';
import { Usuario } from '../src/usuarios/entities/usuario.entity';
import { conBaseMigrada } from './support/mariadb';

async function prepararActores(dataSource: DataSource) {
  const negocio = await dataSource.getRepository(Negocio).save(
    Object.assign(new Negocio(), {
      nombre: 'Negocio códigos',
      slug: `negocio-${randomUUID()}`,
      emailContacto: `${randomUUID()}@example.test`,
      telefonoContacto: null,
      activadoEn: null,
    }),
  );
  const actor = await dataSource.getRepository(Usuario).save(
    Object.assign(new Usuario(), {
      negocioId: null,
      negocio: null,
      nombre: null,
      email: `${randomUUID()}@example.test`,
      passwordHash: null,
      rol: Rol.SUPERADMIN,
      activo: true,
      activadoEn: null,
    }),
  );
  const crearPendiente = (rol: Rol) => dataSource.getRepository(Usuario).save(
    Object.assign(new Usuario(), {
      negocioId: negocio.id,
      negocio,
      nombre: null,
      email: `${randomUUID()}@example.test`,
      passwordHash: null,
      rol,
      activo: true,
      activadoEn: null,
    }),
  );
  return {
    negocio,
    actor,
    administrador: await crearPendiente(Rol.ADMIN_NEGOCIO),
    recepcionista: await crearPendiente(Rol.RECEPCIONISTA),
  };
}

describe('Auditoría y códigos transaccionales (T23–T25)', () => {
  it('revierte la operación cuando falla el registro de auditoría', async () => {
    await conBaseMigrada(async (primera) => {
      const { negocio } = await prepararActores(primera);
      const auditoria = new AuditoriaService();

      await expect(primera.transaction(async (manager) => {
        await manager.update(Negocio, negocio.id, { nombre: 'No debe persistir' });
        await auditoria.registrar(manager, {
          operacionId: randomUUID(),
          actorUsuarioId: 2147483647,
          negocioId: negocio.id,
          usuarioId: null,
          licenciaId: null,
          accion: 'cambio_forzado',
          valoresAntes: { nombre: negocio.nombre },
          valoresDespues: { nombre: 'No debe persistir' },
        });
      })).rejects.toBeDefined();

      await expect(primera.getRepository(Negocio).findOneByOrFail({ id: negocio.id }))
        .resolves.toMatchObject({ nombre: negocio.nombre });
    });
  });

  it('emite, valida y consume códigos sin persistir el valor utilizable', async () => {
    await conBaseMigrada(async (primera) => {
      const { negocio, actor, administrador, recepcionista } =
        await prepararActores(primera);
      const servicio = new CodigosService(new AuditoriaService());
      const ahora = new Date('2026-09-11T18:00:00.000Z');
      const emitido = await primera.transaction((manager) => servicio.emitir(manager, {
        negocioId: negocio.id,
        usuarioId: administrador.id,
        emisorUsuarioId: actor.id,
        proposito: PropositoCodigoAcceso.RECUPERACION,
        ahora,
      }));

      expect(emitido).toEqual({
        codigo: expect.any(String),
        expiraEn: new Date('2026-09-11T18:30:00.000Z'),
      });
      expect(emitido.codigo.length).toBeGreaterThanOrEqual(32);
      const [persistido] = await primera.query(
        'SELECT codigo_hash FROM codigos_acceso WHERE usuario_id = ?',
        [administrador.id],
      );
      expect(persistido.codigo_hash).toBe(
        createHash('sha256').update(emitido.codigo).digest('hex'),
      );
      expect(persistido.codigo_hash).not.toContain(emitido.codigo);
      const [evento] = await primera.getRepository(EventoAuditoria).findBy({
        usuarioId: administrador.id,
      });
      expect(JSON.stringify(evento)).not.toContain(emitido.codigo);
      expect(JSON.stringify(evento)).not.toContain(persistido.codigo_hash);

      await expect(servicio.consumir(primera, {
        codigo: emitido.codigo,
        proposito: PropositoCodigoAcceso.ACTIVACION_ADMIN,
        ahora,
      }, async () => undefined)).rejects.toThrow('Código inválido o no disponible');
      await expect(servicio.consumir(primera, {
        codigo: emitido.codigo,
        proposito: PropositoCodigoAcceso.RECUPERACION,
        ahora: emitido.expiraEn,
      }, async () => undefined)).rejects.toThrow('Código inválido o no disponible');

      await primera.getRepository(CodigoAcceso).update(
        { usuarioId: administrador.id },
        { invalidadoEn: new Date('2026-09-11T18:10:00.000Z') },
      );
      await expect(servicio.consumir(primera, {
        codigo: emitido.codigo,
        proposito: PropositoCodigoAcceso.RECUPERACION,
        ahora: new Date('2026-09-11T18:20:00.000Z'),
      }, async () => undefined)).rejects.toThrow('Código inválido o no disponible');

      const activacion = await primera.transaction((manager) => servicio.emitir(manager, {
        negocioId: negocio.id,
        usuarioId: administrador.id,
        emisorUsuarioId: actor.id,
        proposito: PropositoCodigoAcceso.ACTIVACION_ADMIN,
        ahora,
      }));
      expect(activacion.expiraEn).toEqual(new Date('2026-09-13T18:00:00.000Z'));
      await servicio.consumir(primera, {
        codigo: activacion.codigo,
        proposito: PropositoCodigoAcceso.ACTIVACION_ADMIN,
        ahora,
      }, async (manager: EntityManager) => {
        await manager.update(Usuario, administrador.id, {
          nombre: 'Administrador activado',
          passwordHash: 'hash-seguro',
          activadoEn: new Date(administrador.creadoEn.getTime() + 1),
        });
      });
      await expect(servicio.consumir(primera, {
        codigo: activacion.codigo,
        proposito: PropositoCodigoAcceso.ACTIVACION_ADMIN,
        ahora,
      }, async () => undefined)).rejects.toThrow('Código inválido o no disponible');

      const conRollback = await primera.transaction((manager) => servicio.emitir(manager, {
        negocioId: negocio.id,
        usuarioId: recepcionista.id,
        emisorUsuarioId: actor.id,
        proposito: PropositoCodigoAcceso.ACTIVACION_RECEPCIONISTA,
        ahora,
      }));
      await expect(servicio.consumir(primera, {
        codigo: conRollback.codigo,
        proposito: PropositoCodigoAcceso.ACTIVACION_RECEPCIONISTA,
        ahora,
      }, async (manager) => {
        await manager.update(Usuario, recepcionista.id, {
          nombre: 'No persiste',
          passwordHash: 'hash-temporal',
          activadoEn: new Date(recepcionista.creadoEn.getTime() + 1),
        });
        throw new Error('operación posterior fallida');
      })).rejects.toThrow('operación posterior fallida');
      expect((await primera.getRepository(Usuario).findOneByOrFail({
        id: recepcionista.id,
      })).nombre).toBeNull();
      const codigoRollback = await primera.getRepository(CodigoAcceso)
        .createQueryBuilder('codigo')
        .addSelect('codigo.codigoHash')
        .where('codigo.codigoHash = :hash', {
          hash: createHash('sha256').update(conRollback.codigo).digest('hex'),
        })
        .getOneOrFail();
      expect(codigoRollback.consumidoEn).toBeNull();
    });
  });
});
