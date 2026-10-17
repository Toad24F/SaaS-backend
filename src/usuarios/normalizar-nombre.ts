/** Conserva la forma visible, pero hace consistente la comparación de nombres. */
export function normalizarNombreUsuario(nombre: string): string {
  return nombre.trim().replace(/\s+/g, ' ');
}

export function esConflictoNombreUsuario(error: unknown): boolean {
  const detalle = error as { driverError?: { code?: string; sqlMessage?: string }; code?: string; message?: string };
  const codigo = detalle.driverError?.code ?? detalle.code;
  const mensaje = detalle.driverError?.sqlMessage ?? detalle.message ?? '';
  return codigo === 'ER_DUP_ENTRY' && mensaje.includes('uq_usuarios_negocio_nombre');
}
