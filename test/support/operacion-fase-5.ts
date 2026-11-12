import type { DataSource } from 'typeorm';
import type { Reloj } from '../../src/comun/reloj';
import { conBaseMigrada } from './mariadb';
import { crearEscenarioPortal } from './escenario-portal';
import { BarreraPrueba } from './concurrencia-portal';

/** Hereda migraciones, guardas y limpieza incluso ante fallo, con nombre test explícito. */
export function conBaseOperativa<T>(ejecutar: (a: DataSource, b: DataSource) => Promise<T>): Promise<T> {
  return conBaseMigrada(ejecutar, 'citas_m4_test');
}

/** Amplía el escenario público sin simular servicios operativos todavía no implementados. */
export async function crearEscenarioOperativo(db: DataSource, reloj: Reloj) {
  if (!/^citas_m4_test_[a-f0-9]{32}$/.test(String(db.options.database))) {
    throw new Error('La fixture exige una base operativa desechable.');
  }
  const escenario = await crearEscenarioPortal(db, reloj);
  const ahora = reloj.ahora();
  for (const negocio of escenario.negocios) {
    // Los roles y la licencia son datos de preparación, no evidencia de autorización M4.
    for (const rol of ['admin_negocio', 'recepcionista']) {
      await db.query(`INSERT INTO usuarios
        (negocio_id,nombre,email,password_hash,rol,activo,activado_en,creado_en)
        VALUES (?,?,?,'hash-fixture',?,1,?,?)`,
      [negocio.id, `${rol} ${negocio.id}`, `${rol}-${negocio.id}@example.test`, rol, ahora, ahora]);
    }
    await db.query(`INSERT INTO licencias(negocio_id,creado_en,habilitada_en,vence_en)
      VALUES(?,?,?,?)`, [negocio.id, ahora, ahora, new Date(ahora.getTime() + 365 * 86_400_000)]);
    await db.query('UPDATE sucursales SET activo=1 WHERE negocio_id=?', [negocio.id]);
    await db.query('UPDATE personal_sucursales SET activo=1 WHERE negocio_id=?', [negocio.id]);
    const [servicio] = await db.query('SELECT id FROM servicios WHERE negocio_id=? AND activo=1', [negocio.id]);
    await db.query(`INSERT INTO personal_servicios_sucursales
      (negocio_id,personal_id,sucursal_id,servicio_id,activo) VALUES(?,?,?,?,1)`,
    [negocio.id, negocio.profesionales[0], negocio.sucursales[1].id, servicio.id]);
    // Dos fichas comparten número; sus IDs y nombres permanecen independientes.
    await db.query('INSERT INTO clientes(negocio_id,nombre_completo,telefono) VALUES(?,?,?)',
      [negocio.id, `Otra persona ${negocio.id}`, negocio.telefonoCliente]);
    const [original] = await db.query('SELECT * FROM citas WHERE id=?', [negocio.ocupaciones[0]]);
    for (const [indice, estado] of ['confirmada', 'completada', 'cancelada', 'no_asistio'].entries()) {
      // Los estados finales quedan en el pasado; las citas no se empalman entre sedes.
      const desplazamiento = estado === 'completada' || estado === 'no_asistio'
        ? -(indice + 1) * 3_600_000 : (indice + 2) * 3_600_000;
      const inicio = new Date(ahora.getTime() + desplazamiento);
      const fin = new Date(inicio.getTime() + 1_800_000);
      const sede = negocio.sucursales[indice % 2];
      await db.query(`INSERT INTO citas
        (negocio_id,sucursal_id,personal_id,servicio_id,cliente_id,inicio_utc,fin_utc,
         zona_horaria_reserva,folio,estado,origen,separacion_minutos,fin_ocupacion_utc,
         costo_aceptado,nombre_contacto,telefono_contacto)
        VALUES(?,?,?,?,?,?,?,?,?,?,'manual',5,?,100,?,?)`,
      [negocio.id, sede.id, negocio.profesionales[0], servicio.id, original.cliente_id,
        inicio, fin, sede.zona, `M4-${negocio.id}-${indice}`, estado,
        new Date(fin.getTime() + 300_000), `Cliente ${negocio.id}`, negocio.telefonoCliente]);
    }
  }
  return escenario;
}

/** Prueba el protocolo de exclusión sobre personal; no representa una reserva manual. */
export async function controlarEsperaOperativa(a: DataSource, b: DataSource,
  personalId: number, fallar = false) {
  const uno = a.createQueryRunner();
  const dos = b.createQueryRunner();
  const barrera = new BarreraPrueba();
  let pendiente: Promise<unknown> | undefined;
  let continuar = false;
  let resultadoControl!: { esperaObservada: boolean; continuo: boolean; conexiones: number[] };
  const errores: unknown[] = [];
  try {
    await uno.connect(); await dos.connect();
    const idA = Number((await uno.query('SELECT CONNECTION_ID() id'))[0].id);
    const idB = Number((await dos.query('SELECT CONNECTION_ID() id'))[0].id);
    await uno.startTransaction('READ COMMITTED');
    await dos.startTransaction('READ COMMITTED');
    await dos.query('SET SESSION innodb_lock_wait_timeout=8');
    await uno.query('SELECT id FROM personal WHERE id=? FOR UPDATE', [personalId]);
    await uno.query('UPDATE personal SET especialidad=? WHERE id=?', ['Dueño M4', personalId]);
    // Capturar el rechazo de inmediato evita promesas no manejadas si falla la observación.
    pendiente = (async () => {
      barrera.abrir();
      await dos.query('SELECT id FROM personal WHERE id=? FOR UPDATE', [personalId]);
      if (!continuar) throw new Error('Carrera interrumpida; revertir segundo participante.');
      await dos.query('UPDATE personal SET especialidad=? WHERE id=?', ['Continuó M4', personalId]);
      await dos.commitTransaction();
    })().then(() => ({ correcto: true }), (error: unknown) => ({ error }));
    await barrera.esperar();
    const limite = Date.now() + 5_000;
    let esperaObservada = false;
    // La barrera señala intención; INNODB_LOCK_WAITS demuestra espera efectiva en el servidor.
    while (Date.now() < limite) {
      const filas = await uno.query(`SELECT w.requesting_trx_id
        FROM information_schema.INNODB_LOCK_WAITS w
        JOIN information_schema.INNODB_TRX r ON r.trx_id=w.requesting_trx_id
        JOIN information_schema.INNODB_TRX p ON p.trx_id=w.blocking_trx_id
        WHERE r.trx_mysql_thread_id=? AND p.trx_mysql_thread_id=?`, [idB, idA]);
      if (filas.length) { esperaObservada = true; break; }
      await new Promise((resolver) => setTimeout(resolver, 20));
    }
    if (!esperaObservada) throw new Error('No se observó espera InnoDB entre las conexiones.');
    if (fallar) throw new Error('Fallo controlado durante espera');
    continuar = true;
    await uno.commitTransaction();
    const resultado = await pendiente as { error?: unknown };
    if (resultado.error) throw resultado.error;
    const [fila] = await a.query('SELECT especialidad FROM personal WHERE id=?', [personalId]);
    resultadoControl = { esperaObservada, continuo: fila.especialidad === 'Continuó M4', conexiones: [idA, idB] };
  } catch (error) {
    errores.push(error);
  } finally {
    // Liberar primero al dueño desbloquea al segundo. Esperar su final antes de cerrar evita carreras de limpieza.
    try { if (uno.isTransactionActive) await uno.rollbackTransaction(); } catch (error) { errores.push(error); }
    if (pendiente) await pendiente;
    try { if (dos.isTransactionActive) await dos.rollbackTransaction(); } catch (error) { errores.push(error); }
    const cierres = await Promise.allSettled([uno.release(), dos.release()]);
    for (const cierre of cierres) if (cierre.status === 'rejected') errores.push(cierre.reason);
  }
  // Conservar el fallo original junto con los de limpieza; finally nunca lo sobrescribe.
  if (errores.length === 1) throw errores[0];
  if (errores.length > 1) throw new AggregateError(errores, 'Falló la carrera operativa o su limpieza.');
  return resultadoControl;
}
