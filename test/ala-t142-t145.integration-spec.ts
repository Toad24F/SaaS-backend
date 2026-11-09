import { conBaseMigrada, retrocederHastaMigracion } from './support/mariadb';
import { crearEscenarioPortal } from './support/escenario-portal';
import { RelojPrueba } from './support/reloj';
import { getDatabaseOptions } from '../src/config/database.config';
import { inspeccionarCompatibilidadAla, exigirCompatibilidadAla } from
  '../src/operacion/compatibilidad-ala';

const AHORA = new Date('2026-10-20T12:00:00.000Z');

describe('ALA-T142–T145: activación y migración segura', () => {
  it('T142 detecta apartados antiguos vigentes y libera el límite exacto', async () => {
    await conBaseMigrada(async (db) => {
      const { negocios } = await crearEscenarioPortal(db, new RelojPrueba(AHORA));
      const inicial = await inspeccionarCompatibilidadAla(db, AHORA);
      expect(inicial.apartadosAntiguosVigentes).toBe(2);
      await expect(exigirCompatibilidadAla(db, AHORA))
        .rejects.toMatchObject({ status: 409 });
      const despues = new Date(AHORA.getTime() + 300_000);
      // Al expirar exactamente deja de contar; la fila histórica permanece.
      expect((await inspeccionarCompatibilidadAla(db, despues))
        .apartadosAntiguosVigentes).toBe(0);
      expect((await db.query('SELECT COUNT(*) AS n FROM bloqueos_temporales'))[0].n)
        .toBe('2');
      await expect(exigirCompatibilidadAla(db, despues)).resolves.toBeUndefined();
      expect(negocios).toHaveLength(2);
    });
  });

  it('T142 detiene activación por descanso o excepción sin purgar datos', async () => {
    await conBaseMigrada(async (db) => {
      const { negocios: [a] } = await crearEscenarioPortal(db, new RelojPrueba(AHORA));
      const personalId = a.profesionales[0];
      const sucursalId = a.sucursales[0].id;
      const horario = await db.query(`INSERT INTO horarios_personal
        (negocio_id,personal_id,sucursal_id,dia_semana,orden,inicio_minutos,
         fin_minutos,descanso_inicio_minutos,descanso_fin_minutos,activo)
        VALUES (?,?,?,2,0,480,720,600,615,1)`, [a.id, personalId, sucursalId]);
      const excepcion = await db.query(`INSERT INTO excepciones_horario
        (negocio_id,personal_id,sucursal_id,fecha_local)
        VALUES (?,?,?,'2026-10-20')`, [a.id, personalId, sucursalId]);
      const revision = await inspeccionarCompatibilidadAla(db,
        new Date(AHORA.getTime() + 300_000));
      expect(revision).toMatchObject({ horariosConDescanso: 1,
        excepcionesHorario: 1, apartadosAntiguosVigentes: 0 });
      await expect(exigirCompatibilidadAla(db,
        new Date(AHORA.getTime() + 300_000)))
        .rejects.toMatchObject({ status: 409 });
      expect((await db.query('SELECT id FROM horarios_personal WHERE id=?',
        [horario.insertId]))).toHaveLength(1);
      expect((await db.query('SELECT id FROM excepciones_horario WHERE id=?',
        [excepcion.insertId]))).toHaveLength(1);
    });
  });

  it('T143–T145 actualiza esquema previo sin perder cuentas, oferta ni historia', async () => {
    await conBaseMigrada(async (db) => {
      // Volver al último esquema público anterior a ALA, solo en la base
      // temporal que conBaseMigrada creó y destruirá para este caso.
      // Las migraciones futuras también deben retirarse antes de sembrar el esquema previo.
      const retiradas = await retrocederHastaMigracion(db, 'DatosPublicosCatalogo1760000033000');
      const [ultima] = await db.query('SELECT name FROM migrations ORDER BY id DESC LIMIT 1');
      expect(ultima.name).toBe('DatosPublicosCatalogo1760000033000');
      const { negocios: [a] } = await crearEscenarioPortal(db, new RelojPrueba(AHORA));
      const antes = {
        usuarios: await db.query('SELECT id,nombre,email FROM usuarios WHERE negocio_id=? ORDER BY id', [a.id]),
        relaciones: await db.query(`SELECT personal_id,sucursal_id,activo
          FROM personal_sucursales WHERE negocio_id=? ORDER BY personal_id,sucursal_id`, [a.id]),
        servicios: await db.query('SELECT id,costo,duracion_minutos FROM servicios WHERE negocio_id=? ORDER BY id', [a.id]),
        citas: await db.query(`SELECT id,inicio_utc,fin_utc,estado,costo_aceptado
          FROM citas WHERE negocio_id=? ORDER BY id`, [a.id]),
      };
      const aplicadas = await db.runMigrations({ transaction: 'each' });
      expect(aplicadas).toHaveLength(retiradas);
      expect(await db.query('SELECT id,nombre,email FROM usuarios WHERE negocio_id=? ORDER BY id',
        [a.id])).toEqual(antes.usuarios);
      expect(await db.query(`SELECT personal_id,sucursal_id,activo
        FROM personal_sucursales WHERE negocio_id=? ORDER BY personal_id,sucursal_id`,
      [a.id])).toEqual(antes.relaciones);
      expect(await db.query('SELECT id,costo,duracion_minutos FROM servicios WHERE negocio_id=? ORDER BY id',
        [a.id])).toEqual(antes.servicios);
      const citas = await db.query(`SELECT id,inicio_utc,fin_utc,estado,costo_aceptado,
        separacion_minutos,fin_ocupacion_utc FROM citas WHERE negocio_id=? ORDER BY id`, [a.id]);
      expect(citas.map((c: { id: number; inicio_utc: Date; fin_utc: Date;
        estado: string; costo_aceptado: string | null }) => ({
        id: c.id, inicio_utc: c.inicio_utc, fin_utc: c.fin_utc,
        estado: c.estado, costo_aceptado: c.costo_aceptado }))).toEqual(antes.citas);
      // El intervalo histórico no protegía tiempo extra; tampoco puede
      // inventarse un costo aceptado que la cita antigua no guardó.
      expect(citas[0].separacion_minutos).toBe(0);
      expect(citas[0].fin_ocupacion_utc).toEqual(citas[0].fin_utc);
      expect(citas[0].costo_aceptado).toBeNull();
      const [apartado] = await db.query(`SELECT version_reglas,separacion_minutos,
        modo_concesion FROM bloqueos_temporales WHERE id=?`, [a.ocupaciones[1]]);
      expect(apartado).toEqual({ version_reglas: null,
        separacion_minutos: null, modo_concesion: null });
      expect(await db.runMigrations({ transaction: 'each' })).toEqual([]);
    });
  }, 120000);

  it('T145 rechaza el nombre cotidiano o sin confirmación antes de abrir conexión', () => {
    const comun = { ...process.env, NODE_ENV: 'test',
      TEST_DB_NAME: 'citas_cotidiana', DB_NAME: 'citas_cotidiana' };
    expect(() => getDatabaseOptions({ ...comun,
      TEST_DB_CONFIRMED: 'citas_cotidiana' })).toThrow(/separada/);
    expect(() => getDatabaseOptions({ ...comun, DB_NAME: 'otra_base',
      TEST_DB_CONFIRMED: 'distinta' })).toThrow(/confirmada/);
  });
});
