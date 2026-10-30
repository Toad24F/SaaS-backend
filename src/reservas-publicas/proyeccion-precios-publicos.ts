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
