import { ConflictException } from '@nestjs/common';
import { DataSource } from 'typeorm';

export interface DiagnosticoCompatibilidadAla {
  apartadosAntiguosVigentes: number;
  horariosConDescanso: number;
  excepcionesHorario: number;
}

/** Lectura coherente y sin escrituras para decidir si se pueden activar las
 * reglas ALA. El llamador debe mantener cerrados los escritores durante el
 * despliegue: la comprobación no limpia ni interpreta datos históricos. */
export async function inspeccionarCompatibilidadAla(db: DataSource, ahora: Date):
  Promise<DiagnosticoCompatibilidadAla> {
  if (!(ahora instanceof Date) || !Number.isFinite(ahora.getTime())) {
    throw new TypeError('Instante de verificación inválido.');
  }
  return db.transaction('REPEATABLE READ', async (manager) => {
    const [apartados] = await manager.query(`SELECT COUNT(*) AS cantidad
      FROM bloqueos_temporales WHERE liberado_en IS NULL AND expira_en>?
      AND (version_reglas IS NULL OR modo_concesion IS NULL OR
        separacion_minutos IS NULL OR fin_ocupacion_utc IS NULL)`, [ahora]);
    const [horarios] = await manager.query(`SELECT COUNT(*) AS cantidad
      FROM horarios_personal WHERE activo=1 AND
      (descanso_inicio_minutos IS NOT NULL OR descanso_fin_minutos IS NOT NULL)`);
    const [excepciones] = await manager.query(
      'SELECT COUNT(*) AS cantidad FROM excepciones_horario');
    return { apartadosAntiguosVigentes: Number(apartados.cantidad),
      horariosConDescanso: Number(horarios.cantidad),
      excepcionesHorario: Number(excepciones.cantidad) };
  });
}

/** Impide abrir nuevas escrituras con un estado que el motor vigente no debe
 * reinterpretar. El detalle cuantitativo queda disponible para diagnóstico. */
export async function exigirCompatibilidadAla(db: DataSource, ahora: Date):
  Promise<void> {
  const diagnostico = await inspeccionarCompatibilidadAla(db, ahora);
  if (Object.values(diagnostico).some((cantidad) => cantidad > 0)) {
    throw new ConflictException('Datos históricos requieren transición antes de habilitar reservas.');
  }
}
