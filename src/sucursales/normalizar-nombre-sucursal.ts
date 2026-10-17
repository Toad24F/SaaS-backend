/** Conserva el nombre visible y unifica espacios para evitar duplicados aparentes. */
export function normalizarNombreSucursal(nombre: string): string {
  return nombre.trim().replace(/\s+/g, ' ');
}

/** Reconoce la restricción específica de nombres de sucursales por negocio. */
export function esConflictoNombreSucursal(error: unknown): boolean {
  const detalle = error as {
    driverError?: { code?: string; sqlMessage?: string };
    code?: string;
    message?: string;
  };
  const codigo = detalle.driverError?.code ?? detalle.code;
  const mensaje = detalle.driverError?.sqlMessage ?? detalle.message ?? '';
  return codigo === 'ER_DUP_ENTRY' && mensaje.includes('uq_sucursales_negocio_nombre');
}
