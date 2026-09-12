import { ConflictException, ForbiddenException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { AltasService } from '../src/altas/altas.service';
import { AuditoriaService } from '../src/auditoria/auditoria.service';
import { EventoAuditoria } from '../src/auditoria/entities/evento-auditoria.entity';
import { Rol } from '../src/auth/enums/rol.enum';
import { AutorizacionService } from '../src/auth/services/autorizacion.service';
import { CodigoAcceso, PropositoCodigoAcceso } from '../src/codigos/entities/codigo-acceso.entity';
import { CodigosService } from '../src/codigos/codigos.service';
import { Licencia } from '../src/licencias/entities/licencia.entity';
import { PoliticaAccesoLicenciaService } from '../src/licencias/services/politica-acceso-licencia.service';
import { Negocio } from '../src/negocios/entities/negocio.entity';
import { Usuario } from '../src/usuarios/entities/usuario.entity';
import { conBaseMigrada } from './support/mariadb';

function construirServicio(dataSource: DataSource): AltasService {
  const auditoria = new AuditoriaService();
  return new AltasService(
    dataSource.getRepository(Negocio),
    new AutorizacionService(),
    new CodigosService(auditoria),
    auditoria,
    new PoliticaAccesoLicenciaService(),
  );
}

async function prepararAdministradorActivo(dataSource: DataSource) {
  const negocio = await dataSource.getRepository(Negocio).save(Object.assign(new Negocio(), {
    nombre: `Negocio ${randomUUID()}`,
    slug: `negocio-${randomUUID()}`,
    emailContacto: `${randomUUID()}@example.test`,
    telefonoContacto: null,
    activadoEn: null,
  }));
  const administrador = await dataSource.getRepository(Usuario).save(Object.assign(new Usuario(), {
    negocioId: negocio.id,
    negocio,
    nombre: null,
    email: `${randomUUID()}@example.test`,
    passwordHash: null,
    rol: Rol.ADMIN_NEGOCIO,
    activo: true,
    activadoEn: null,
  }));
  const licencia = await dataSource.getRepository(Licencia).save(Object.assign(new Licencia(), {
    negocioId: negocio.id,
    negocio,
    habilitadaEn: null,
    venceEn: null,
    suspendidaEn: null,
  }));
  const activacion = new Date(Math.max(
    negocio.creadoEn.getTime(),
    administrador.creadoEn.getTime(),
    licencia.creadoEn.getTime(),
  ) + 1);
  const vencimiento = new Date(activacion.getTime() + 366 * 24 * 60 * 60 * 1000);
  await dataSource.getRepository(Negocio).update(negocio.id, { activadoEn: activacion });
  await dataSource.getRepository(Usuario).update(administrador.id, {
    nombre: 'Administrador activo',
    passwordHash: 'hash-de-prueba',
    activadoEn: activacion,
  });
  await dataSource.getRepository(Licencia).update(licencia.id, {
    habilitadaEn: activacion,
    venceEn: vencimiento,
  });
  return {
    negocio: await dataSource.getRepository(Negocio).findOneByOrFail({ id: negocio.id }),
    administrador: await dataSource.getRepository(Usuario).findOneByOrFail({ id: administrador.id }),
    ahora: new Date(activacion.getTime() + 60_000),
  };
}

describe('Invitación de recepcionistas (T32)', () => {
  it('reserva el correo y emite un código de 48 horas ligado al rol y tenant del administrador', async () => {
    await conBaseMigrada(async (primera) => {
      const { negocio, administrador, ahora } = await prepararAdministradorActivo(primera);
      const servicio = construirServicio(primera);
      const negocioAjeno = await primera.getRepository(Negocio).save(Object.assign(new Negocio(), {
        nombre: 'Destino inyectado',
        slug: `ajeno-${randomUUID()}`,
        emailContacto: 'ajeno@example.test',
        telefonoContacto: null,
        activadoEn: null,
      }));
      const solicitud = {
        actorUsuarioId: administrador.id,
        emailRecepcionista: ' RECEPCION@EJEMPLO.TEST ',
        ahora,
        // Este campo ajeno simula datos adicionales del cliente y debe ignorarse.
        negocioId: negocioAjeno.id,
      };

      const resultado = await servicio.invitarRecepcionista(solicitud);

      expect(resultado).toEqual({
        usuarioId: expect.any(Number),
        negocioId: negocio.id,
        codigo: expect.any(String),
        expiraEn: new Date(ahora.getTime() + 48 * 60 * 60 * 1000),
      });
      await expect(primera.getRepository(Usuario).findOneByOrFail({ id: resultado.usuarioId }))
        .resolves.toMatchObject({
          negocioId: negocio.id,
          email: 'recepcion@ejemplo.test',
          rol: Rol.RECEPCIONISTA,
          nombre: null,
          passwordHash: null,
          activadoEn: null,
          activo: true,
        });
      await expect(primera.getRepository(CodigoAcceso).findOneByOrFail({
        usuarioId: resultado.usuarioId,
      })).resolves.toMatchObject({
        negocioId: negocio.id,
        emisorUsuarioId: administrador.id,
        proposito: PropositoCodigoAcceso.ACTIVACION_RECEPCIONISTA,
      });
    });
  });

  it('rechaza un correo globalmente reservado sin dejar cuenta, código o auditoría parcial', async () => {
    await conBaseMigrada(async (primera) => {
      const { administrador, ahora } = await prepararAdministradorActivo(primera);
      const servicio = construirServicio(primera);
      const cantidadesAntes = await Promise.all([
        primera.getRepository(Usuario).count(),
        primera.getRepository(CodigoAcceso).count(),
        primera.getRepository(EventoAuditoria).count(),
      ]);

      await expect(servicio.invitarRecepcionista({
        actorUsuarioId: administrador.id,
        emailRecepcionista: administrador.email.toUpperCase(),
        ahora,
      })).rejects.toBeInstanceOf(ConflictException);
      await expect(Promise.all([
        primera.getRepository(Usuario).count(),
        primera.getRepository(CodigoAcceso).count(),
        primera.getRepository(EventoAuditoria).count(),
      ])).resolves.toEqual(cantidadesAntes);
    });
  });

  it('deniega a recepción y a un administrador con licencia suspendida', async () => {
    await conBaseMigrada(async (primera) => {
      const { negocio, administrador, ahora } = await prepararAdministradorActivo(primera);
      const servicio = construirServicio(primera);
      const recepcionista = await primera.getRepository(Usuario).save(Object.assign(new Usuario(), {
        negocioId: negocio.id,
        negocio,
        nombre: null,
        email: 'actor-recepcion@example.test',
        passwordHash: null,
        rol: Rol.RECEPCIONISTA,
        activo: true,
        activadoEn: null,
      }));

      await expect(servicio.invitarRecepcionista({
        actorUsuarioId: recepcionista.id,
        emailRecepcionista: 'denegado@example.test',
        ahora,
      })).rejects.toBeInstanceOf(ForbiddenException);

      await primera.getRepository(Licencia).update(
        { negocioId: negocio.id },
        { suspendidaEn: ahora },
      );
      await expect(servicio.invitarRecepcionista({
        actorUsuarioId: administrador.id,
        emailRecepcionista: 'suspendido@example.test',
        ahora,
      })).rejects.toBeInstanceOf(ForbiddenException);
      expect(await primera.getRepository(Usuario).countBy({ rol: Rol.RECEPCIONISTA })).toBe(1);
    });
  });
});
