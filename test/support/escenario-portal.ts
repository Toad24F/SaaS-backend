import type { DataSource } from 'typeorm';
import type { Reloj } from '../../src/comun/reloj';

interface EscenarioNegocio {
  id: number;
  profesionales: number[];
  sucursales: { id: number; zona: string }[];
  servicioInactivoId: number;
  telefonoCliente: string;
  ocupaciones: number[];
}

/** Siembra oferta, zonas y ocupaciones separadas en una base que el ejecutor destruirá. */
export async function crearEscenarioPortal(db: DataSource, reloj: Reloj):
  Promise<{ negocios: EscenarioNegocio[] }> {
  if (!/^citas_persistencia_[a-f0-9]{32}$/.test(String(db.options.database))) {
    throw new Error('El escenario público exige una base desechable migrada.');
  }
  const negocios: EscenarioNegocio[] = [];
  // Creación y activación comparten el reloj de la fixture: usar CURRENT_TIMESTAMP
  // hacía fallar el CHECK de activación cuando la fecha fija quedaba en el pasado.
  const ahora = reloj.ahora();
  for (const numero of [1, 2]) {
    const alta = await db.query('INSERT INTO negocios (nombre,slug,email_contacto,activado_en,creado_en) VALUES (?,?,?,?,?)',
      [`Portal ${numero}`, `portal-prueba-${numero}`, `portal${numero}@example.test`, ahora, ahora]);
    const id = Number(alta.insertId);
    const profesionales: number[] = [];
    for (const indice of [1, 2]) {
      const cuenta = await db.query(`INSERT INTO usuarios
        (negocio_id,nombre,email,password_hash,rol,activo,activado_en,creado_en)
        VALUES (?,?,?,'hash','profesional',1,?,?)`,
      [id, `Profesional ${numero}-${indice}`, `portal-prof-${numero}-${indice}@example.test`, ahora, ahora]);
      const personalId = Number(cuenta.insertId);
      await db.query('INSERT INTO personal (id,negocio_id) VALUES (?,?)', [personalId, id]);
      profesionales.push(personalId);
    }
    const sucursales: EscenarioNegocio['sucursales'] = [];
    for (const [indice, zona] of ['America/Chihuahua', 'America/Mexico_City'].entries()) {
      const sucursal = await db.query(`INSERT INTO sucursales
        (negocio_id,nombre,direccion,telefono,zona_horaria,activo)
        VALUES (?,?, 'Calle de prueba','6141234567',?,?)`,
      [id, `Sucursal ${numero}-${indice}`, zona, indice === 0 ? 1 : 0]);
      sucursales.push({ id: Number(sucursal.insertId), zona });
    }
    const activo = await db.query(`INSERT INTO servicios
      (negocio_id,nombre,costo,duracion_minutos,activo) VALUES (?,'Corte',100,30,1)`, [id]);
    const inactivo = await db.query(`INSERT INTO servicios
      (negocio_id,nombre,costo,duracion_minutos,activo) VALUES (?,'Color',200,60,0)`, [id]);
    const servicioId = Number(activo.insertId);
    // La primera combinación está activa; la segunda permanece seleccionada pero apagada.
    for (const [indice, sucursal] of sucursales.entries()) {
      await db.query('INSERT INTO personal_sucursales (negocio_id,personal_id,sucursal_id,activo) VALUES (?,?,?,?)',
        [id, profesionales[0], sucursal.id, indice === 0 ? 1 : 0]);
      await db.query('INSERT INTO personal_servicios (negocio_id,personal_id,servicio_id,activo) VALUES (?,?,?,1)',
        [id, profesionales[indice], servicioId]);
      if (indice === 0) {
        await db.query(`INSERT INTO personal_servicios_sucursales
          (negocio_id,personal_id,sucursal_id,servicio_id,activo) VALUES (?,?,?,?,1)`,
        [id, profesionales[0], sucursal.id, servicioId]);
      }
    }
    const telefonoCliente = '6141234567';
    const cliente = await db.query('INSERT INTO clientes (negocio_id,nombre_completo,telefono) VALUES (?,?,?)',
      [id, `Cliente ${numero}`, telefonoCliente]);
    const inicio = new Date(reloj.ahora().getTime() + 3_600_000);
    const fin = new Date(inicio.getTime() + 1_800_000);
    const cita = await db.query(`INSERT INTO citas
      (negocio_id,sucursal_id,personal_id,servicio_id,cliente_id,inicio_utc,fin_utc,
       zona_horaria_reserva,folio,estado,origen)
      VALUES (?,?,?,?,?,?,?,?,?,'pendiente','manual')`,
    [id, sucursales[0].id, profesionales[0], servicioId, Number(cliente.insertId),
      inicio, fin, sucursales[0].zona, `P-${numero}`]);
    const apartado = await db.query(`INSERT INTO bloqueos_temporales
      (negocio_id,personal_id,sucursal_id,servicio_id,inicio_utc,fin_utc,expira_en,titular_hash)
      VALUES (?,?,?,?,?,?,?,?)`,
    [id, profesionales[1], sucursales[1].id, servicioId,
      new Date(fin.getTime()), new Date(fin.getTime() + 1_800_000),
      new Date(reloj.ahora().getTime() + 300_000), String(numero).repeat(64)]);
    negocios.push({ id, profesionales, sucursales,
      servicioInactivoId: Number(inactivo.insertId), telefonoCliente,
      ocupaciones: [Number(cita.insertId), Number(apartado.insertId)] });
  }
  return { negocios };
}
