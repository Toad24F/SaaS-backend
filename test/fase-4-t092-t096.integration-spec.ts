import { Test, type TestingModule } from '@nestjs/testing';
import { DataSource, type DataSourceOptions } from 'typeorm';
import { AppModule } from '../src/app.module';
import { BloqueosService } from '../src/bloqueos/bloqueos.service';
import { RELOJ } from '../src/comun/reloj';
import { LicenciasService } from '../src/licencias/licencias.service';
import { ProfesionalesService } from '../src/profesionales/profesionales.service';
import { ApartadosService, type ResultadoApartado } from '../src/reservas-publicas/apartados.service';
import { IntentosReservaPublicaService } from '../src/reservas-publicas/intentos-reserva-publica.service';
import { RegistroReservaPublicaService } from '../src/reservas-publicas/registro-reserva-publica.service';
import { ResolucionReservaPublicaService } from '../src/reservas-publicas/resolucion-reserva-publica.service';
import { conBaseMigrada } from './support/mariadb';
import { crearEscenarioPortal } from './support/escenario-portal';
import { RelojPrueba } from './support/reloj';

const AHORA = new Date('2026-10-20T12:00:00.000Z');
const CONTACTO = { nombre: 'Cliente concurrente', telefono: '+52 614-123-4567',
  notas: 'Prueba de persistencia pública.' };

interface BasePrueba {
  negocioId: number;
  profesionales: [number, number];
  sucursalId: number;
  servicioId: number;
  adminId: number;
  superadminId: number;
  licenciaId: number;
}

interface EnvioPreparado {
  titular: string;
  clave: string;
  apartado: ResultadoApartado;
}

/** Dos llamadas cruzan juntas el punto de inicio, sin temporizadores como
 * sustituto del bloqueo transaccional que decide el resultado. */
class BarreraDosParticipantes {
  private llegadas = 0;
  private abrir!: () => void;
  private readonly abierta = new Promise<void>((resolver) => { this.abrir = resolver; });

  async esperar(): Promise<void> {
    this.llegadas += 1;
    if (this.llegadas === 2) this.abrir();
    await this.abierta;
  }
}

async function crearModulo(db: DataSource, reloj: RelojPrueba): Promise<TestingModule> {
  return Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(DataSource).useValue(db)
    .overrideProvider(RELOJ).useValue(reloj)
    .compile();
}

/** Crea una oferta mínima y válida. El segundo Profesional queda listo para
 * entrar a la sucursal durante T092, pero inicialmente no está asignado. */
async function sembrarBase(db: DataSource, reloj: RelojPrueba): Promise<BasePrueba> {
  const { negocios: [negocio] } = await crearEscenarioPortal(db, reloj);
  await db.query('DELETE FROM bloqueos_temporales WHERE negocio_id=?', [negocio.id]);
  await db.query('DELETE FROM citas WHERE negocio_id=?', [negocio.id]);
  await db.query('DELETE FROM clientes WHERE negocio_id=?', [negocio.id]);
  const licencia = await db.query(`INSERT INTO licencias
    (negocio_id,creado_en,habilitada_en,vence_en)
    VALUES (?,'2026-01-01','2026-01-01','2027-01-01')`, [negocio.id]);
  const admin = await db.query(`INSERT INTO usuarios
    (negocio_id,nombre,email,password_hash,rol,activo,activado_en)
    VALUES (?,'Admin concurrencia','admin-concurrencia@example.test','hash','admin_negocio',1,?)`,
  [negocio.id, AHORA]);
  const superadmin = await db.query(`INSERT INTO usuarios
    (negocio_id,nombre,email,password_hash,rol,activo,activado_en)
    VALUES (NULL,'Superadmin concurrencia','super-concurrencia@example.test','hash','superadmin',1,?)`,
  [AHORA]);
  const servicioId = Number((await db.query(`SELECT id FROM servicios
    WHERE negocio_id=? AND activo=1 LIMIT 1`, [negocio.id]))[0].id);
  const sucursalId = negocio.sucursales[0].id;
  // El perfil inicial tiene horario. El segundo recibe el suyo después de que
  // la asignación concurrente cree la relación exigida por la llave foránea.
  await db.query(`INSERT INTO horarios_personal
    (negocio_id,personal_id,sucursal_id,dia_semana,orden,inicio_minutos,fin_minutos,activo)
    VALUES (?,?,?,2,0,480,720,1)`,
  [negocio.id, negocio.profesionales[0], sucursalId]);
  return { negocioId: negocio.id,
    profesionales: [negocio.profesionales[0], negocio.profesionales[1]],
    sucursalId, servicioId, adminId: Number(admin.insertId),
    superadminId: Number(superadmin.insertId), licenciaId: Number(licencia.insertId) };
}

async function crearSesion(db: DataSource, base: BasePrueba, semilla: string): Promise<string> {
  const titular = semilla.repeat(64).slice(0, 64);
  await db.query(`INSERT INTO sesiones_reserva_publica
    (negocio_id,titular_hash,generacion) VALUES (?,?,0)`, [base.negocioId, titular]);
  return titular;
}

function seleccion(base: BasePrueba, clave: string, personalId = base.profesionales[0]) {
  return { clave, personalId, sucursalId: base.sucursalId,
    servicioId: base.servicioId, fechaLocal: '2026-10-20', horaInicio: '08:00' };
}

async function prepararEnvio(modulo: TestingModule, db: DataSource, base: BasePrueba,
  semilla: string): Promise<EnvioPreparado> {
  const titular = await crearSesion(db, base, semilla);
  const apartado = await modulo.get(ApartadosService).solicitar(base.negocioId, titular,
    seleccion(base, `operacion_${semilla.repeat(12)}`));
  expect(apartado.estado).toBe('concedida');
  const clave = `intento_${semilla.repeat(12)}`;
  await modulo.get(IntentosReservaPublicaService).preparar(base.negocioId, titular,
    { clave, apartadoId: apartado.apartadoId });
  return { titular, clave, apartado };
}

async function contarPublicas(db: DataSource, tabla: 'citas' | 'clientes',
  negocioId: number): Promise<number> {
  const condicion = tabla === 'citas' ? " AND origen='portal_publico'" : '';
  return Number((await db.query(`SELECT COUNT(*) n FROM ${tabla}
    WHERE negocio_id=?${condicion}`, [negocioId]))[0].n);
}

/** Mantiene una fila hasta que el trabajo ya está esperando. El servicio debe
 * releer bajo READ COMMITTED después de recibir el bloqueo. */
async function ejecutarTrasBloqueo<T>(db: DataSource, sql: string, parametros: unknown[],
  iniciar: () => Promise<T>, duranteEspera: () => Promise<void>): Promise<PromiseSettledResult<T>> {
  const runner = db.createQueryRunner();
  await runner.connect();
  await runner.startTransaction('READ COMMITTED');
  let pendiente!: Promise<T>;
  try {
    await runner.query(sql, parametros);
    pendiente = iniciar();
    await new Promise((resolver) => setTimeout(resolver, 80));
    await duranteEspera();
    await runner.commitTransaction();
  } finally {
    if (runner.isTransactionActive) await runner.rollbackTransaction();
    await runner.release();
  }
  return (await Promise.allSettled([pendiente]))[0];
}

/** Encola dos operaciones sobre la misma sesión para comprobar de forma
 * determinista qué participante adquiere primero su exclusión común. */
async function encolarSobreSesion<T, U>(db: DataSource, base: BasePrueba, titular: string,
  primero: () => Promise<T>, segundo: () => Promise<U>):
  Promise<[PromiseSettledResult<T>, PromiseSettledResult<U>]> {
  const runner = db.createQueryRunner();
  await runner.connect();
  await runner.startTransaction('READ COMMITTED');
  try {
    await runner.query(`SELECT id FROM sesiones_reserva_publica
      WHERE negocio_id=? AND titular_hash=? FOR UPDATE`, [base.negocioId, titular]);
    const uno = primero();
    await new Promise((resolver) => setTimeout(resolver, 80));
    const dos = segundo();
    await new Promise((resolver) => setTimeout(resolver, 80));
    await runner.commitTransaction();
    return await Promise.allSettled([uno, dos]) as
      [PromiseSettledResult<T>, PromiseSettledResult<U>];
  } finally {
    if (runner.isTransactionActive) await runner.rollbackTransaction();
    await runner.release();
  }
}

describe('M3-T092–T096: cierre de concurrencia del escritor público', () => {
  const secretoAnterior = process.env.PORTAL_FORMULARIO_HMAC_SECRET;

  beforeAll(() => {
    process.env.PORTAL_FORMULARIO_HMAC_SECRET = 'secreto-t092-t096-123456789012345';
  });

  afterAll(() => {
    if (secretoAnterior === undefined) delete process.env.PORTAL_FORMULARIO_HMAC_SECRET;
    else process.env.PORTAL_FORMULARIO_HMAC_SECRET = secretoAnterior;
  });

  it('T092: el bloqueo colectivo coordina una asignación nueva y alcanza al escritor', async () => {
    await conBaseMigrada(async (db, segunda) => {
      const reloj = new RelojPrueba(AHORA);
      const base = await sembrarBase(db, reloj);
      const [moduloA, moduloB] = await Promise.all([crearModulo(db, reloj), crearModulo(segunda, reloj)]);
      const envio = await prepararEnvio(moduloA, db, base, 'a');
      const runner = segunda.createQueryRunner();
      await runner.connect();
      await runner.startTransaction('READ COMMITTED');
      try {
        // El bloqueo colectivo ya posee la barrera del negocio cuando espera este perfil.
        await runner.query('SELECT id FROM personal WHERE id=? FOR UPDATE', [base.profesionales[0]]);
        const bloqueo = moduloA.get(BloqueosService).crear(base.adminId, {
          personalId: null, sucursalId: null, tipo: 'emergencia', motivo: 'Cierre colectivo',
          fechaInicio: '2026-10-20', fechaFin: '2026-10-20',
          inicioMinutos: null, finMinutos: null,
        });
        await new Promise((resolver) => setTimeout(resolver, 80));
        const asignacion = moduloB.get(ProfesionalesService).asignarSucursales(
          base.adminId, base.profesionales[1], { sucursalIds: [base.sucursalId] });
        const registro = moduloB.get(RegistroReservaPublicaService).registrar(
          base.negocioId, envio.titular, envio.clave, CONTACTO);
        await new Promise((resolver) => setTimeout(resolver, 80));
        await runner.commitTransaction();
        await expect(bloqueo).resolves.toMatchObject({ personalId: null, sucursalId: null });
        await expect(asignacion).resolves.toEqual([base.sucursalId]);
        await expect(registro).rejects.toMatchObject({ status: 409 });
      } finally {
        if (runner.isTransactionActive) await runner.rollbackTransaction();
        await runner.release();
      }
      await db.query(`INSERT INTO horarios_personal
        (negocio_id,personal_id,sucursal_id,dia_semana,orden,inicio_minutos,fin_minutos,activo)
        VALUES (?,?,?,2,0,480,720,1)`,
      [base.negocioId, base.profesionales[1], base.sucursalId]);
      const titularNuevo = await crearSesion(db, base, 'b');
      const nuevo = await moduloA.get(ApartadosService).solicitar(base.negocioId, titularNuevo,
        seleccion(base, 'operacion_perfil_nuevo_123', base.profesionales[1]));
      expect(nuevo.estado).toBe('rechazada');
      expect(await contarPublicas(db, 'citas', base.negocioId)).toBe(0);
      await Promise.all([moduloA.close(), moduloB.close()]);
    });
  }, 120000);

  it.each([
    ['vencimiento', false],
    ['suspensión exacta de 48 horas', true],
  ])('T093: %s confirmada durante la espera impide la reserva', async (_caso, suspender) => {
    await conBaseMigrada(async (db, segunda) => {
      const reloj = new RelojPrueba(AHORA);
      const base = await sembrarBase(db, reloj);
      const [moduloA, moduloB] = await Promise.all([crearModulo(db, reloj), crearModulo(segunda, reloj)]);
      const envio = await prepararEnvio(moduloA, db, base, suspender ? 'c' : 'd');
      if (!suspender) {
        await db.query('UPDATE licencias SET vence_en=? WHERE id=?',
          [new Date(AHORA.getTime() + 60_000), base.licenciaId]);
      }
      const resultado = await ejecutarTrasBloqueo(segunda,
        'SELECT id FROM usuarios WHERE id=? FOR UPDATE', [base.profesionales[0]],
        () => moduloA.get(RegistroReservaPublicaService).registrar(
          base.negocioId, envio.titular, envio.clave, CONTACTO),
        async () => {
          if (suspender) {
            await moduloB.get(LicenciasService).suspender(
              base.superadminId, base.licenciaId, AHORA);
            reloj.avanzar(48 * 60 * 60 * 1000);
          } else reloj.avanzar(60_000);
        });
      expect(resultado.status).toBe('rejected');
      // La capa interna expresa la licencia cerrada como selección no disponible
      // (404) o conflicto (409); ambas niegan la nueva escritura sin filtrar datos.
      if (resultado.status === 'rejected') {
        expect([404, 409]).toContain(resultado.reason.status);
      }
      expect(await contarPublicas(db, 'citas', base.negocioId)).toBe(0);
      expect((await db.query(`SELECT estado FROM intentos_reserva_publica
        WHERE clave=?`, [envio.clave]))[0].estado).toBe('preparado');
      await Promise.all([moduloA.close(), moduloB.close()]);
    });
  }, 120000);

  it('T093: un resultado guardado se recupera aunque la licencia ya no admita reservas', async () => {
    await conBaseMigrada(async (db) => {
      const reloj = new RelojPrueba(AHORA);
      const base = await sembrarBase(db, reloj);
      const modulo = await crearModulo(db, reloj);
      const envio = await prepararEnvio(modulo, db, base, 'e');
      const guardado = await modulo.get(RegistroReservaPublicaService).registrar(
        base.negocioId, envio.titular, envio.clave, CONTACTO);
      await db.query('UPDATE licencias SET vence_en=? WHERE id=?', [AHORA, base.licenciaId]);
      reloj.avanzar(10 * 60 * 1000);
      const recuperado = await modulo.get(ResolucionReservaPublicaService).resolver(
        base.negocioId, envio.titular, envio.clave, envio.apartado.apartadoId!);
      expect(recuperado).toEqual({ estado: 'registrado', resultado: guardado });
      await modulo.close();
    });
  }, 120000);

  it('T094: el mismo intento concurrente devuelve una sola cita y el mismo folio', async () => {
    await conBaseMigrada(async (db, segunda) => {
      const reloj = new RelojPrueba(AHORA);
      const base = await sembrarBase(db, reloj);
      const [moduloA, moduloB] = await Promise.all([crearModulo(db, reloj), crearModulo(segunda, reloj)]);
      const envio = await prepararEnvio(moduloA, db, base, 'f');
      const barrera = new BarreraDosParticipantes();
      const respuestas = await Promise.all([moduloA, moduloB].map(async (modulo) => {
        await barrera.esperar();
        return modulo.get(RegistroReservaPublicaService).registrar(
          base.negocioId, envio.titular, envio.clave, CONTACTO);
      }));
      expect(respuestas[0]).toEqual(respuestas[1]);
      expect(await contarPublicas(db, 'citas', base.negocioId)).toBe(1);
      expect(await contarPublicas(db, 'clientes', base.negocioId)).toBe(1);
      await Promise.all([moduloA.close(), moduloB.close()]);
    });
  }, 120000);

  it('T094: otro intento no consume dos veces el apartado y un fallo revierte todo', async () => {
    await conBaseMigrada(async (db, segunda) => {
      const reloj = new RelojPrueba(AHORA);
      const base = await sembrarBase(db, reloj);
      const [moduloA, moduloB] = await Promise.all([crearModulo(db, reloj), crearModulo(segunda, reloj)]);
      const envio = await prepararEnvio(moduloA, db, base, '1');
      const otraClave = 'intento_otro_mismo_apartado';
      await moduloB.get(IntentosReservaPublicaService).preparar(base.negocioId, envio.titular,
        { clave: otraClave, apartadoId: envio.apartado.apartadoId });
      await db.query(`CREATE TRIGGER fallo_t094 BEFORE UPDATE ON intentos_reserva_publica
        FOR EACH ROW BEGIN IF NEW.estado='registrado' THEN SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT='fallo controlado T094'; END IF; END`);
      try {
        await expect(moduloA.get(RegistroReservaPublicaService).registrar(
          base.negocioId, envio.titular, envio.clave, CONTACTO)).rejects.toThrow();
      } finally {
        await db.query('DROP TRIGGER fallo_t094');
      }
      expect(await contarPublicas(db, 'citas', base.negocioId)).toBe(0);
      expect((await db.query('SELECT liberado_en FROM bloqueos_temporales WHERE id=?',
        [envio.apartado.apartadoId]))[0].liberado_en).toBeNull();
      const barrera = new BarreraDosParticipantes();
      const resultados = await Promise.allSettled([
        [moduloA, envio.clave], [moduloB, otraClave],
      ].map(async ([modulo, clave]) => {
        await barrera.esperar();
        return (modulo as TestingModule).get(RegistroReservaPublicaService).registrar(
          base.negocioId, envio.titular, clave as string, CONTACTO);
      }));
      expect(resultados.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
      const rechazo = resultados.find((r) => r.status === 'rejected') as PromiseRejectedResult;
      expect(rechazo.reason).toMatchObject({ status: 409 });
      expect(await contarPublicas(db, 'citas', base.negocioId)).toBe(1);
      await Promise.all([moduloA.close(), moduloB.close()]);
    });
  }, 120000);

  it.each([
    ['escritor', true],
    ['resolutor', false],
  ])('T095: si gana el %s el estado durable gobierna al perdedor', async (_caso, escritorPrimero) => {
    await conBaseMigrada(async (db, segunda) => {
      const reloj = new RelojPrueba(AHORA);
      const base = await sembrarBase(db, reloj);
      const [moduloA, moduloB] = await Promise.all([crearModulo(db, reloj), crearModulo(segunda, reloj)]);
      const envio = await prepararEnvio(moduloA, db, base, escritorPrimero ? '2' : '3');
      const escribir = () => moduloA.get(RegistroReservaPublicaService).registrar(
        base.negocioId, envio.titular, envio.clave, CONTACTO);
      const resolver = () => moduloB.get(ResolucionReservaPublicaService).resolver(
        base.negocioId, envio.titular, envio.clave, envio.apartado.apartadoId!);
      const [primero, segundo] = escritorPrimero
        ? await encolarSobreSesion(db, base, envio.titular, escribir, resolver)
        : await encolarSobreSesion(db, base, envio.titular, resolver, escribir);
      expect(primero.status).toBe('fulfilled');
      if (escritorPrimero) {
        expect(segundo.status).toBe('fulfilled');
        if (segundo.status === 'fulfilled') expect(segundo.value).toMatchObject({ estado: 'registrado' });
        expect(await contarPublicas(db, 'citas', base.negocioId)).toBe(1);
      } else {
        if (primero.status === 'fulfilled') expect(primero.value).toEqual({ estado: 'no_registrado' });
        expect(segundo.status).toBe('rejected');
        expect(await contarPublicas(db, 'citas', base.negocioId)).toBe(0);
      }
      await Promise.all([moduloA.close(), moduloB.close()]);
    });
  }, 120000);

  it('T095: agotar la espera responde 503 y conserva el intento incierto', async () => {
    await conBaseMigrada(async (db, segunda) => {
      const reloj = new RelojPrueba(AHORA);
      const base = await sembrarBase(db, reloj);
      const preparador = await crearModulo(db, reloj);
      const envio = await prepararEnvio(preparador, db, base, '4');
      // Pool de una conexión: el timeout configurado pertenece también a las
      // tres transacciones de reintento del resolutor.
      const timeoutDb = new DataSource({ ...segunda.options, poolSize: 1 } as DataSourceOptions);
      await timeoutDb.initialize();
      const moduloTimeout = await crearModulo(timeoutDb, reloj);
      await timeoutDb.query('SET SESSION innodb_lock_wait_timeout=1');
      const runner = db.createQueryRunner();
      await runner.connect();
      await runner.startTransaction('READ COMMITTED');
      try {
        await runner.query(`SELECT id FROM sesiones_reserva_publica
          WHERE negocio_id=? AND titular_hash=? FOR UPDATE`, [base.negocioId, envio.titular]);
        await expect(moduloTimeout.get(ResolucionReservaPublicaService).resolver(
          base.negocioId, envio.titular, envio.clave, envio.apartado.apartadoId!))
          .rejects.toMatchObject({ status: 503 });
      } finally {
        await runner.rollbackTransaction();
        await runner.release();
      }
      expect((await db.query('SELECT estado FROM intentos_reserva_publica WHERE clave=?',
        [envio.clave]))[0].estado).toBe('preparado');
      await Promise.all([preparador.close(), moduloTimeout.close()]);
      // TestingModule puede cerrar el proveedor inyectado; solo destruimos el
      // pool si continúa abierto para no convertir la limpieza en un falso rojo.
      if (timeoutDb.isInitialized) await timeoutDb.destroy();
    });
  }, 120000);

  it('T096: resolver antes de una preparación atrasada cierra la clave', async () => {
    await conBaseMigrada(async (db, segunda) => {
      const reloj = new RelojPrueba(AHORA);
      const base = await sembrarBase(db, reloj);
      const [moduloA, moduloB] = await Promise.all([crearModulo(db, reloj), crearModulo(segunda, reloj)]);
      const titular = await crearSesion(db, base, '5');
      const apartado = await moduloA.get(ApartadosService).solicitar(base.negocioId, titular,
        seleccion(base, 'operacion_preparacion_atrasada'));
      const clave = 'intento_preparacion_atrasada';
      const [cierre, preparacion] = await encolarSobreSesion(db, base, titular,
        () => moduloA.get(ResolucionReservaPublicaService).resolver(
          base.negocioId, titular, clave, apartado.apartadoId!),
        () => moduloB.get(IntentosReservaPublicaService).preparar(base.negocioId, titular,
          { clave, apartadoId: apartado.apartadoId }));
      expect(cierre).toMatchObject({ status: 'fulfilled', value: { estado: 'no_registrado' } });
      expect(preparacion.status).toBe('rejected');
      await expect(moduloB.get(RegistroReservaPublicaService).registrar(
        base.negocioId, titular, clave, CONTACTO)).rejects.toMatchObject({ status: 409 });
      expect(await contarPublicas(db, 'citas', base.negocioId)).toBe(0);
      await Promise.all([moduloA.close(), moduloB.close()]);
    });
  }, 120000);

  it('T096: una respuesta perdida se recupera después de vencer el apartado', async () => {
    await conBaseMigrada(async (db) => {
      const reloj = new RelojPrueba(AHORA);
      const base = await sembrarBase(db, reloj);
      const modulo = await crearModulo(db, reloj);
      const envio = await prepararEnvio(modulo, db, base, '6');
      // Se espera el commit, pero deliberadamente no se conserva la respuesta del escritor.
      await modulo.get(RegistroReservaPublicaService).registrar(
        base.negocioId, envio.titular, envio.clave, CONTACTO);
      const folioPersistido = String((await db.query(`SELECT folio FROM citas
        WHERE negocio_id=? AND origen='portal_publico'`, [base.negocioId]))[0].folio);
      reloj.avanzar(10 * 60 * 1000);
      await db.query('UPDATE licencias SET vence_en=? WHERE id=?', [AHORA, base.licenciaId]);
      const recuperado = await modulo.get(ResolucionReservaPublicaService).resolver(
        base.negocioId, envio.titular, envio.clave, envio.apartado.apartadoId!);
      expect(recuperado).toMatchObject({ estado: 'registrado',
        resultado: { folio: folioPersistido, estado: 'pendiente' } });
      expect(await contarPublicas(db, 'citas', base.negocioId)).toBe(1);
      await modulo.close();
    });
  }, 120000);
});
