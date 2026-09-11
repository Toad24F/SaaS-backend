import { randomUUID } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { Rol } from '../../src/auth/enums/rol.enum';
import { Negocio } from '../../src/negocios/entities/negocio.entity';
import { Licencia } from '../../src/licencias/entities/licencia.entity';
import { Usuario } from '../../src/usuarios/entities/usuario.entity';
import { RelojPrueba } from './reloj';

export const PASSWORD_PRUEBA = 'clave-exclusiva-de-pruebas';

export interface DatosNegocio {
  negocio: Negocio;
  licencia: Licencia;
  administrador: Usuario;
  recepcionista: Usuario;
  recepcionistaPendiente: Usuario;
}

export type EstadoLicenciaPrueba =
  | 'pendiente'
  | 'vigente'
  | 'vencida'
  | 'suspendida';

export type EscenariosLicencia = Record<EstadoLicenciaPrueba, DatosNegocio>;

// IDs sintéticos únicos en este contexto de pruebas, nunca para insertar en BD.
let siguienteId = 1;

function desplazar(fecha: Date, milisegundos: number): Date {
  return new Date(fecha.getTime() + milisegundos);
}

function fechasLicencia(estado: EstadoLicenciaPrueba, ahora: Date) {
  const dia = 24 * 60 * 60 * 1000;
  const anio = 365 * dia;
  if (estado === 'pendiente') {
    return { habilitadaEn: null, venceEn: null, suspendidaEn: null };
  }
  if (estado === 'vencida') {
    return {
      habilitadaEn: desplazar(ahora, -anio),
      venceEn: desplazar(ahora, -1),
      suspendidaEn: null,
    };
  }
  return {
    habilitadaEn: desplazar(ahora, -dia),
    venceEn: desplazar(ahora, anio),
    suspendidaEn: estado === 'suspendida' ? new Date(ahora) : null,
  };
}

/** Construye un tenant aislado con cuentas activadas/pendientes y licencia anual. */
function crearDatosNegocio(
  reloj: RelojPrueba,
  passwordHash: string,
  estadoLicencia: EstadoLicenciaPrueba,
): DatosNegocio {
  const referencia = randomUUID();
  const ahora = reloj.ahora();
  const activadoEn = estadoLicencia === 'pendiente' ? null : new Date(ahora);
  const negocio = Object.assign(new Negocio(), {
    id: siguienteId++, nombre: `Negocio ${referencia}`, slug: `negocio-${referencia}`,
    emailContacto: `contacto-${referencia}@example.test`, telefonoContacto: '6140000000',
    activadoEn, creadoEn: new Date(ahora),
  });
  const crearUsuario = (rol: Rol, activado: boolean): Usuario =>
    Object.assign(new Usuario(), {
      id: siguienteId++, negocioId: negocio.id, negocio,
      nombre: activado ? `Usuario ${rol}` : null,
      email: `${rol}-${randomUUID()}-${referencia}@example.test`,
      passwordHash: activado ? passwordHash : null,
      rol, activo: true,
      activadoEn: activado ? new Date(ahora) : null,
      creadoEn: new Date(ahora),
    });
  const fechas = fechasLicencia(estadoLicencia, ahora);
  const licencia = Object.assign(new Licencia(), {
    id: siguienteId++, negocioId: negocio.id, negocio,
    ...fechas,
    creadoEn: fechas.habilitadaEn
      ? new Date(fechas.habilitadaEn)
      : new Date(ahora),
    actualizadoEn: new Date(ahora),
  });
  return {
    negocio,
    licencia,
    administrador: crearUsuario(Rol.ADMIN_NEGOCIO, activadoEn !== null),
    recepcionista: crearUsuario(Rol.RECEPCIONISTA, activadoEn !== null),
    recepcionistaPendiente: crearUsuario(Rol.RECEPCIONISTA, false),
  };
}

/** Fixtures históricas de T06, ahora adaptadas al modelo vigente por T69. */
export async function crearDosNegocios(
  reloj: RelojPrueba,
): Promise<[DatosNegocio, DatosNegocio]> {
  // Coste reducido exclusivamente para pruebas. No configura bcrypt en producción.
  const passwordHash = await bcrypt.hash(PASSWORD_PRUEBA, 4);
  return [
    crearDatosNegocio(reloj, passwordHash, 'vigente'),
    crearDatosNegocio(reloj, passwordHash, 'vigente'),
  ];
}

/** Matriz reutilizable para políticas posteriores de acceso y licencia. */
export async function crearEscenariosLicencia(
  reloj: RelojPrueba,
): Promise<EscenariosLicencia> {
  const passwordHash = await bcrypt.hash(PASSWORD_PRUEBA, 4);
  return {
    pendiente: crearDatosNegocio(reloj, passwordHash, 'pendiente'),
    vigente: crearDatosNegocio(reloj, passwordHash, 'vigente'),
    vencida: crearDatosNegocio(reloj, passwordHash, 'vencida'),
    suspendida: crearDatosNegocio(reloj, passwordHash, 'suspendida'),
  };
}
