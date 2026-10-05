import { ConflictException } from '@nestjs/common';
import type { EntityManager } from 'typeorm';

export type RecursoEliminable = 'sucursal' | 'servicio' | 'profesional';

interface Relacion { tabla: string; columna: string; etiqueta: string }

// Solo tablas ya instaladas por migraciones; futuras citas añadirán su relación aquí.
const RELACIONES: Record<RecursoEliminable, Relacion[]> = {
  sucursal: [
    { tabla: 'personal_sucursales', columna: 'sucursal_id', etiqueta: 'asignaciones' },
    { tabla: 'horarios_personal', columna: 'sucursal_id', etiqueta: 'horarios' },
    { tabla: 'excepciones_horario', columna: 'sucursal_id', etiqueta: 'excepciones' },
    { tabla: 'bloqueos_horario', columna: 'sucursal_id', etiqueta: 'bloqueos' },
  ],
  servicio: [
    { tabla: 'personal_servicios', columna: 'servicio_id', etiqueta: 'selecciones' },
  ],
  profesional: [
    { tabla: 'personal_sucursales', columna: 'personal_id', etiqueta: 'asignaciones' },
    { tabla: 'personal_servicios', columna: 'personal_id', etiqueta: 'servicios' },
    { tabla: 'horarios_personal', columna: 'personal_id', etiqueta: 'horarios' },
    { tabla: 'excepciones_horario', columna: 'personal_id', etiqueta: 'excepciones' },
    { tabla: 'bloqueos_horario', columna: 'personal_id', etiqueta: 'bloqueos' },
  ],
};

const ACCION_ALTA: Record<RecursoEliminable, string> = {
  sucursal: 'sucursal_creada', servicio: 'servicio_creado',
  profesional: 'profesional_creado',
};

/** La auditoría técnica de alta no es uso operativo y nunca se borra para habilitar una baja. */
export async function exigirEliminacionElegible(manager: EntityManager,
  tipo: RecursoEliminable, negocioId: number, recursoId: number,
  usuarioId?: number): Promise<void> {
  for (const relacion of RELACIONES[tipo]) {
    // FOR UPDATE usa lectura actual tras el bloqueo del padre; evita snapshots obsoletos.
    const filas = await manager.query(`SELECT 1 FROM ${relacion.tabla}
      WHERE negocio_id = ? AND ${relacion.columna} = ? LIMIT 1 FOR UPDATE`,
    [negocioId, recursoId]);
    if (filas.length) throw new ConflictException(
      `El registro tiene ${relacion.etiqueta}; puedes desactivarlo.`);
  }
  const historial = await manager.query(`SELECT 1 FROM eventos_auditoria
    WHERE negocio_id = ? AND recurso_tipo = ? AND recurso_id = ? AND accion <> ?
    LIMIT 1 FOR UPDATE`, [negocioId, tipo, recursoId, ACCION_ALTA[tipo]]);
  if (historial.length) throw new ConflictException(
    'El registro tiene historial operativo; puedes desactivarlo.');
  if (tipo === 'sucursal' || tipo === 'servicio') {
    const accion = tipo === 'sucursal' ? 'profesional_sucursales_modificadas' :
      'profesional_servicios_modificados';
    const ruta = tipo === 'sucursal' ? '$.sucursalIds' : '$.servicioIds';
    // La relación pudo retirarse: las instantáneas antes/después prueban uso previo.
    const usoAnterior = await manager.query(`SELECT 1 FROM eventos_auditoria
      WHERE negocio_id = ? AND accion = ? AND
        (JSON_CONTAINS(valores_antes, ?, ?) = 1 OR
         JSON_CONTAINS(valores_despues, ?, ?) = 1)
      LIMIT 1 FOR UPDATE`,
    [negocioId, accion, String(recursoId), ruta, String(recursoId), ruta]);
    if (usoAnterior.length) throw new ConflictException(
      'El registro tiene uso histórico; puedes desactivarlo.');
  }
  if (tipo !== 'profesional' || usuarioId === undefined) return;
  const relacionesCuenta = [
    ['bloqueos_horario', 'creador_usuario_id'], ['sesiones', 'usuario_id'],
    ['codigos_acceso', 'usuario_id'], ['codigos_acceso', 'emisor_usuario_id'],
  ] as const;
  for (const [tabla, columna] of relacionesCuenta) {
    const filas = await manager.query(`SELECT 1 FROM ${tabla} WHERE ${columna} = ?
      LIMIT 1 FOR UPDATE`, [usuarioId]);
    if (filas.length) throw new ConflictException(
      'La cuenta tiene relaciones o historial; puedes desactivar al Profesional.');
  }
  const auditoriaCuenta = await manager.query(`SELECT 1 FROM eventos_auditoria
    WHERE actor_usuario_id = ? OR (usuario_id = ? AND NOT
      (negocio_id = ? AND recurso_tipo = 'profesional' AND recurso_id = ?
        AND accion = 'profesional_creado')) LIMIT 1 FOR UPDATE`,
  [usuarioId, usuarioId, negocioId, recursoId]);
  if (auditoriaCuenta.length) throw new ConflictException(
    'La cuenta tiene auditoría operativa; puedes desactivar al Profesional.');
}

/** Traduce una carrera de FK a conflicto de dominio sin dejar auditoría parcial. */
export function conflictoEliminacion(error: unknown): never {
  const codigo = (error as { driverError?: { code?: string } }).driverError?.code;
  if (codigo === 'ER_ROW_IS_REFERENCED_2' || codigo === 'ER_NO_REFERENCED_ROW_2' ||
    codigo === 'ER_LOCK_DEADLOCK' || codigo === 'ER_LOCK_WAIT_TIMEOUT') {
    throw new ConflictException('El registro recibió una relación; puedes desactivarlo.');
  }
  throw error;
}
