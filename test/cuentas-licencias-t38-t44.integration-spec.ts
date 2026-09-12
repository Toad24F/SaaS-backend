import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { IsNull } from 'typeorm';
import type { DataSource } from 'typeorm';
import { AuditoriaService } from '../src/auditoria/auditoria.service';
import { EventoAuditoria } from '../src/auditoria/entities/evento-auditoria.entity';
import { Sesion } from '../src/auth/entities/sesion.entity';
import { Rol } from '../src/auth/enums/rol.enum';
import { AutorizacionService } from '../src/auth/services/autorizacion.service';
import { CredencialesService } from '../src/auth/services/credenciales.service';
import { PoliticaContrasenasService } from '../src/auth/services/politica-contrasenas.service';
import { SesionesService } from '../src/auth/services/sesiones.service';
import { CodigoAcceso, PropositoCodigoAcceso } from '../src/codigos/entities/codigo-acceso.entity';
import { CodigosService } from '../src/codigos/codigos.service';
import { Licencia } from '../src/licencias/entities/licencia.entity';
import { LicenciasService } from '../src/licencias/licencias.service';
import { CalendarioLicenciasService } from '../src/licencias/services/calendario-licencias.service';
import { Negocio } from '../src/negocios/entities/negocio.entity';
import { Usuario } from '../src/usuarios/entities/usuario.entity';
import { UsuariosService } from '../src/usuarios/usuarios.service';
import { conBaseMigrada } from './support/mariadb';

const contrasenaInicial = 'contraseña-inicial';

async function crearSuperadmin(dataSource: DataSource) {
  return dataSource.getRepository(Usuario).save(Object.assign(new Usuario(), {
    negocioId: null, negocio: null, nombre: null, email: `${randomUUID()}@example.test`,
    passwordHash: null, rol: Rol.SUPERADMIN, activo: true, activadoEn: null,
  }));
}

async function crearTenant(dataSource: DataSource) {
  const negocio = await dataSource.getRepository(Negocio).save(Object.assign(new Negocio(), {
    nombre: `Tenant ${randomUUID()}`, slug: `tenant-${randomUUID()}`,
    emailContacto: `${randomUUID()}@example.test`, telefonoContacto: null, activadoEn: null,
  }));
  const crearPendiente = (rol: Rol) => dataSource.getRepository(Usuario).save(Object.assign(new Usuario(), {
    negocioId: negocio.id, negocio, nombre: null, email: `${randomUUID()}@example.test`,
    passwordHash: null, rol, activo: true, activadoEn: null,
  }));
  const administrador = await crearPendiente(Rol.ADMIN_NEGOCIO);
  const recepcionista = await crearPendiente(Rol.RECEPCIONISTA);
  const licencia = await dataSource.getRepository(Licencia).save(Object.assign(new Licencia(), {
    negocioId: negocio.id, negocio, habilitadaEn: null, venceEn: null, suspendidaEn: null,
  }));
  const ahora = new Date(Math.max(
    negocio.creadoEn.getTime(), administrador.creadoEn.getTime(),
    recepcionista.creadoEn.getTime(), licencia.creadoEn.getTime(),
  ) + 1000);
  const hash = await new PoliticaContrasenasService().generarHash(contrasenaInicial);
  await dataSource.getRepository(Negocio).update(negocio.id, { activadoEn: ahora });
  for (const usuario of [administrador, recepcionista]) {
    await dataSource.getRepository(Usuario).update(usuario.id, {
      nombre: `Activo ${usuario.rol}`, passwordHash: hash, activadoEn: ahora,
    });
  }
  const venceEn = new CalendarioLicenciasService().sumarAnios(ahora);
  await dataSource.getRepository(Licencia).update(licencia.id, { habilitadaEn: ahora, venceEn });
  return {
    negocio,
    administrador: await dataSource.getRepository(Usuario).findOneByOrFail({ id: administrador.id }),
    recepcionista: await dataSource.getRepository(Usuario).findOneByOrFail({ id: recepcionista.id }),
    licencia: await dataSource.getRepository(Licencia).findOneByOrFail({ id: licencia.id }),
    ahora: new Date(ahora.getTime() + 60_000),
  };
}

function credenciales(dataSource: DataSource) {
  const auditoria = new AuditoriaService();
  const sesiones = new SesionesService(dataSource.getRepository(Sesion));
  return new CredencialesService(
    dataSource.getRepository(Usuario), new CodigosService(auditoria),
    new AutorizacionService(), new PoliticaContrasenasService(), sesiones, auditoria,
  );
}

function licencias(dataSource: DataSource) {
  return new LicenciasService(
    dataSource.getRepository(Licencia), new AutorizacionService(),
    new CalendarioLicenciasService(), new AuditoriaService(),
  );
}

describe('Cuentas y licencias T38–T44', () => {
  it('T38 desactiva solo recepción propia, conserva la fila y rechaza tenant ajeno', async () => {
    await conBaseMigrada(async (primera) => {
      const propio = await crearTenant(primera);
      const ajeno = await crearTenant(primera);
      const servicio = new UsuariosService(primera.getRepository(Usuario));
      await servicio.desactivarRecepcionista(propio.administrador.id, propio.recepcionista.id);
      expect(await primera.getRepository(Usuario).findOneByOrFail({ id: propio.recepcionista.id }))
        .toMatchObject({ activo: false, negocioId: propio.negocio.id });
      await expect(servicio.desactivarRecepcionista(
        propio.administrador.id, ajeno.recepcionista.id,
      )).rejects.toBeInstanceOf(NotFoundException);
      await expect(servicio.desactivarRecepcionista(
        propio.recepcionista.id, propio.recepcionista.id,
      )).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  it('T39–T40 autoriza, reemplaza y consume recuperación sin levantar bloqueos', async () => {
    await conBaseMigrada(async (primera) => {
      const actor = await crearSuperadmin(primera);
      const tenant = await crearTenant(primera);
      const servicio = credenciales(primera);
      await primera.getRepository(Usuario).update(tenant.administrador.id, { activo: false });
      await primera.getRepository(Licencia).update(tenant.licencia.id, { suspendidaEn: tenant.ahora });
      const anterior = await servicio.autorizarRecuperacion({
        actorUsuarioId: actor.id, administradorId: tenant.administrador.id, ahora: tenant.ahora,
      });
      const reemplazo = await servicio.autorizarRecuperacion({
        actorUsuarioId: actor.id, administradorId: tenant.administrador.id,
        ahora: new Date(tenant.ahora.getTime() + 1),
      });
      await expect(new CodigosService(new AuditoriaService()).consumir(primera, {
        codigo: anterior.codigo, proposito: PropositoCodigoAcceso.RECUPERACION,
        ahora: new Date(tenant.ahora.getTime() + 2),
      }, async () => undefined)).rejects.toThrow('Código inválido');

      const sesion = await new SesionesService(primera.getRepository(Sesion))
        .crear(tenant.administrador.id, tenant.ahora);
      await servicio.recuperarContrasena({
        codigo: reemplazo.codigo, nuevaPassword: 'contraseña-recuperada',
        ahora: new Date(tenant.ahora.getTime() + 2),
      });
      expect(await primera.getRepository(Usuario).findOneByOrFail({ id: tenant.administrador.id }))
        .toMatchObject({ activo: false, activadoEn: tenant.administrador.activadoEn });
      expect((await primera.getRepository(Licencia).findOneByOrFail({ id: tenant.licencia.id })).suspendidaEn)
        .toEqual(tenant.ahora);
      expect((await primera.getRepository(Sesion).findOneByOrFail({ id: sesion.id })).revocadaEn)
        .not.toBeNull();
    });
  });

  it('T39 rechaza emisores no superadmin y destinos no administradores', async () => {
    await conBaseMigrada(async (primera) => {
      const actor = await crearSuperadmin(primera);
      const tenant = await crearTenant(primera);
      const servicio = credenciales(primera);
      await expect(servicio.autorizarRecuperacion({
        actorUsuarioId: tenant.administrador.id, administradorId: tenant.administrador.id, ahora: tenant.ahora,
      })).rejects.toBeInstanceOf(ForbiddenException);
      await expect(servicio.autorizarRecuperacion({
        actorUsuarioId: actor.id, administradorId: tenant.recepcionista.id, ahora: tenant.ahora,
      })).rejects.toBeInstanceOf(ForbiddenException);
      expect(await primera.getRepository(CodigoAcceso).count()).toBe(0);
    });
  });

  it('T41 exige contraseña actual, cambia el hash y revoca todas las sesiones', async () => {
    await conBaseMigrada(async (primera) => {
      const tenant = await crearTenant(primera);
      const servicio = credenciales(primera);
      const sesiones = new SesionesService(primera.getRepository(Sesion));
      await sesiones.crear(tenant.administrador.id, tenant.ahora);
      await sesiones.crear(tenant.administrador.id, tenant.ahora);
      await expect(servicio.cambiarContrasena({
        usuarioId: tenant.administrador.id, passwordActual: 'incorrecta',
        nuevaPassword: 'contraseña-nueva', ahora: tenant.ahora,
      })).rejects.toBeInstanceOf(BadRequestException);
      await servicio.cambiarContrasena({
        usuarioId: tenant.administrador.id, passwordActual: contrasenaInicial,
        nuevaPassword: 'contraseña-nueva', ahora: tenant.ahora,
      });
      expect(await primera.getRepository(Sesion).countBy({
        usuarioId: tenant.administrador.id, revocadaEn: IsNull(),
      }))
        .toBe(0);
    });
  });

  it('T42 suspende una vez, conserva vencimiento y no duplica auditoría', async () => {
    await conBaseMigrada(async (primera) => {
      const actor = await crearSuperadmin(primera);
      const tenant = await crearTenant(primera);
      const servicio = licencias(primera);
      await servicio.suspender(actor.id, tenant.licencia.id, tenant.ahora);
      await servicio.suspender(actor.id, tenant.licencia.id, new Date(tenant.ahora.getTime() + 1000));
      expect(await primera.getRepository(Licencia).findOneByOrFail({ id: tenant.licencia.id }))
        .toMatchObject({ suspendidaEn: tenant.ahora, venceEn: tenant.licencia.venceEn });
      expect(await primera.getRepository(EventoAuditoria).countBy({ accion: 'licencia_suspendida' })).toBe(1);
    });
  });

  it('T43 reactiva devolviendo la duración exacta y repetir no añade tiempo', async () => {
    await conBaseMigrada(async (primera) => {
      const actor = await crearSuperadmin(primera);
      const tenant = await crearTenant(primera);
      const servicio = licencias(primera);
      await servicio.suspender(actor.id, tenant.licencia.id, tenant.ahora);
      const reactivacion = new Date(tenant.ahora.getTime() + 10 * 24 * 60 * 60 * 1000);
      await servicio.reactivar(actor.id, tenant.licencia.id, reactivacion);
      const esperado = new Date(tenant.licencia.venceEn!.getTime() + reactivacion.getTime() - tenant.ahora.getTime());
      await servicio.reactivar(actor.id, tenant.licencia.id, new Date(reactivacion.getTime() + 1000));
      expect(await primera.getRepository(Licencia).findOneByOrFail({ id: tenant.licencia.id }))
        .toMatchObject({ suspendidaEn: null, venceEn: esperado });
      expect(await primera.getRepository(EventoAuditoria).countBy({ accion: 'licencia_reactivada' })).toBe(1);
    });
  });

  it('T44 renueva desde vencimiento vigente, ahora vencido o vencimiento suspendido', async () => {
    await conBaseMigrada(async (primera) => {
      const actor = await crearSuperadmin(primera);
      const tenant = await crearTenant(primera);
      const servicio = licencias(primera);
      const calendario = new CalendarioLicenciasService();
      await servicio.renovar(actor.id, tenant.licencia.id, tenant.ahora);
      const primeraRenovacion = calendario.sumarAnios(tenant.licencia.venceEn!);
      expect((await primera.getRepository(Licencia).findOneByOrFail({ id: tenant.licencia.id })).venceEn)
        .toEqual(primeraRenovacion);
      await servicio.suspender(actor.id, tenant.licencia.id, tenant.ahora);
      await servicio.renovar(actor.id, tenant.licencia.id, new Date(tenant.ahora.getTime() + 1000));
      expect(await primera.getRepository(Licencia).findOneByOrFail({ id: tenant.licencia.id }))
        .toMatchObject({ suspendidaEn: tenant.ahora, venceEn: calendario.sumarAnios(primeraRenovacion) });
    });
  });

  it('T42–T44 cubre pendiente, vencida y autorización exclusiva del superadmin', async () => {
    await conBaseMigrada(async (primera) => {
      const actor = await crearSuperadmin(primera);
      const pendiente = await crearTenant(primera);
      const vencida = await crearTenant(primera);
      const servicio = licencias(primera);
      await primera.getRepository(Licencia).update(pendiente.licencia.id, {
        habilitadaEn: null, venceEn: null,
      });
      await servicio.suspender(actor.id, pendiente.licencia.id, pendiente.ahora);
      await servicio.reactivar(actor.id, pendiente.licencia.id, new Date(pendiente.ahora.getTime() + 1000));
      expect(await primera.getRepository(Licencia).findOneByOrFail({ id: pendiente.licencia.id }))
        .toMatchObject({ habilitadaEn: null, venceEn: null, suspendidaEn: null });
      expect((await primera.getRepository(Usuario).findOneByOrFail({ id: pendiente.administrador.id })).activo)
        .toBe(true);
      await expect(servicio.renovar(actor.id, pendiente.licencia.id, pendiente.ahora))
        .rejects.toBeInstanceOf(BadRequestException);

      const vencimiento = new Date(vencida.ahora.getTime() - 1);
      await primera.getRepository(Licencia).update(vencida.licencia.id, { venceEn: vencimiento });
      await expect(servicio.suspender(actor.id, vencida.licencia.id, vencida.ahora))
        .rejects.toBeInstanceOf(BadRequestException);
      await servicio.renovar(actor.id, vencida.licencia.id, vencida.ahora);
      expect((await primera.getRepository(Licencia).findOneByOrFail({ id: vencida.licencia.id })).venceEn)
        .toEqual(new CalendarioLicenciasService().sumarAnios(vencida.ahora));
      await expect(servicio.suspender(
        vencida.administrador.id, vencida.licencia.id, vencida.ahora,
      )).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
