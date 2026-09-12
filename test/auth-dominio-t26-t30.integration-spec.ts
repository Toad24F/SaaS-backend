import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { AuditoriaService } from '../src/auditoria/auditoria.service';
import { LimiteIntentos } from '../src/auth/entities/limite-intentos.entity';
import { Sesion } from '../src/auth/entities/sesion.entity';
import { Rol } from '../src/auth/enums/rol.enum';
import { LimiteIntentosStorage } from '../src/auth/services/limite-intentos.storage';
import { SesionesService } from '../src/auth/services/sesiones.service';
import { CodigosService } from '../src/codigos/codigos.service';
import { PropositoCodigoAcceso } from '../src/codigos/entities/codigo-acceso.entity';
import { Licencia } from '../src/licencias/entities/licencia.entity';
import { Negocio } from '../src/negocios/entities/negocio.entity';
import { Usuario } from '../src/usuarios/entities/usuario.entity';
import { UsuariosService } from '../src/usuarios/usuarios.service';
import { conBaseMigrada } from './support/mariadb';
import { RelojPrueba } from './support/reloj';

async function crearNegocio(dataSource: DataSource, nombre: string) {
  const negocio = await dataSource.getRepository(Negocio).save(Object.assign(new Negocio(), {
    nombre,
    slug: `${nombre.toLowerCase().replaceAll(' ', '-')}-${randomUUID()}`,
    emailContacto: `${randomUUID()}@example.test`,
    telefonoContacto: null,
    activadoEn: null,
  }));
  const licencia = await dataSource.getRepository(Licencia).save(Object.assign(new Licencia(), {
    negocioId: negocio.id,
    negocio,
    habilitadaEn: null,
    venceEn: null,
    suspendidaEn: null,
  }));
  return { negocio, licencia };
}

async function crearUsuario(
  dataSource: DataSource,
  rol: Rol,
  negocio: Negocio | null,
  activado = false,
) {
  const repositorio = dataSource.getRepository(Usuario);
  const usuario = await repositorio.save(Object.assign(new Usuario(), {
    negocioId: negocio?.id ?? null,
    negocio,
    nombre: null,
    email: `${randomUUID()}@example.test`,
    passwordHash: null,
    rol,
    activo: true,
    activadoEn: null,
  }));
  if (!activado) return usuario;
  await repositorio.update(usuario.id, {
    nombre: `Usuario ${rol}`,
    passwordHash: 'hash-de-prueba',
    activadoEn: new Date(usuario.creadoEn.getTime() + 1),
  });
  return repositorio.findOneByOrFail({ id: usuario.id });
}

describe('Dominio de autenticación T26–T30', () => {
  it('T26 reemplaza el código pendiente sin activar cuenta o licencia y rechaza una cuenta activada', async () => {
    await conBaseMigrada(async (primera) => {
      const { negocio, licencia } = await crearNegocio(primera, 'Reemplazos');
      const emisor = await crearUsuario(primera, Rol.SUPERADMIN, null);
      const administrador = await crearUsuario(primera, Rol.ADMIN_NEGOCIO, negocio);
      const codigos = new CodigosService(new AuditoriaService());
      const inicio = new Date('2026-09-11T12:00:00.000Z');
      const anterior = await primera.transaction((manager) => codigos.emitir(manager, {
        negocioId: negocio.id,
        usuarioId: administrador.id,
        emisorUsuarioId: emisor.id,
        proposito: PropositoCodigoAcceso.ACTIVACION_ADMIN,
        ahora: inicio,
      }));

      const reemplazo = await codigos.reemplazar(primera, {
        negocioId: negocio.id,
        usuarioId: administrador.id,
        emisorUsuarioId: emisor.id,
        proposito: PropositoCodigoAcceso.ACTIVACION_ADMIN,
        ahora: new Date('2026-09-11T12:05:00.000Z'),
      });

      await expect(codigos.consumir(primera, {
        codigo: anterior.codigo,
        proposito: PropositoCodigoAcceso.ACTIVACION_ADMIN,
        ahora: new Date('2026-09-11T12:06:00.000Z'),
      }, async () => undefined)).rejects.toThrow('Código inválido o no disponible');
      expect(reemplazo.codigo).not.toBe(anterior.codigo);
      expect(await primera.getRepository(Usuario).findOneByOrFail({ id: administrador.id }))
        .toMatchObject({ negocioId: negocio.id, activadoEn: null });
      expect(await primera.getRepository(Licencia).findOneByOrFail({ id: licencia.id }))
        .toMatchObject({ habilitadaEn: null, venceEn: null });

      await primera.getRepository(Usuario).update(administrador.id, {
        nombre: 'Administrador activo',
        passwordHash: 'hash-activo',
        activadoEn: new Date(administrador.creadoEn.getTime() + 1),
      });
      await expect(codigos.reemplazar(primera, {
        negocioId: negocio.id,
        usuarioId: administrador.id,
        emisorUsuarioId: emisor.id,
        proposito: PropositoCodigoAcceso.ACTIVACION_ADMIN,
        ahora: new Date('2026-09-11T12:08:00.000Z'),
      })).rejects.toThrow('La cuenta ya fue activada');
    });
  });

  it('T27 comparte cinco intentos por IP, bloquea el sexto sin extender y separa otra IP', async () => {
    await conBaseMigrada(async (primera) => {
      const reloj = new RelojPrueba(new Date('2026-09-11T13:00:00.000Z'));
      const storage = new LimiteIntentosStorage(
        primera.getRepository(LimiteIntentos),
        reloj,
      );
      for (let intento = 1; intento <= 5; intento += 1) {
        await expect(storage.increment('203.0.113.10', 60_000, 5, 60_000, 'default'))
          .resolves.toMatchObject({ totalHits: intento, isBlocked: false });
      }
      const sexto = await storage.increment('203.0.113.10', 60_000, 5, 60_000, 'default');
      expect(sexto).toMatchObject({ totalHits: 6, isBlocked: true, timeToBlockExpire: 60_000 });
      reloj.avanzar(30_000);
      const bloqueado = await storage.increment('203.0.113.10', 60_000, 5, 60_000, 'default');
      expect(bloqueado).toMatchObject({ totalHits: 6, isBlocked: true, timeToBlockExpire: 30_000 });
      await expect(storage.increment('198.51.100.4', 60_000, 5, 60_000, 'default'))
        .resolves.toMatchObject({ totalHits: 1, isBlocked: false });
      reloj.avanzar(30_000);
      await expect(storage.increment('203.0.113.10', 60_000, 5, 60_000, 'default'))
        .resolves.toMatchObject({ totalHits: 1, isBlocked: false });
    });
  });

  it('T28 conserva una hora exacta y permite revocar una sesión o todas las de la cuenta', async () => {
    await conBaseMigrada(async (primera) => {
      const { negocio } = await crearNegocio(primera, 'Sesiones');
      const usuario = await crearUsuario(primera, Rol.ADMIN_NEGOCIO, negocio, true);
      const sesiones = new SesionesService(primera.getRepository(Sesion));
      const inicio = new Date('2026-09-11T14:00:00.000Z');
      const primeraSesion = await sesiones.crear(usuario.id, inicio);
      const segundaSesion = await sesiones.crear(usuario.id, inicio);

      expect(primeraSesion.expiraEn).toEqual(new Date('2026-09-11T15:00:00.000Z'));
      await expect(sesiones.esValida(
        primeraSesion.id,
        usuario.id,
        new Date('2026-09-11T14:59:59.999Z'),
      )).resolves.toBe(true);
      await expect(sesiones.esValida(
        primeraSesion.id,
        usuario.id,
        new Date('2026-09-11T15:00:00.000Z'),
      )).resolves.toBe(false);
      expect((await primera.getRepository(Sesion).findOneByOrFail({ id: primeraSesion.id })).expiraEn)
        .toEqual(primeraSesion.expiraEn);

      await sesiones.revocar(primeraSesion.id, usuario.id, new Date('2026-09-11T14:30:00.000Z'));
      await expect(sesiones.esValida(primeraSesion.id, usuario.id, inicio)).resolves.toBe(false);
      await expect(sesiones.esValida(segundaSesion.id, usuario.id, inicio)).resolves.toBe(true);
      await sesiones.revocarTodas(usuario.id, new Date('2026-09-11T14:31:00.000Z'));
      await expect(sesiones.esValida(segundaSesion.id, usuario.id, inicio)).resolves.toBe(false);
    });
  });

  it('T29 lista y consulta solo recepcionistas del negocio indicado', async () => {
    await conBaseMigrada(async (primera) => {
      const { negocio: primero } = await crearNegocio(primera, 'Tenant uno');
      const { negocio: segundo } = await crearNegocio(primera, 'Tenant dos');
      const propio = await crearUsuario(primera, Rol.RECEPCIONISTA, primero, true);
      const ajeno = await crearUsuario(primera, Rol.RECEPCIONISTA, segundo, true);
      const usuarios = new UsuariosService(primera.getRepository(Usuario));

      await expect(usuarios.listarRecepcionistas(primero.id)).resolves.toEqual([
        expect.objectContaining({ id: propio.id, negocioId: primero.id }),
      ]);
      await expect(usuarios.buscarRecepcionista(primero.id, propio.id))
        .resolves.toMatchObject({ id: propio.id });
      await expect(usuarios.buscarRecepcionista(primero.id, ajeno.id))
        .rejects.toThrow('Usuario no disponible');
    });
  });
});
