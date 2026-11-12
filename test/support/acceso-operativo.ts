import type { DataSource } from 'typeorm';
import { Rol } from '../../src/auth/enums/rol.enum';
import { Sesion } from '../../src/auth/entities/sesion.entity';
import { SesionesService } from '../../src/auth/services/sesiones.service';
import { crearEscenarioOperativo } from './operacion-fase-5';
import { RelojPrueba } from './reloj';

export const AHORA_OPERATIVO = new Date('2026-11-08T12:00:00.000Z');
export type ActorPruebaOperativo = { id: number; rol: Rol; negocioId: number | null; sesionId: string };

/** Cuentas anteriores al reloj de prueba y sesiones reales, sin cambiar el reloj del sistema. */
export async function crearAccesoOperativo(db: DataSource) {
  const reloj = new RelojPrueba(AHORA_OPERATIVO);
  const { negocios } = await crearEscenarioOperativo(db, new RelojPrueba(new Date('2026-01-01T00:00:00Z')));
  await db.query(`INSERT INTO usuarios(nombre,email,password_hash,rol,activo,creado_en,activado_en)
    VALUES('Super de prueba','super-operativo@example.test','hash-fixture','superadmin',1,'2026-01-01','2026-01-01')`);
  const usuarios = await db.query('SELECT id,rol,negocio_id negocioId FROM usuarios ORDER BY id');
  const actores: ActorPruebaOperativo[] = [];
  for (const usuario of usuarios) {
    const sesion = await new SesionesService(db.getRepository(Sesion)).crear(usuario.id,
      new Date(reloj.ahora().getTime() - 3_600_000));
    actores.push({ ...usuario, sesionId: sesion.id });
  }
  // Hay contacto y notas propios, otro Profesional del mismo negocio y registros de otro negocio.
  await db.query("UPDATE citas SET nombre_contacto='Paciente propio',telefono_contacto='6141234567',motivo_consulta='Nota propia'");
  const a = negocios[0];
  await db.query(`INSERT INTO citas(negocio_id,sucursal_id,personal_id,servicio_id,cliente_id,
    inicio_utc,fin_utc,zona_horaria_reserva,folio,nombre_contacto,telefono_contacto,motivo_consulta)
    SELECT negocio_id,sucursal_id,?,servicio_id,cliente_id,inicio_utc,fin_utc,zona_horaria_reserva,
    'M4-OTRO-PROF','Paciente ajeno','6149999999','Nota ajena' FROM citas WHERE id=?`,
  [a.profesionales[1], a.ocupaciones[0]]);
  return { reloj, negocios, actores, superadmin: actores.find((u) => u.rol === Rol.SUPERADMIN)! };
}

/** Mantiene la misma sesión abierta cerca de un límite lejano sin exceder su ventana fija. */
export async function situarSesion(db: DataSource, actor: ActorPruebaOperativo, limite: Date) {
  const creadaEn = new Date(limite.getTime() - 3_600_000);
  await db.getRepository(Sesion).update({ id: actor.sesionId }, { creadaEn,
    expiraEn: new Date(creadaEn.getTime() + 12 * 3_600_000) });
}
