/** Fuentes independientes: la ausencia de relación no equivale a un interruptor activo. */
export interface FuentesOferta {
  asignado: boolean;
  sucursalActiva: boolean;
  cuentaActiva: boolean;
  servicioActivo: boolean;
  // Las marcas separan una retirada recuperable de una simple desactivación.
  sucursalInhabilitada?: boolean;
  cuentaInhabilitada?: boolean;
  servicioInhabilitado?: boolean;
  seleccionGeneralActiva: boolean;
  atencionActiva: boolean;
  seleccionSucursalActiva: boolean;
}

export interface EstadoOferta {
  ofrecido: boolean;
  motivosExclusion: string[];
}

/** Misma decisión para consultas públicas y manuales; ambas exigen oferta física. */
export function derivarEstadoOferta(fuentes: FuentesOferta): EstadoOferta {
  const motivosExclusion: string[] = [];
  if (!fuentes.asignado) motivosExclusion.push('sucursal_no_asignada');
  if (fuentes.cuentaInhabilitada) motivosExclusion.push('cuenta_inhabilitada');
  else if (!fuentes.cuentaActiva) motivosExclusion.push('cuenta_inactiva');
  if (fuentes.sucursalInhabilitada) motivosExclusion.push('sucursal_inhabilitada');
  else if (!fuentes.sucursalActiva) motivosExclusion.push('sucursal_inactiva');
  if (fuentes.servicioInhabilitado) motivosExclusion.push('servicio_inhabilitado');
  else if (!fuentes.servicioActivo) motivosExclusion.push('servicio_inactivo');
  if (!fuentes.seleccionGeneralActiva) motivosExclusion.push('servicio_no_seleccionado');
  if (!fuentes.atencionActiva && fuentes.asignado) motivosExclusion.push('atencion_inactiva');
  if (!fuentes.seleccionSucursalActiva) {
    motivosExclusion.push('servicio_no_ofrecido_en_sucursal');
  }
  return { ofrecido: motivosExclusion.length === 0, motivosExclusion };
}
