import type { DataSource } from 'typeorm';
import { AltasService } from '../../src/altas/altas.service';
import { ActivacionesService } from '../../src/altas/activaciones.service';
import { ReservaCorreoService } from '../../src/altas/reserva-correo.service';
import { AuditoriaService } from '../../src/auditoria/auditoria.service';
import { AutorizacionService } from '../../src/auth/services/autorizacion.service';
import { PoliticaContrasenasService } from '../../src/auth/services/politica-contrasenas.service';
import { CredencialesService } from '../../src/auth/services/credenciales.service';
import { SesionesService } from '../../src/auth/services/sesiones.service';
import { Sesion } from '../../src/auth/entities/sesion.entity';
import { CodigosService } from '../../src/codigos/codigos.service';
import { DerivadorCodigo } from '../../src/codigos/derivador-codigo';
import { BandejaCorreoService } from '../../src/correos/bandeja-correo.service';
import { Negocio } from '../../src/negocios/entities/negocio.entity';
import { Usuario } from '../../src/usuarios/entities/usuario.entity';
import { Rol } from '../../src/auth/enums/rol.enum';
import { CalendarioLicenciasService } from '../../src/licencias/services/calendario-licencias.service';
import { PoliticaAccesoLicenciaService } from '../../src/licencias/services/politica-acceso-licencia.service';

export const clavePrueba = 'clave-aislada-integracion-t040-t044-123456789';
export const derivadorPrueba = new DerivadorCodigo({ 1: clavePrueba }, 1);
export const passwordPrueba = 'password-segura-fase-2';
export function serviciosInvitacion(db: DataSource) {
  const auditoria = new AuditoriaService();
  const codigos = new CodigosService(auditoria, derivadorPrueba);
  const contrasenas = new PoliticaContrasenasService();
  const autorizacion = new AutorizacionService();
  return { codigos,
    altas: new AltasService(db.getRepository(Negocio), autorizacion, codigos, auditoria,
      new ReservaCorreoService(), new BandejaCorreoService()),
    activaciones: new ActivacionesService(db.getRepository(Usuario), codigos, contrasenas,
      new PoliticaAccesoLicenciaService(), new CalendarioLicenciasService(), auditoria),
    credenciales: new CredencialesService(db.getRepository(Usuario), codigos, autorizacion,
      contrasenas, new SesionesService(db.getRepository(Sesion)), auditoria),
  };
}
// Solo las fixtures reconstruyen valores para simular al destinatario; nunca la API.
export async function reconstruirCodigo(db: DataSource, id?: string) {
  const [codigo] = id ? await db.query('SELECT * FROM codigos_acceso WHERE id = ?', [id]) :
    await db.query('SELECT * FROM codigos_acceso ORDER BY id DESC LIMIT 1');
  return derivadorPrueba.derivar({ emisionId: codigo.emision_id, nonce: codigo.nonce,
    claveVersion: codigo.clave_version, proposito: codigo.proposito, negocioId: codigo.negocio_id,
    destinatarioTipo: codigo.alta_administrador_id === null ? 'usuario' : 'alta',
    destinatarioId: codigo.alta_administrador_id ?? codigo.usuario_id,
    destinatarioVersion: codigo.destinatario_version, correo: codigo.correo_destinatario });
}
export async function prepararInvitacion(db: DataSource) {
  const ahora = new Date(Date.now() + 120000);
  const actor = await db.getRepository(Usuario).save({ negocioId: null, nombre: 'Super',
    email: 'super@example.test', passwordHash: 'hash-test', rol: Rol.SUPERADMIN, activo: true, activadoEn: ahora });
  const servicios = serviciosInvitacion(db);
  const alta = await servicios.altas.crearNegocio({ actorUsuarioId: actor.id, nombre: 'Uno', rfc: 'ABC010101AB1',
    identificadorPublico: 'uno', emailAdministrador: 'admin@example.test', ahora });
  const activar = { codigo: await reconstruirCodigo(db), correo: 'admin@example.test',
    nombre: 'Administrador', password: passwordPrueba, ahora: new Date(ahora.getTime() + 1000) };
  return { ...servicios, actor, alta, activar,
    gestionar: { actorUsuarioId: actor.id, negocioId: alta.negocioId, ahora: activar.ahora } };
}
export async function estadoIdentidad(db: DataSource) {
  const tablas = ['negocios', 'usuarios', 'licencias', 'altas_administrador', 'correos_acceso',
    'codigos_acceso', 'envios_correo', 'eventos_auditoria', 'sesiones'];
  const filas = await Promise.all(tablas.map((tabla) => db.query(`SELECT * FROM ${tabla} ORDER BY id`)));
  return Object.fromEntries(tablas.map((tabla, i) => [tabla, filas[i]]));
}
