import { randomUUID } from 'node:crypto';
import { Rol } from '../../src/auth/enums/rol.enum';
import { IntentosCitaManualService } from '../../src/citas/intentos-cita-manual.service';
import { RegistroCitaManualService } from '../../src/citas/registro-cita-manual.service';
import { OcupacionesService } from '../../src/disponibilidad/ocupaciones.service';
import { prepararManual, type EscenarioManualHttp } from './cita-manual';

/** Las citas de aceptación nacen del escritor real con su contacto, snapshot y evento inicial. */
export async function prepararEstado(f: EscenarioManualHttp, rol = Rol.ADMIN_NEGOCIO) {
  const m = await prepararManual(f, rol);
  const clave = randomUUID();
  await f.app.get(IntentosCitaManualService).preparar(m.identidad, clave, m.seleccion);
  const cita = await f.app.get(RegistroCitaManualService).registrar(m.identidad, clave, m.seleccion);
  return { ...m, cita, ruta: `/citas/${cita.id}/estado` };
}

/** Se consulta el lector real: cambiar un estado no debe borrar ni modificar el intervalo protegido. */
export async function ocupacionesEstado(f: EscenarioManualHttp, cita: { personalId: number; inicioUtc: string; finOcupacionUtc: string }) {
  return f.db.transaction('READ COMMITTED', (manager) => f.app.get(OcupacionesService).consultar({ manager,
    negocioId: f.negocios[0].id, personalId: cita.personalId, ahora: f.reloj.ahora() }, new Date(cita.inicioUtc), new Date(cita.finOcupacionUtc)));
}
