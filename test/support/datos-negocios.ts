import { randomUUID } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { Rol } from '../../src/auth/enums/rol.enum';
import { EstadoNegocio, Negocio } from '../../src/usuarios/entities/negocio.entity';
import { Usuario } from '../../src/usuarios/entities/usuario.entity';
import { RelojPrueba } from './reloj';

export const PASSWORD_PRUEBA = 'clave-exclusiva-de-pruebas';

export interface DatosNegocio {
  negocio: Negocio;
  administrador: Usuario;
  recepcionista: Usuario;
}

// IDs sintéticos únicos en este contexto de pruebas, nunca para insertar en BD.
let siguienteId = 1;

/** Fixtures en memoria que representan las entidades actuales, sin persistencia. */
export async function crearDosNegocios(reloj: RelojPrueba): Promise<[DatosNegocio, DatosNegocio]> {
  // Coste reducido exclusivamente para pruebas. No configura bcrypt en producción.
  const passwordHash = await bcrypt.hash(PASSWORD_PRUEBA, 4);
  const crear = (): DatosNegocio => {
    const referencia = randomUUID();
    const negocio = Object.assign(new Negocio(), {
      id: siguienteId++, nombre: `Negocio ${referencia}`, slug: `negocio-${referencia}`,
      emailContacto: `contacto-${referencia}@example.test`, telefonoContacto: '6140000000',
      estado: EstadoNegocio.ACTIVO, creadoEn: reloj.ahora(),
    });
    const crearUsuario = (rol: Rol): Usuario => Object.assign(new Usuario(), {
      id: siguienteId++, negocioId: negocio.id, negocio,
      nombre: `Usuario ${rol}`, email: `${rol}-${referencia}@example.test`,
      passwordHash, rol, activo: true, creadoEn: reloj.ahora(),
    });
    return {
      negocio,
      administrador: crearUsuario(Rol.ADMIN_NEGOCIO),
      recepcionista: crearUsuario(Rol.RECEPCIONISTA),
    };
  };
  return [crear(), crear()];
}
