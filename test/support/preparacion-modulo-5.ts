import type { DataSource, EntityManager } from 'typeorm';
import { Rol } from '../../src/auth/enums/rol.enum';
import type { Reloj } from '../../src/comun/reloj';
import { BarreraPrueba } from './concurrencia-portal';
import { esperarBloqueoManual } from './cita-manual';

function exigirBaseModulo5(db: DataSource): void {
  if (process.env.NODE_ENV !== 'test' || !/^citas_m5_test_[a-f0-9]{32}$/.test(String(db.options.database))) {
    throw new Error('La preparación del módulo 5 requiere una base desechable del ejecutor.');
  }
}

async function sembrarUsuario(db: EntityManager, rol: Rol, negocioId: number | null, ahora: Date) {
  const alta = await db.query(`INSERT INTO usuarios
    (negocio_id,nombre,email,password_hash,rol,activo,creado_en,activado_en)
    VALUES (?,?,?,'hash-no-utilizable-de-prueba',?,1,?,?)`,
  [negocioId, `Cuenta de prueba ${rol}`, `${rol}-${negocioId ?? 'global'}@example.test`, rol, ahora, ahora]);
  return Number(alta.insertId);
}

/** Prepara identidades persistidas para escenarios que arrancan con el esquema migrado. */
export async function crearDatosModulo5(db: DataSource, reloj: Reloj) {
  exigirBaseModulo5(db);

  const ahora = reloj.ahora();
  return db.transaction(async (manager) => {
    const superadminId = await sembrarUsuario(manager, Rol.SUPERADMIN, null, ahora);
    const negocios = [];
    for (const numero of [1, 2]) {
      const alta = await manager.query(`INSERT INTO negocios (nombre,slug,email_contacto,creado_en,activado_en)
        VALUES (?,?,?,?,?)`, [`Negocio de prueba ${numero}`, `m5-prueba-${numero}`,
        `negocio-${numero}@example.test`, ahora, ahora]);
      const id = Number(alta.insertId);
      const administradorId = await sembrarUsuario(manager, Rol.ADMIN_NEGOCIO, id, ahora);
      const recepcionistaId = await sembrarUsuario(manager, Rol.RECEPCIONISTA, id, ahora);
      const profesionalId = await sembrarUsuario(manager, Rol.PROFESIONAL, id, ahora);
      await manager.query('INSERT INTO personal (id,negocio_id) VALUES (?,?)', [profesionalId, id]);

      // Un teléfono ficticio compartido permite preparar casos de identidad sin datos de contacto reales.
      const clientes = [];
      for (const nombre of ['Persona de prueba A', 'Persona de prueba B']) {
        const cliente = await manager.query(`INSERT INTO clientes (negocio_id,nombre_completo,telefono,creado_en)
          VALUES (?,?,'0000000001',?)`, [id, nombre, ahora]);
        clientes.push(Number(cliente.insertId));
      }
      negocios.push({ id, administradorId, recepcionistaId, profesionalId, clientes });
    }
    return { negocios, superadminId };
  });
}

/** Mantiene el bloqueo de personal hasta observar la consulta rival esperando en MariaDB. */
export async function observarEsperaModulo5(a: DataSource, b: DataSource, profesionalId: number,
  reloj: Reloj, duranteEspera: () => void) {
  // Las dos transacciones deben operar sobre la misma base test antes de tomar bloqueos.
  exigirBaseModulo5(a);
  exigirBaseModulo5(b);
  if (a.options.database !== b.options.database) {
    throw new Error('Las conexiones deben compartir la misma base desechable.');
  }
  const preparada = new BarreraPrueba();
  let conexionA = 0;
  let conexionB = 0;
  let segunda: Promise<PromiseSettledResult<{ instanteDespues: Date; especialidad: string }>> | undefined;
  try {
    const instanteAntes = await a.transaction('READ COMMITTED', async (primera) => {
      conexionA = Number((await primera.query('SELECT CONNECTION_ID() id'))[0].id);
      await primera.query('SELECT id FROM personal WHERE id=? FOR UPDATE', [profesionalId]);
      await primera.query('UPDATE personal SET especialidad=? WHERE id=?',
        ['Cambio confirmado de prueba', profesionalId]);

      segunda = b.transaction('READ COMMITTED', async (rival) => {
        conexionB = Number((await rival.query('SELECT CONNECTION_ID() id'))[0].id);
        preparada.abrir();
        const [fila] = await rival.query('SELECT especialidad FROM personal WHERE id=? FOR UPDATE', [profesionalId]);
        // El reloj y la fila se leen después de adquirir el bloqueo, como haría un escritor.
        return { instanteDespues: reloj.ahora(), especialidad: fila.especialidad as string };
      }).then((value) => ({ status: 'fulfilled', value }), (reason: unknown) => ({ status: 'rejected', reason }));

      await Promise.race([preparada.esperar(), segunda.then((resultado) => {
        if (resultado.status === 'rejected') throw resultado.reason;
      })]);
      await esperarBloqueoManual(a, () => conexionB, 'personal');
      const instante = reloj.ahora();
      duranteEspera();
      return instante;
    });
    const resultado = await segunda!;
    if (resultado.status === 'rejected') throw resultado.reason;
    return { conexiones: [conexionA, conexionB], instanteAntes, ...resultado.value };
  } finally {
    // Si falla una comprobación, la transacción dueña revierte antes de esperar a la rival.
    await segunda;
  }
}
