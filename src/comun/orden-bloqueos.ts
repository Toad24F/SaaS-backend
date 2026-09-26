export type TipoRecursoBloqueo =
  | 'correo' | 'alta' | 'usuario' | 'codigo' | 'negocio' | 'licencia'
  | 'sucursal' | 'servicio' | 'perfil';

export type RecursoBloqueo =
  | { tipo: 'correo'; clave: string }
  | { tipo: Exclude<TipoRecursoBloqueo, 'correo'>; id: number };

// Toda operación que combine recursos debe adquirirlos en esta precedencia.
const prioridad: Readonly<Record<TipoRecursoBloqueo, number>> = {
  correo: 0,
  alta: 1,
  usuario: 2,
  codigo: 3,
  negocio: 4,
  licencia: 5,
  sucursal: 6,
  servicio: 7,
  perfil: 8,
};

/** Normaliza, deduplica y ordena las claves antes de pedir bloqueos a la BD. */
export function ordenarRecursosBloqueo(recursos: readonly RecursoBloqueo[]): RecursoBloqueo[] {
  const unicos = new Map<string, RecursoBloqueo>();
  for (const recurso of recursos) {
    if (recurso.tipo === 'correo') {// Valida que el correo no esté vacío y lo normaliza a minúsculas.
      const clave = recurso.clave.trim().toLowerCase();
      if (!clave) throw new Error('La clave de correo no puede estar vacía.');
      unicos.set(`correo:${clave}`, { tipo: 'correo', clave });
      continue;
    }
    if (!Number.isSafeInteger(recurso.id) || recurso.id <= 0) {//valida que el id sea un entero positivo seguro.
      throw new Error('El ID del recurso debe ser un entero positivo seguro.');
    }
    unicos.set(`${recurso.tipo}:${recurso.id}`, { tipo: recurso.tipo, id: recurso.id });// Usa el tipo y el id como clave única para recursos no correo.
  }
  return [...unicos.values()].sort((a, b) => {// Ordena primero por prioridad de tipo, luego por clave para correos y finalmente por id para otros tipos.
    const diferencia = prioridad[a.tipo] - prioridad[b.tipo];
    if (diferencia !== 0) return diferencia;// Si los tipos son diferentes, ordena por prioridad.
    if (a.tipo === 'correo' && b.tipo === 'correo') {// Si ambos son correos, ordena por clave.
      return a.clave < b.clave ? -1 : a.clave > b.clave ? 1 : 0;
    }
    if (a.tipo !== 'correo' && b.tipo !== 'correo') return a.id - b.id;// Si ambos son del mismo tipo no correo, ordena por id.
    return 0;
  });
}
