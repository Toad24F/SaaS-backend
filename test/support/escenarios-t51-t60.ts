import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { ActivacionesService } from '../../src/altas/activaciones.service';
import { AltasService } from '../../src/altas/altas.service';
import { AuditoriaService } from '../../src/auditoria/auditoria.service';
import { Rol } from '../../src/auth/enums/rol.enum';
import { AutorizacionService } from '../../src/auth/services/autorizacion.service';
import { CredencialesService } from '../../src/auth/services/credenciales.service';
import { PoliticaContrasenasService } from '../../src/auth/services/politica-contrasenas.service';
import { SesionesService } from '../../src/auth/services/sesiones.service';
import { Sesion } from '../../src/auth/entities/sesion.entity';
import { CodigosService } from '../../src/codigos/codigos.service';
import { Licencia } from '../../src/licencias/entities/licencia.entity';
import { LicenciasService } from '../../src/licencias/licencias.service';
import { CalendarioLicenciasService } from '../../src/licencias/services/calendario-licencias.service';
import { PoliticaAccesoLicenciaService } from '../../src/licencias/services/politica-acceso-licencia.service';
import { Negocio } from '../../src/negocios/entities/negocio.entity';
import { Usuario } from '../../src/usuarios/entities/usuario.entity';

export const PASSWORD_T51_T60 = 'password-segura-t51';

/** Construye servicios reales vinculados a la conexión recibida, sin mocks de persistencia. */
export function servicios(db: DataSource, auditoria = new AuditoriaService()) {
  const politica = new PoliticaContrasenasService();
  const codigos = new CodigosService(auditoria);
  const autorizacion = new AutorizacionService();
  const calendario = new CalendarioLicenciasService();
  const sesiones = new SesionesService(db.getRepository(Sesion));
  return {
    auditoria, codigos, sesiones,
    altas: new AltasService(db.getRepository(Negocio), autorizacion, codigos, auditoria),
    activaciones: new ActivacionesService(db.getRepository(Usuario), codigos, politica,
      new PoliticaAccesoLicenciaService(), calendario, auditoria),
    credenciales: new CredencialesService(db.getRepository(Usuario), codigos, autorizacion,
      politica, sesiones, auditoria),
    licencias: new LicenciasService(db.getRepository(Licencia), autorizacion, calendario, auditoria),
  };
}

/** Fecha posterior a creado_en de los datos de prueba, incluso si MariaDB redondea micros. */
export function fechaSegura(): Date {
  return new Date(Date.now() + 120_000);
}

export async function crearSuperadmin(db: DataSource, ahora = fechaSegura()) {
  return db.getRepository(Usuario).save({
    negocioId: null, nombre: 'Superadmin', email: `${randomUUID()}@example.test`,
    passwordHash: await new PoliticaContrasenasService().generarHash(PASSWORD_T51_T60),
    rol: Rol.SUPERADMIN, activo: true, activadoEn: ahora,
  });
}

/** Alta pendiente por el caso de uso real: licencia y administrador nacen sin vigencia. */
export async function crearPendiente(db: DataSource, actorId: number, ahora = fechaSegura()) {
  const alta = await servicios(db).altas.crearNegocio({
    actorUsuarioId: actorId, nombre: `Negocio ${randomUUID()}`,
    identificadorPublico: `negocio-${randomUUID()}`,
    emailAdministrador: `${randomUUID()}@example.test`, ahora,
  });
  return { ...alta, ahora };
}

/** Reutiliza el flujo de activación para preparar una licencia anual válida. */
export async function crearActivo(db: DataSource, actorId: number, ahora = fechaSegura()) {
  const pendiente = await crearPendiente(db, actorId, ahora);
  await servicios(db).activaciones.activarAdministrador({
    codigo: pendiente.codigo, nombre: 'Administrador', password: PASSWORD_T51_T60,
    ahora: new Date(ahora.getTime() + 1000),
  });
  return {
    ...pendiente,
    administrador: await db.getRepository(Usuario).findOneByOrFail({ id: pendiente.administradorId }),
    licencia: await db.getRepository(Licencia).findOneByOrFail({ id: pendiente.licenciaId }),
  };
}
