import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { IsNull } from 'typeorm';
import type { DataSource } from 'typeorm';
import { AuditoriaService } from '../src/auditoria/auditoria.service';
import { EventoAuditoria } from '../src/auditoria/entities/evento-auditoria.entity';
import { Sesion } from '../src/auth/entities/sesion.entity';
import { Rol } from '../src/auth/enums/rol.enum';
import { PoliticaContrasenasService } from '../src/auth/services/politica-contrasenas.service';
import { Licencia } from '../src/licencias/entities/licencia.entity';
import { CalendarioLicenciasService } from '../src/licencias/services/calendario-licencias.service';
import { Negocio } from '../src/negocios/entities/negocio.entity';
import { Usuario } from '../src/usuarios/entities/usuario.entity';
import { UsuariosService } from '../src/usuarios/usuarios.service';
import { conBaseMigrada } from './support/mariadb';

const passwordInicial = 'contraseña-inicial';

async function crearTenant(dataSource: DataSource, ahora: Date) {
  const politica = new PoliticaContrasenasService();
  const passwordHash = await politica.generarHash(passwordInicial);
  const negocio = await dataSource.getRepository(Negocio).save(Object.assign(new Negocio(), {
    nombre: `Tenant ${randomUUID()}`,
    slug: `tenant-${randomUUID()}`,
    emailContacto: `${randomUUID()}@example.test`,
    telefonoContacto: null,
    activadoEn: null,
  }));
  // Las restricciones exigen que la activación sea posterior a la fecha creada por MariaDB.
  const activadoEn = new Date(Math.max(ahora.getTime(), negocio.creadoEn.getTime() + 1000));
  const crearUsuario = (rol: Rol, nombre: string) => dataSource.getRepository(Usuario).save(
    Object.assign(new Usuario(), {
      negocioId: negocio.id,
      negocio,
      nombre,
      email: `${randomUUID()}@example.test`,
      passwordHash,
      rol,
      activo: true,
      activadoEn,
    }),
  );
  const administrador = await crearUsuario(Rol.ADMIN_NEGOCIO, 'Administrador');
  const recepcionista = await crearUsuario(Rol.RECEPCIONISTA, 'Recepción');
  const licencia = await dataSource.getRepository(Licencia).save(Object.assign(new Licencia(), {
    negocioId: negocio.id,
    negocio,
    habilitadaEn: null,
    venceEn: null,
    suspendidaEn: null,
  }));
  const habilitadaEn = new Date(Math.max(activadoEn.getTime(), licencia.creadoEn.getTime() + 1000));
  await dataSource.getRepository(Negocio).update(negocio.id, { activadoEn: habilitadaEn });
  await dataSource.getRepository(Usuario).update(administrador.id, { activadoEn: habilitadaEn });
  await dataSource.getRepository(Usuario).update(recepcionista.id, { activadoEn: habilitadaEn });
  await dataSource.getRepository(Licencia).update(licencia.id, {
    habilitadaEn,
    venceEn: new CalendarioLicenciasService().sumarAnios(habilitadaEn),
  });
  administrador.activadoEn = habilitadaEn;
  recepcionista.activadoEn = habilitadaEn;
  return { negocio, administrador, recepcionista };
}

function instantePosteriorAActivacion(
  tenant: Awaited<ReturnType<typeof crearTenant>>,
): Date {
  if (!tenant.administrador.activadoEn) {
    throw new Error('La fixture debe devolver un administrador activado.');
  }
  // MariaDB asigna creado_en con su reloj real; el reloj controlado debe partir
  // de la activación persistida para no quedar en el pasado al cambiar de día.
  return new Date(tenant.administrador.activadoEn.getTime() + 24 * 60 * 60 * 1000);
}

function servicio(dataSource: DataSource, auditoria = new AuditoriaService()) {
  return new UsuariosService(
    dataSource.getRepository(Usuario),
    new PoliticaContrasenasService(),
    auditoria,
  );
}

describe('T76 y T81 — casos de uso de recepcionistas', () => {
  it('T81 crea una cuenta completa normalizada, con rol/tenant del actor, auditoría y sin códigos', async () => {
    await conBaseMigrada(async (db) => {
      const tenant = await crearTenant(db, new Date('2026-09-01T18:00:00.000Z'));
      const ahora = instantePosteriorAActivacion(tenant);

      const creada = await servicio(db).crearRecepcionista({
        actorUsuarioId: tenant.administrador.id,
        nombre: '  Ana   Pérez  ',
        email: '  ANA.PEREZ@EXAMPLE.TEST ',
        password: 'contraseña-segura',
        ahora,
      });

      expect(creada).toMatchObject({
        negocioId: tenant.negocio.id,
        nombre: 'Ana Pérez',
        email: 'ana.perez@example.test',
        rol: Rol.RECEPCIONISTA,
        activo: true,
        activadoEn: ahora,
        creadoEn: ahora,
      });
      expect(creada.passwordHash).not.toBe(passwordInicial);
      await expect(new PoliticaContrasenasService().comparar('contraseña-segura', creada.passwordHash!))
        .resolves.toBe(true);
      expect(await db.query('SELECT COUNT(*) AS total FROM codigos_acceso')).toEqual([{ total: '0' }]);
      const evento = await db.getRepository(EventoAuditoria).findOneByOrFail({
        accion: 'recepcionista_creado', usuarioId: creada.id,
      });
      expect(evento).toMatchObject({
        actorUsuarioId: tenant.administrador.id,
        negocioId: tenant.negocio.id,
        valoresAntes: null,
        valoresDespues: {
          nombre: 'Ana Pérez', email: 'ana.perez@example.test', rol: Rol.RECEPCIONISTA,
          activo: true, activadoEn: ahora.toISOString(),
        },
      });
      expect(JSON.stringify(evento)).not.toMatch(/password|hash|contraseña/i);
    });
  });

  it('T81 rechaza datos inválidos, actores sin permiso y correo global duplicado sin alta parcial', async () => {
    await conBaseMigrada(async (db) => {
      const propio = await crearTenant(db, new Date('2026-09-01T18:00:00.000Z'));
      const ajeno = await crearTenant(db, new Date('2026-09-02T18:00:00.000Z'));
      const ahora = instantePosteriorAActivacion(ajeno);
      const usuarios = servicio(db);
      const totalAntes = await db.getRepository(Usuario).count();

      await expect(usuarios.crearRecepcionista({
        actorUsuarioId: propio.recepcionista.id, nombre: 'Sin permiso',
        email: 'nuevo@example.test', password: 'contraseña-segura', ahora,
      })).rejects.toBeInstanceOf(ForbiddenException);
      await expect(usuarios.crearRecepcionista({
        actorUsuarioId: propio.administrador.id, nombre: '   ',
        email: 'nuevo@example.test', password: 'contraseña-segura', ahora,
      })).rejects.toBeInstanceOf(BadRequestException);
      await expect(usuarios.crearRecepcionista({
        actorUsuarioId: propio.administrador.id, nombre: 'Duplicada',
        email: ` ${ajeno.recepcionista.email.toUpperCase()} `,
        password: 'contraseña-segura', ahora,
      })).rejects.toBeInstanceOf(ConflictException);

      expect(await db.getRepository(Usuario).count()).toBe(totalAntes);
      expect(await db.getRepository(EventoAuditoria).countBy({ accion: 'recepcionista_creado' })).toBe(0);
    });
  });

  it('T81 revierte la cuenta si no puede registrar su auditoría', async () => {
    await conBaseMigrada(async (db) => {
      const tenant = await crearTenant(db, new Date('2026-09-01T18:00:00.000Z'));
      const auditoria = new AuditoriaService();
      jest.spyOn(auditoria, 'registrar').mockRejectedValueOnce(new Error('Fallo controlado T81'));

      await expect(servicio(db, auditoria).crearRecepcionista({
        actorUsuarioId: tenant.administrador.id,
        nombre: 'Rollback',
        email: 'rollback@example.test',
        password: 'contraseña-segura',
        ahora: instantePosteriorAActivacion(tenant),
      })).rejects.toThrow('Fallo controlado T81');
      expect(await db.getRepository(Usuario).findOneBy({ email: 'rollback@example.test' })).toBeNull();
    });
  });

  it('T76 desactiva una vez, revoca sesiones y reactiva sin restaurarlas ni cambiar identidad', async () => {
    await conBaseMigrada(async (db) => {
      const tenant = await crearTenant(db, new Date('2026-09-01T18:00:00.000Z'));
      const usuarios = servicio(db);
      const desactivacion = new Date('2026-09-15T18:00:00.000Z');
      const reactivacion = new Date('2026-09-16T18:00:00.000Z');
      const sesion = await db.getRepository(Sesion).save(db.getRepository(Sesion).create({
        usuarioId: tenant.recepcionista.id,
        creadaEn: new Date(desactivacion.getTime() - 60_000),
        expiraEn: new Date(desactivacion.getTime() + 3_540_000),
        revocadaEn: null,
      }));
      const identidad = { nombre: tenant.recepcionista.nombre, email: tenant.recepcionista.email,
        passwordHash: tenant.recepcionista.passwordHash, rol: tenant.recepcionista.rol,
        negocioId: tenant.recepcionista.negocioId, activadoEn: tenant.recepcionista.activadoEn };

      await usuarios.desactivarRecepcionista(tenant.administrador.id, tenant.recepcionista.id, desactivacion);
      await usuarios.desactivarRecepcionista(tenant.administrador.id, tenant.recepcionista.id, desactivacion);
      await usuarios.reactivarRecepcionista(tenant.administrador.id, tenant.recepcionista.id, reactivacion);
      await usuarios.reactivarRecepcionista(tenant.administrador.id, tenant.recepcionista.id, reactivacion);

      expect(await db.getRepository(Usuario).findOneByOrFail({ id: tenant.recepcionista.id }))
        .toMatchObject({ ...identidad, activo: true });
      expect(await db.getRepository(Sesion).findOneByOrFail({ id: sesion.id }))
        .toMatchObject({ revocadaEn: desactivacion });
      expect(await db.getRepository(Sesion).countBy({
        usuarioId: tenant.recepcionista.id, revocadaEn: IsNull(),
      })).toBe(0);
      expect(await db.getRepository(EventoAuditoria).countBy({ accion: 'recepcionista_desactivado' })).toBe(1);
      expect(await db.getRepository(EventoAuditoria).countBy({ accion: 'recepcionista_reactivado' })).toBe(1);
    });
  });

  it('T76 aísla tenants, exige recepción completa y revierte cuenta/sesiones si falla auditoría', async () => {
    await conBaseMigrada(async (db) => {
      const propio = await crearTenant(db, new Date('2026-09-01T18:00:00.000Z'));
      const ajeno = await crearTenant(db, new Date('2026-09-02T18:00:00.000Z'));
      const ahora = new Date('2026-09-15T18:00:00.000Z');
      const auditoria = new AuditoriaService();
      const usuarios = servicio(db, auditoria);

      await expect(usuarios.desactivarRecepcionista(
        propio.administrador.id, ajeno.recepcionista.id, ahora,
      )).rejects.toBeInstanceOf(NotFoundException);
      await expect(usuarios.reactivarRecepcionista(
        propio.recepcionista.id, propio.recepcionista.id, ahora,
      )).rejects.toBeInstanceOf(ForbiddenException);

      const sesion = await db.getRepository(Sesion).save(db.getRepository(Sesion).create({
        usuarioId: propio.recepcionista.id,
        creadaEn: new Date(ahora.getTime() - 60_000),
        expiraEn: new Date(ahora.getTime() + 3_540_000),
        revocadaEn: null,
      }));
      jest.spyOn(auditoria, 'registrar').mockRejectedValueOnce(new Error('Fallo controlado T76'));
      await expect(usuarios.desactivarRecepcionista(
        propio.administrador.id, propio.recepcionista.id, ahora,
      )).rejects.toThrow('Fallo controlado T76');
      expect(await db.getRepository(Usuario).findOneByOrFail({ id: propio.recepcionista.id }))
        .toMatchObject({ activo: true });
      expect(await db.getRepository(Sesion).findOneByOrFail({ id: sesion.id }))
        .toMatchObject({ revocadaEn: null });
      expect(await db.getRepository(EventoAuditoria).count()).toBe(0);
    });
  });
});

describe('T82 — restablecimiento administrativo de recepción', () => {
  it.each([true, false])('restablece cuenta con activo=%s, revoca sesiones y conserva identidad/licencia', async (activo) => {
    await conBaseMigrada(async (db) => {
      const tenant = await crearTenant(db, new Date('2026-09-01T18:00:00.000Z'));
      const ahora = instantePosteriorAActivacion(tenant);
      await db.getRepository(Usuario).update(tenant.recepcionista.id, { activo });
      if (!activo) {
        // Una licencia suspendida no debe reactivarse por restablecer la contraseña.
        await db.getRepository(Licencia).update(
          { negocioId: tenant.negocio.id }, { suspendidaEn: new Date(ahora.getTime() - 60_000) },
        );
      }
      const antes = await db.getRepository(Usuario).findOneByOrFail({ id: tenant.recepcionista.id });
      const licenciaAntes = await db.getRepository(Licencia).findOneByOrFail({ negocioId: tenant.negocio.id });
      // Dos sesiones abiertas prueban que la revocación no depende del estado activo de la cuenta.
      const sesiones = await db.getRepository(Sesion).save([0, 1].map(() => db.getRepository(Sesion).create({
        usuarioId: antes.id,
        creadaEn: new Date(ahora.getTime() - 60_000),
        expiraEn: new Date(ahora.getTime() + 3_540_000),
        revocadaEn: null,
      })));
      const revocadaAntes = new Date(ahora.getTime() - 30_000);
      const sesionAnterior = await db.getRepository(Sesion).save(db.getRepository(Sesion).create({
        usuarioId: antes.id,
        creadaEn: new Date(ahora.getTime() - 60_000),
        expiraEn: new Date(ahora.getTime() + 3_540_000),
        revocadaEn: revocadaAntes,
      }));

      await servicio(db).restablecerContrasenaRecepcionista(
        tenant.administrador.id, antes.id, 'contraseña-renovada', ahora,
      );

      const despues = await db.getRepository(Usuario).findOneByOrFail({ id: antes.id });
      expect(despues).toMatchObject({
        id: antes.id, negocioId: antes.negocioId, rol: antes.rol, nombre: antes.nombre,
        email: antes.email, activadoEn: antes.activadoEn, activo,
      });
      expect(despues.passwordHash).not.toBe(antes.passwordHash);
      await expect(new PoliticaContrasenasService().comparar('contraseña-renovada', despues.passwordHash!))
        .resolves.toBe(true);
      for (const sesion of sesiones) {
        expect(await db.getRepository(Sesion).findOneByOrFail({ id: sesion.id }))
          .toMatchObject({ revocadaEn: ahora });
      }
      expect(await db.getRepository(Sesion).findOneByOrFail({ id: sesionAnterior.id }))
        .toMatchObject({ revocadaEn: revocadaAntes });
      expect(await db.getRepository(Licencia).findOneByOrFail({ negocioId: tenant.negocio.id }))
        .toMatchObject({ habilitadaEn: licenciaAntes.habilitadaEn, venceEn: licenciaAntes.venceEn,
          suspendidaEn: licenciaAntes.suspendidaEn });
      const evento = await db.getRepository(EventoAuditoria).findOneByOrFail({
        accion: 'recepcionista_contrasena_restablecida', usuarioId: antes.id,
      });
      expect(evento).toMatchObject({ actorUsuarioId: tenant.administrador.id,
        negocioId: tenant.negocio.id });
      expect(JSON.stringify(evento)).not.toMatch(/password|hash|contraseña-renovada/i);
    });
  });

  it('rechaza actor o destino ajeno, otro rol y contraseña inválida sin cambios', async () => {
    await conBaseMigrada(async (db) => {
      const propio = await crearTenant(db, new Date('2026-09-01T18:00:00.000Z'));
      const ajeno = await crearTenant(db, new Date('2026-09-02T18:00:00.000Z'));
      const ahora = instantePosteriorAActivacion(ajeno);
      const usuarios = servicio(db);
      const hashAntes = propio.recepcionista.passwordHash;

      await expect(usuarios.restablecerContrasenaRecepcionista(
        propio.recepcionista.id, propio.recepcionista.id, 'contraseña-renovada', ahora,
      )).rejects.toBeInstanceOf(ForbiddenException);
      await expect(usuarios.restablecerContrasenaRecepcionista(
        propio.administrador.id, ajeno.recepcionista.id, 'contraseña-renovada', ahora,
      )).rejects.toBeInstanceOf(NotFoundException);
      await expect(usuarios.restablecerContrasenaRecepcionista(
        propio.administrador.id, propio.administrador.id, 'contraseña-renovada', ahora,
      )).rejects.toBeInstanceOf(NotFoundException);
      await expect(usuarios.restablecerContrasenaRecepcionista(
        propio.administrador.id, propio.recepcionista.id, 'corta', ahora,
      )).rejects.toBeInstanceOf(BadRequestException);

      expect((await db.getRepository(Usuario).findOneByOrFail({ id: propio.recepcionista.id })).passwordHash)
        .toBe(hashAntes);
      expect(await db.getRepository(EventoAuditoria).count()).toBe(0);
    });
  });

  it('revierte hash y revocación si falla la auditoría', async () => {
    await conBaseMigrada(async (db) => {
      const tenant = await crearTenant(db, new Date('2026-09-01T18:00:00.000Z'));
      const ahora = instantePosteriorAActivacion(tenant);
      const sesion = await db.getRepository(Sesion).save(db.getRepository(Sesion).create({
        usuarioId: tenant.recepcionista.id,
        creadaEn: new Date(ahora.getTime() - 60_000),
        expiraEn: new Date(ahora.getTime() + 3_540_000),
        revocadaEn: null,
      }));
      const auditoria = new AuditoriaService();
      jest.spyOn(auditoria, 'registrar').mockRejectedValueOnce(new Error('Fallo controlado T82'));

      await expect(servicio(db, auditoria).restablecerContrasenaRecepcionista(
        tenant.administrador.id, tenant.recepcionista.id, 'contraseña-renovada', ahora,
      )).rejects.toThrow('Fallo controlado T82');
      expect((await db.getRepository(Usuario).findOneByOrFail({ id: tenant.recepcionista.id })).passwordHash)
        .toBe(tenant.recepcionista.passwordHash);
      expect(await db.getRepository(Sesion).findOneByOrFail({ id: sesion.id }))
        .toMatchObject({ revocadaEn: null });
      expect(await db.getRepository(EventoAuditoria).count()).toBe(0);
    });
  });
});
