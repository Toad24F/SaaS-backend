import type { DataSource } from 'typeorm';
import { Rol } from '../../src/auth/enums/rol.enum';
import { Cita } from '../../src/disponibilidad/entities/cita.entity';
import { Cliente } from '../../src/disponibilidad/entities/cliente.entity';
import { EventoCita } from '../../src/citas/entities/evento-cita.entity';
import { IntentoCitaManual } from '../../src/citas/entities/intento-cita-manual.entity';
import { EventoAuditoria } from '../../src/auditoria/entities/evento-auditoria.entity';
import type { conAgendaHttp } from './agenda-http';

export type EscenarioManualHttp = Parameters<Parameters<typeof conAgendaHttp>[0]>[0];
export const RUTA_MANUAL = '/citas/manuales/intentos';

/** Prepara datos y horario; el registro siempre lo ejecuta el escritor real de la aplicación. */
export async function prepararManual(f: EscenarioManualHttp, rol = Rol.ADMIN_NEGOCIO) {
  const referencia = await f.db.getRepository(Cita).findOneByOrFail({ id: f.negocios[0].ocupaciones[0] });
  await f.db.query(`INSERT INTO horarios_personal
    (negocio_id,personal_id,dia_semana,orden,sucursal_id,inicio_minutos,fin_minutos,activo)
    VALUES(?,?,1,0,?,480,720,1)`, [referencia.negocioId, referencia.personalId, referencia.sucursalId]);
  await f.db.query(`INSERT INTO configuracion_agenda
    (negocio_id,modo,tiempo_entre_citas_minutos,anticipacion_minutos,dias_futuros)
    VALUES(?,'agenda_compacta',10,10000,0)`, [referencia.negocioId]);
  const actor = f.actor(rol);
  const seleccion = { clienteId: referencia.clienteId, sucursalId: referencia.sucursalId, personalId: referencia.personalId,
    servicioId: referencia.servicioId, fechaLocal: '2026-11-09', horaInicio: '09:17', notas: 'Nota de aceptación manual' };
  const { clienteId: _, ...combinacion } = seleccion;
  return { seleccion, nueva: { ...combinacion, clienteNuevo: { nombreCompleto: 'Persona nueva independiente', telefono: '+52 614-123-4567' } },
    actor, identidad: { sub: actor.id, sesionId: actor.sesionId }, auth: `Bearer ${f.token(actor.id)}` };
}

/** La igualdad completa detecta filas parciales y cambios silenciosos en registros anteriores. */
export async function filasManuales(db: DataSource) {
  return { clientes: await db.getRepository(Cliente).find({ order: { id: 'ASC' } }),
    citas: await db.getRepository(Cita).find({ order: { id: 'ASC' } }),
    eventos: await db.getRepository(EventoCita).find({ order: { id: 'ASC' } }),
    auditoria: await db.getRepository(EventoAuditoria).find({ order: { id: 'ASC' } }),
    intentos: await db.getRepository(IntentoCitaManual).find({ order: { id: 'ASC' } }) };
}

/** Observar la conexión exacta esperando evita atribuir una carrera a simples promesas simultáneas. */
export async function esperarBloqueoManual(db: DataSource, conexion: () => number, tabla: string) {
  const limite = Date.now() + 6000;
  while (Date.now() < limite) {
    const filas = await db.query(`SELECT ID FROM information_schema.PROCESSLIST
      WHERE ID=? AND COMMAND='Query' AND TIME>=1 AND INFO LIKE ? AND INFO LIKE '%FOR UPDATE'`,
    [conexion(), `%${tabla}%`]);
    if (filas.length) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error(`No se observó la espera SQL sobre ${tabla}.`);
}
