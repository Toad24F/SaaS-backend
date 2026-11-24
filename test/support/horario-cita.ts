import { Rol } from '../../src/auth/enums/rol.enum';
import { prepararEstado } from './estado-cita';
import type { EscenarioManualHttp } from './cita-manual';

export const DESTINO_HORARIO = { fechaLocal: '2026-11-09', horaInicio: '09:20', version: 1 };

/** Cada aceptación parte del ID devuelto por el escritor real y del evento de alta persistido. */
export async function prepararMovimiento(f: EscenarioManualHttp, rol = Rol.ADMIN_NEGOCIO) {
  const m = await prepararEstado(f, rol);
  return { ...m, ruta: `/citas/${m.cita.id}/horario` };
}
