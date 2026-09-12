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

async function crearSuperadmin(dataSource: DataSource): Promise<Usuario> {
  return dataSource.getRepository(Usuario).save(Object.assign(new Usuario(), {
    negocioId: null,
    negocio: null,
    nombre: null,
    email: `${randomUUID()}@example.test`,
    passwordHash: null,
    rol: Rol.SUPERADMIN,
    activo: true,
    activadoEn: null,
  }));
}

function construirServicio(dataSource: DataSource, auditoria = new AuditoriaService()) {
  return new AltasService(
    dataSource.getRepository(Negocio),
    new AutorizacionService(),
    new CodigosService(auditoria),
    auditoria,
    new PoliticaAccesoLicenciaService(),
  );
}

describe('Alta atómica de negocio (T31)', () => {
  it('crea negocio pendiente, licencia anual sin habilitar, administrador, código y auditoría', async () => {
    await conBaseMigrada(async (primera) => {
      const actor = await crearSuperadmin(primera);
      const servicio = construirServicio(primera);
      const ahora = new Date('2026-09-12T16:00:00.000Z');

      const resultado = await servicio.crearNegocio({
        actorUsuarioId: actor.id,
        nombre: '  Clínica del Centro  ',
        identificadorPublico: ' Clinica-Centro ',
        emailAdministrador: ' ADMIN@EJEMPLO.TEST ',
        ahora,
      });

      expect(resultado).toEqual({
        negocioId: expect.any(Number),
        administradorId: expect.any(Number),
        licenciaId: expect.any(Number),
        codigo: expect.any(String),
        expiraEn: new Date('2026-09-14T16:00:00.000Z'),
      });
      await expect(primera.getRepository(Negocio).findOneByOrFail({ id: resultado.negocioId }))
        .resolves.toMatchObject({
          nombre: 'Clínica del Centro',
          slug: 'clinica-centro',
          emailContacto: 'admin@ejemplo.test',
          telefonoContacto: null,
          activadoEn: null,
        });
      await expect(primera.getRepository(Usuario).findOneByOrFail({ id: resultado.administradorId }))
        .resolves.toMatchObject({
          negocioId: resultado.negocioId,
          email: 'admin@ejemplo.test',
          rol: Rol.ADMIN_NEGOCIO,
          nombre: null,
          passwordHash: null,
          activo: true,
          activadoEn: null,
        });
      await expect(primera.getRepository(Licencia).findOneByOrFail({ id: resultado.licenciaId }))
        .resolves.toMatchObject({
          negocioId: resultado.negocioId,
          habilitadaEn: null,
          venceEn: null,
          suspendidaEn: null,
        });
      await expect(primera.getRepository(CodigoAcceso).findOneByOrFail({
        usuarioId: resultado.administradorId,
        proposito: PropositoCodigoAcceso.ACTIVACION_ADMIN,
      })).resolves.toMatchObject({ negocioId: resultado.negocioId });

      const eventos = await primera.getRepository(EventoAuditoria).find({
        where: { negocioId: resultado.negocioId },
        order: { id: 'ASC' },
      });
      expect(eventos.map(({ accion }) => accion)).toEqual([
        'codigo_emitido',
        'negocio_creado',
      ]);
      expect(eventos.every(({ actorUsuarioId }) => actorUsuarioId === actor.id)).toBe(true);
      expect(JSON.stringify(eventos)).not.toContain(resultado.codigo);
      expect(JSON.stringify(eventos)).not.toContain('password');
    });
  });

  it.each([
    ['identificador', { identificadorPublico: 'negocio-existente', emailAdministrador: 'otro@example.test' }],
    ['correo', { identificadorPublico: 'otro-negocio', emailAdministrador: 'existente@example.test' }],
  ])('rechaza el %s duplicado sin dejar un alta parcial', async (_caso, duplicado) => {
    await conBaseMigrada(async (primera) => {
      const actor = await crearSuperadmin(primera);
      const servicio = construirServicio(primera);
      const base = {
        actorUsuarioId: actor.id,
        nombre: 'Negocio existente',
        identificadorPublico: 'negocio-existente',
        emailAdministrador: 'existente@example.test',
        ahora: new Date('2026-09-12T17:00:00.000Z'),
      };
      await servicio.crearNegocio(base);
      const cantidadesAntes = await Promise.all([
        primera.getRepository(Negocio).count(),
        primera.getRepository(Usuario).count(),
        primera.getRepository(Licencia).count(),
        primera.getRepository(CodigoAcceso).count(),
        primera.getRepository(EventoAuditoria).count(),
      ]);

      await expect(servicio.crearNegocio({
        ...base,
        ...duplicado,
        nombre: 'Intento duplicado',
      })).rejects.toBeInstanceOf(ConflictException);
      await expect(Promise.all([
        primera.getRepository(Negocio).count(),
        primera.getRepository(Usuario).count(),
        primera.getRepository(Licencia).count(),
        primera.getRepository(CodigoAcceso).count(),
        primera.getRepository(EventoAuditoria).count(),
      ])).resolves.toEqual(cantidadesAntes);
    });
  });

  it('revierte todas las filas si falla la auditoría', async () => {
    await conBaseMigrada(async (primera) => {
      const actor = await crearSuperadmin(primera);
      const datos = {
        actorUsuarioId: actor.id,
        nombre: 'Alta revertida',
        identificadorPublico: 'alta-revertida',
        emailAdministrador: 'revertida@example.test',
        ahora: new Date('2026-09-12T18:00:00.000Z'),
      };
      const auditoriaFallida = {
        registrar: jest.fn().mockRejectedValue(new Error('auditoría no disponible')),
      } as unknown as AuditoriaService;
      await expect(construirServicio(primera, auditoriaFallida).crearNegocio(datos))
        .rejects.toThrow('auditoría no disponible');
      expect(await primera.getRepository(Negocio).count()).toBe(0);
    });
  });

  it('consulta el rol actual y deniega el alta a un administrador de negocio', async () => {
    await conBaseMigrada(async (primera) => {
      const negocio = await primera.getRepository(Negocio).save(Object.assign(new Negocio(), {
        nombre: 'Tenant existente',
        slug: 'tenant-existente',
        emailContacto: 'tenant@example.test',
        telefonoContacto: null,
        activadoEn: null,
      }));
      const administrador = await primera.getRepository(Usuario).save(Object.assign(new Usuario(), {
        negocioId: negocio.id,
        negocio,
        nombre: null,
        email: 'admin-tenant@example.test',
        passwordHash: null,
        rol: Rol.ADMIN_NEGOCIO,
        activo: true,
        activadoEn: null,
      }));
      const cantidadesAntes = await Promise.all([
        primera.getRepository(Negocio).count(),
        primera.getRepository(Usuario).count(),
      ]);

      await expect(construirServicio(primera).crearNegocio({
        actorUsuarioId: administrador.id,
        nombre: 'Alta no autorizada',
        identificadorPublico: 'alta-no-autorizada',
        emailAdministrador: 'otro-admin@example.test',
        ahora: new Date('2026-09-12T19:00:00.000Z'),
      })).rejects.toBeInstanceOf(ForbiddenException);
      await expect(Promise.all([
        primera.getRepository(Negocio).count(),
        primera.getRepository(Usuario).count(),
      ])).resolves.toEqual(cantidadesAntes);
    });
  });
});
