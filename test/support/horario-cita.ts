import { Rol } from '../../src/auth/enums/rol.enum';
import { prepararEstado } from './estado-cita';
import type { EscenarioManualHttp } from './cita-manual';

export const DESTINO_HORARIO = { fechaLocal: '2026-11-09', horaInicio: '09:20', version: 1 };

/** Cada aceptación parte de una cita creada por el escritor real, con su folio y evento de alta. */
export async function prepararMovimiento(f: EscenarioManualHttp, rol = Rol.ADMIN_NEGOCIO) {
  const m = await prepararEstado(f, rol);
  return { ...m, ruta: `/citas/${m.cita.id}/horario` };
}
