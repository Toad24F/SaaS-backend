import { Injectable } from '@nestjs/common';
import { intervaloBloqueo } from '../bloqueos/calculo-bloqueos';
import type { DatosBloqueo } from '../bloqueos/validar-bloqueo';
import type { ContextoCalculoDisponibilidad } from './contexto-disponibilidad.service';

export interface BloqueoAplicable {
  id: number;
  inicio: Date;
  fin: Date;
}

/** Lee bloqueos del mismo tenant y convierte cada uno a UTC en la zona de la sede. */
@Injectable()
export class BloqueosAplicablesService {
  async consultar(contexto: ContextoCalculoDisponibilidad, sucursalId: number,
    desde: string, hasta: string, zonaHoraria: string): Promise<BloqueoAplicable[]> {
    const { manager, negocioId, personalId } = contexto;
    if (!manager.queryRunner?.isTransactionActive) {
      throw new Error('La lectura de bloqueos requiere una transacción activa.');
    }
    // Null representa equipo o todas las sedes; se aplican las cuatro combinaciones.
    // DATE_FORMAT conserva el día civil guardado; mysql2 puede hidratar DATE con desfase.
    const filas: (Pick<DatosBloqueo,
      'fechaInicio' | 'fechaFin' | 'inicioMinutos' | 'finMinutos'> &
      { id: number })[] = await manager.query(`
      SELECT id, DATE_FORMAT(fecha_inicio, '%Y-%m-%d') fechaInicio,
        DATE_FORMAT(fecha_fin, '%Y-%m-%d') fechaFin,
        inicio_minutos inicioMinutos, fin_minutos finMinutos
      FROM bloqueos_horario
      WHERE negocio_id=? AND (personal_id IS NULL OR personal_id=?)
        AND (sucursal_id IS NULL OR sucursal_id=?)
        AND fecha_inicio<=? AND fecha_fin>=? ORDER BY id`,
    [negocioId, personalId, sucursalId, hasta, desde]);
    return filas.map((fila) => ({ id: fila.id, ...intervaloBloqueo(fila, zonaHoraria) }));
  }
}
