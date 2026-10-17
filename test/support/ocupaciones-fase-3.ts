import { createHash } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { BloqueoTemporal } from '../../src/disponibilidad/entities/bloqueo-temporal.entity';
import { Cita } from '../../src/disponibilidad/entities/cita.entity';
import type { Reloj } from '../../src/comun/reloj';
import { conBaseMigrada } from './mariadb';

interface NegocioConOcupaciones {
  id: number;
  personalId: number;
  sucursales: number[];
  servicios: number[];
  citas: number[];
  apartados: number[];
}

/** Siembra dos negocios y dos combinaciones por negocio en una base temporal migrada. */
export async function crearDatosOcupaciones(db: DataSource, reloj: Reloj):
  Promise<{ negocios: NegocioConOcupaciones[] }> {
  if (!/^citas_persistencia_[a-f0-9]{32}$/.test(String(db.options.database))) {
    throw new Error('Las ocupaciones de prueba requieren una base temporal migrada.');
  }
  const negocios: NegocioConOcupaciones[] = [];
  for (const indice of [1, 2]) {
    const alta = await db.query(`INSERT INTO negocios (nombre,slug,email_contacto)
      VALUES (?,?,?)`, [`Ocupaciones ${indice}`, `ocupaciones-${indice}`,
      `ocupaciones-${indice}@example.test`]);
    const negocioId = Number(alta.insertId);
    const cuenta = await db.query(`INSERT INTO usuarios
      (negocio_id,nombre,email,password_hash,rol,activo,activado_en)
      VALUES (?,?,?,'hash','profesional',1,CURRENT_TIMESTAMP(6))`,
    [negocioId, `Profesional ${indice}`, `ocupaciones-prof-${indice}@example.test`]);
    const personalId = Number(cuenta.insertId);
    await db.query('INSERT INTO personal (id,negocio_id) VALUES (?,?)',
      [personalId, negocioId]);
    const cliente = await db.query(`INSERT INTO clientes
      (negocio_id,nombre_completo,telefono) VALUES (?,?,'6141234567')`,
    [negocioId, `Cliente ${indice}`]);
    const sucursales: number[] = [];
    const servicios: number[] = [];
    const citas: number[] = [];
    const apartados: number[] = [];
    for (const numero of [1, 2]) {
      const sucursal = await db.query(`INSERT INTO sucursales
        (negocio_id,nombre,direccion,telefono,zona_horaria)
        VALUES (?,?, 'Calle 1','6141234567','America/Chihuahua')`,
      [negocioId, `Sucursal ${indice}-${numero}`]);
      const servicio = await db.query(`INSERT INTO servicios
        (negocio_id,nombre,costo,duracion_minutos) VALUES (?,?,100,30)`,
      [negocioId, `Servicio ${indice}-${numero}`]);
      const sucursalId = Number(sucursal.insertId);
      const servicioId = Number(servicio.insertId);
      sucursales.push(sucursalId);
      servicios.push(servicioId);
      // El fixture conserva asignación y selección individual del fix por negocio.
      await db.query(`INSERT INTO personal_sucursales
        (negocio_id,personal_id,sucursal_id) VALUES (?,?,?)`,
      [negocioId, personalId, sucursalId]);
      await db.query(`INSERT INTO personal_servicios
        (negocio_id,personal_id,servicio_id) VALUES (?,?,?)`,
      [negocioId, personalId, servicioId]);
      await db.query(`INSERT INTO personal_servicios_sucursales
        (negocio_id,personal_id,sucursal_id,servicio_id) VALUES (?,?,?,?)`,
      [negocioId, personalId, sucursalId, servicioId]);
      // La misma fecha real sirve para comparar ocupación entre sucursales.
      const inicioUtc = new Date(reloj.ahora().getTime() + (numero - 1) * 3600000);
      const finUtc = new Date(inicioUtc.getTime() + 1800666);
      const cita = await db.getRepository(Cita).save({ negocioId, personalId,
        sucursalId, servicioId, clienteId: Number(cliente.insertId), inicioUtc, finUtc,
        zonaHorariaReserva: 'America/Chihuahua', estado: 'pendiente',
        folio: `OC-${indice}-${numero}`, origen: 'manual', motivoConsulta: null });
      citas.push(cita.id);
      const apartado = await db.getRepository(BloqueoTemporal).save({ negocioId, personalId,
        sucursalId, servicioId, inicioUtc, finUtc,
        expiraEn: new Date(inicioUtc.getTime() + 300000), liberadoEn: null,
        titularHash: createHash('sha256').update(`titular-prueba-${indice}-${numero}`).digest('hex') });
      apartados.push(apartado.id);
    }
    negocios.push({ id: negocioId, personalId, sucursales, servicios, citas, apartados });
  }
  return { negocios };
}

/** Recrea el punto previo a fase 3 solo dentro de la base desechable del helper. */
export async function conBaseHistorica<T>(ejecutar: (contexto: {
  db: DataSource;
  actualizar: () => Promise<unknown>;
}) => Promise<T>): Promise<T> {
  return conBaseMigrada(async (db) => {
    // Se retiran en orden inverso las cuatro tablas vacías y su historial.
    const nuevas = ['ApartadosCanonicos1760000022000', 'CitasCanonicas1760000021000',
      'ClientesBase1760000020000', 'ConfiguracionAgenda1760000019000'];
    for (const tabla of ['bloqueos_temporales', 'citas', 'clientes', 'configuracion_agenda']) {
      await db.query(`DROP TABLE ${tabla}`);
    }
    await db.query(`DELETE FROM migrations WHERE name IN (?,?,?,?)`, nuevas);
    return ejecutar({ db, actualizar: () => db.runMigrations({ transaction: 'each' }) });
  });
}
