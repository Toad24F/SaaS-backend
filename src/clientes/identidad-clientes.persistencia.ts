import type { EntityManager } from 'typeorm';
import { normalizarNombreCliente } from './identidad-cliente';

interface FilaNombreCliente { id: number; nombre_completo: string }

/** Rellena la clave derivada por lotes, en la transacción de la migración. */
export async function rellenarIdentidadClientes(manager: EntityManager): Promise<void> {
  let ultimoId = 0;
  while (true) {
    const fichas: FilaNombreCliente[] = await manager.query(`
      SELECT id,nombre_completo FROM clientes WHERE id > ? ORDER BY id LIMIT 500 FOR UPDATE`, [ultimoId]);
    if (!fichas.length) return;
    for (const ficha of fichas) {
      const nombre = normalizarNombreCliente(ficha.nombre_completo);
      // Una ficha heredada sin identidad utilizable conserva su nombre y su vínculo histórico.
      await manager.query('UPDATE clientes SET nombre_normalizado=? WHERE id=?',
        [nombre ? Buffer.from(nombre) : null, ficha.id]);
    }
    ultimoId = fichas[fichas.length - 1].id;
  }
}

/** Diagnóstico interno para un negocio autorizado. Devuelve IDs, sin exponer contacto. */
export async function detectarDuplicadosClientes(manager: EntityManager, negocioId: number): Promise<number[][]> {
  const fichas: (FilaNombreCliente & { telefono: string })[] = await manager.query(`
    SELECT id,nombre_completo,telefono FROM clientes
    WHERE negocio_id=? AND fusionado_en_id IS NULL ORDER BY id`, [negocioId]);

  const grupos = new Map<string, number[]>();
  for (const ficha of fichas) {
    // Derivar desde el nombre actual también cubre altas y ediciones de escritores previos.
    const nombre = normalizarNombreCliente(ficha.nombre_completo);
    if (!nombre) continue;
    const clave = JSON.stringify([nombre, ficha.telefono]);
    const grupo = grupos.get(clave) ?? [];
    grupo.push(ficha.id);
    grupos.set(clave, grupo);
  }
  return [...grupos.values()].filter((grupo) => grupo.length > 1);
}
