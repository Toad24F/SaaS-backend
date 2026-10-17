/** Conserva una forma visible estable para comparar nombres dentro del negocio. */
export function normalizarNombreServicio(nombre: string): string {
  return nombre.trim().replace(/\s+/g, ' ');
}

/** Identifica únicamente la restricción de nombre del catálogo de Servicios. */
export function esConflictoNombreServicio(error: unknown): boolean {
  const detalle = error as {
    driverError?: { code?: string; sqlMessage?: string };
    code?: string;
    message?: string;
  };
  const codigo = detalle.driverError?.code ?? detalle.code;
  const mensaje = detalle.driverError?.sqlMessage ?? detalle.message ?? '';
  return codigo === 'ER_DUP_ENTRY' && mensaje.includes('uq_servicios_negocio_nombre');
}
