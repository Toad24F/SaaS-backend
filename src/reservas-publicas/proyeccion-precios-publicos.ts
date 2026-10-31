/** Campos monetarios conocidos del contrato público; no se sustituyen por null o cero. */
const IMPORTES = new Set(['costo', 'costoAceptado', 'costoFijado', 'precio',
  'precioFinal', 'precioTotal', 'importe', 'importeTotal', 'monto',
  'montoTotal', 'subtotal', 'total', 'totalPagar']);

/** Crea otra estructura para no alterar el resumen histórico ni sus objetos anidados. */
export function proyectarPreciosPublicos<T>(resultado: T, mostrarPreciosPublicos: boolean): T {
  if (Array.isArray(resultado)) {
    return resultado.map((valor) => proyectarPreciosPublicos(valor,
      mostrarPreciosPublicos)) as T;
  }
  if (resultado === null || typeof resultado !== 'object' || resultado instanceof Date) {
    return resultado;
  }
  return Object.fromEntries(Object.entries(resultado).filter(([clave]) =>
    mostrarPreciosPublicos || !IMPORTES.has(clave)).map(([clave, valor]) =>
    [clave, proyectarPreciosPublicos(valor, mostrarPreciosPublicos)])) as T;
}

/** El nombre público es neutral: un costo fijado nunca afirma que el cliente
 * haya visto o aceptado el importe cuando se concedió su apartado. */
export function proyectarCostoPublico<T>(resultado: T, mostrarPreciosPublicos: boolean): T {
  const copia = proyectarPreciosPublicos(resultado, mostrarPreciosPublicos);
  if (!mostrarPreciosPublicos) return copia;
  if (Array.isArray(copia)) {
    return copia.map((valor) => proyectarCostoPublico(valor, true)) as T;
  }
  if (copia === null || typeof copia !== 'object' || copia instanceof Date) return copia;
  return Object.fromEntries(Object.entries(copia).map(([clave, valor]) =>
    [clave === 'costoAceptado' ? 'costo' : clave,
      proyectarCostoPublico(valor, true)])) as T;
}
