import { Rol } from '../../src/auth/enums/rol.enum';
import { RelojPrueba } from './reloj';

export interface UsuarioPruebaModuloUno {
  id: number;
  negocioId: number | null;
  rol: Rol;
  nombre: string;
  correo: string;
  creadoEn: Date;
}

export interface RecursoPruebaModuloUno {
  id: number;
  negocioId: number;
  tipo: 'sucursal' | 'servicio' | 'horario' | 'bloqueo';
  nombre: string;
  usuarioId?: number;
}

export interface NegocioPruebaModuloUno {
  negocio: { id: number; nombre: string; slug: string; creadoEn: Date };
  usuarios: UsuarioPruebaModuloUno[];
  recursos: RecursoPruebaModuloUno[];
  invitacion?: { id: number; negocioId: number; correo: string; creadaEn: Date };
}

let siguienteId = 1;

/** Define datos aislados en memoria; las migraciones posteriores conectarán su persistencia. */
export function crearEscenarioModuloUno(reloj: RelojPrueba): {
  superadmin: UsuarioPruebaModuloUno;
  activo: NegocioPruebaModuloUno;
  pendiente: NegocioPruebaModuloUno;
} {
  const ahora = reloj.ahora();
  const id = () => siguienteId++;
  const marca = id();
  const negocio = (nombre: string): NegocioPruebaModuloUno => {
    const negocioId = id();
    return {
      negocio: { id: negocioId, nombre, slug: `${nombre.toLowerCase()}-${marca}`, creadoEn: new Date(ahora) },
      usuarios: [],
      recursos: ['sucursal', 'servicio', 'horario', 'bloqueo'].map((tipo) => ({
        id: id(), negocioId, tipo: tipo as RecursoPruebaModuloUno['tipo'], nombre: `${nombre} ${tipo}`,
      })),
    };
  };
  const activo = negocio('Activo');
  const pendiente = negocio('Pendiente');
  const usuario = (rol: Rol, negocioId: number | null): UsuarioPruebaModuloUno => ({
    id: id(), negocioId, rol, nombre: `Usuario ${rol}`,
    correo: `${rol}-${marca}-${negocioId ?? 'global'}@example.test`, creadoEn: new Date(ahora),
  });
  const superadmin = usuario(Rol.SUPERADMIN, null);
  activo.usuarios.push(usuario(Rol.ADMIN_NEGOCIO, activo.negocio.id));
  activo.usuarios.push(usuario(Rol.RECEPCIONISTA, activo.negocio.id));
  activo.usuarios.push(usuario(Rol.PROFESIONAL, activo.negocio.id));
  // La invitación pendiente no crea una cuenta administradora incompleta.
  pendiente.invitacion = {
    id: id(), negocioId: pendiente.negocio.id,
    correo: `administrador-${marca}@example.test`, creadaEn: new Date(ahora),
  };
  return { superadmin, activo, pendiente };
}
