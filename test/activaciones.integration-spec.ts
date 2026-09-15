import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { ActivacionesService } from '../src/altas/activaciones.service';
import { AuditoriaService } from '../src/auditoria/auditoria.service';
import { Rol } from '../src/auth/enums/rol.enum';
import { PoliticaContrasenasService } from '../src/auth/services/politica-contrasenas.service';
import { CodigosService } from '../src/codigos/codigos.service';
import { PropositoCodigoAcceso } from '../src/codigos/entities/codigo-acceso.entity';
import { Licencia } from '../src/licencias/entities/licencia.entity';
import { CalendarioLicenciasService } from '../src/licencias/services/calendario-licencias.service';
import { PoliticaAccesoLicenciaService } from '../src/licencias/services/politica-acceso-licencia.service';
import { Negocio } from '../src/negocios/entities/negocio.entity';
import { Usuario } from '../src/usuarios/entities/usuario.entity';
import { conBaseMigrada } from './support/mariadb';

async function preparar(dataSource: DataSource) {
  const negocio = await dataSource.getRepository(Negocio).save(Object.assign(new Negocio(), {
    nombre: 'Activaciones', slug: `activaciones-${randomUUID()}`,
    emailContacto: `${randomUUID()}@example.test`, telefonoContacto: null, activadoEn: null,
  }));
  const emisor = await dataSource.getRepository(Usuario).save(Object.assign(new Usuario(), {
    negocioId: null, negocio: null, nombre: 'Superadmin', email: `${randomUUID()}@example.test`,
    passwordHash: 'hash-de-prueba', rol: Rol.SUPERADMIN, activo: true,
    activadoEn: new Date(Date.now() + 60_000),
  }));
  const usuario = await dataSource.getRepository(Usuario).save(Object.assign(new Usuario(), {
    negocioId: negocio.id, negocio, nombre: null, email: `${randomUUID()}@example.test`,
    passwordHash: null, rol: Rol.ADMIN_NEGOCIO, activo: true, activadoEn: null,
  }));
  const licencia = await dataSource.getRepository(Licencia).save(Object.assign(new Licencia(), {
    negocioId: negocio.id, negocio, habilitadaEn: null, venceEn: null, suspendidaEn: null,
  }));
  const ahora = new Date(Math.max(negocio.creadoEn.getTime(), usuario.creadoEn.getTime(), licencia.creadoEn.getTime()) + 1000);
  const codigos = new CodigosService(new AuditoriaService());
  const emitido = await dataSource.transaction((manager) => codigos.emitir(manager, {
    negocioId: negocio.id, usuarioId: usuario.id, emisorUsuarioId: emisor.id,
    proposito: PropositoCodigoAcceso.ACTIVACION_ADMIN,
    ahora,
  }));
  const servicio = new ActivacionesService(
    dataSource.getRepository(Usuario), codigos, new PoliticaContrasenasService(),
    new PoliticaAccesoLicenciaService(), new CalendarioLicenciasService(), new AuditoriaService(),
  );
  return { negocio, usuario, licencia, ahora, emitido, servicio };
}

describe('Activaciones T33–T34', () => {
  it('activa administrador, negocio y año calendario en la transacción del código', async () => {
    await conBaseMigrada(async (primera) => {
      const { negocio, usuario, licencia, ahora, emitido, servicio } = await preparar(primera);
      await servicio.activarAdministrador({ codigo: emitido.codigo, nombre: '  Ada Admin  ', password: 'contraseña-segura', ahora });
      expect(await primera.getRepository(Usuario).findOneByOrFail({ id: usuario.id }))
        .toMatchObject({ nombre: 'Ada Admin', activadoEn: ahora, rol: Rol.ADMIN_NEGOCIO });
      expect(await primera.getRepository(Negocio).findOneByOrFail({ id: negocio.id }))
        .toMatchObject({ activadoEn: ahora });
      expect(await primera.getRepository(Licencia).findOneByOrFail({ id: licencia.id }))
        .toMatchObject({ habilitadaEn: ahora, venceEn: new CalendarioLicenciasService().sumarAnios(ahora) });
    });
  });

  it('impide activar al administrador si la licencia fue suspendida y deja el código disponible', async () => {
    await conBaseMigrada(async (primera) => {
      const { usuario, licencia, ahora, emitido, servicio } = await preparar(primera);
      await primera.getRepository(Licencia).update(licencia.id, { suspendidaEn: ahora });
      await expect(servicio.activarAdministrador({
        codigo: emitido.codigo, nombre: 'Admin', password: 'contraseña-segura', ahora,
      })).rejects.toBeInstanceOf(BadRequestException);
      expect((await primera.getRepository(Usuario).findOneByOrFail({ id: usuario.id })).activadoEn).toBeNull();
    });
  });

});
