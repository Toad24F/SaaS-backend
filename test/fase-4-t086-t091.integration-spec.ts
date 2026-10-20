import { Test, type TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { DataSource, type QueryRunner } from 'typeorm';
import { AppModule } from '../src/app.module';
import { RELOJ } from '../src/comun/reloj';
import { ConfiguracionAgendaService } from '../src/disponibilidad/configuracion-agenda.service';
import { CitasAfectadasService } from '../src/disponibilidad/citas-afectadas.service';
import { HorariosService } from '../src/horarios/horarios.service';
import { ApartadosService, type ResultadoApartado } from '../src/reservas-publicas/apartados.service';
import { IntentosReservaPublicaService } from '../src/reservas-publicas/intentos-reserva-publica.service';
import { RegistroReservaPublicaService } from '../src/reservas-publicas/registro-reserva-publica.service';
import { ServiciosService } from '../src/servicios/servicios.service';
import { conBaseMigrada } from './support/mariadb';
import { crearEscenarioPortal } from './support/escenario-portal';
import { RelojPrueba } from './support/reloj';

const AHORA = new Date('2026-10-20T12:00:00.000Z');
const CONTACTO = { nombre: 'Cliente de carrera', telefono: '614-123-4567' };

interface BaseCarrera {
  negocioId: number;
  profesionalId: number;
  sucursales: [number, number];
  servicioId: number;
  adminId: number;
}

interface EnvioPreparado {
  titular: string;
  clave: string;
  apartado: ResultadoApartado;
}

/** Libera dos trabajos únicamente cuando ambos están listos para competir. */
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

/** Siembra dos sedes cuya misma franja UTC cae en fechas locales distintas. */
async function sembrarBase(db: DataSource, reloj: RelojPrueba): Promise<BaseCarrera> {
  const { negocios: [negocio] } = await crearEscenarioPortal(db, reloj);
  await db.query('DELETE FROM bloqueos_temporales WHERE negocio_id=?', [negocio.id]);
  await db.query('DELETE FROM citas WHERE negocio_id=?', [negocio.id]);
  await db.query('DELETE FROM clientes WHERE negocio_id=?', [negocio.id]);
  await db.query(`INSERT INTO licencias (negocio_id,creado_en,habilitada_en,vence_en)
    VALUES (?,'2026-01-01','2026-01-01','2027-01-01')`, [negocio.id]);
  const admin = await db.query(`INSERT INTO usuarios
    (negocio_id,nombre,email,password_hash,rol,activo,activado_en)
    VALUES (?,'Admin carreras','admin-carreras@example.test','hash','admin_negocio',1,?)`,
  [negocio.id, AHORA]);
  const servicioId = Number((await db.query(`SELECT id FROM servicios
    WHERE negocio_id=? AND activo=1 LIMIT 1`, [negocio.id]))[0].id);
  const profesionalId = negocio.profesionales[0];
  const primera = negocio.sucursales[0].id;
  const segunda = negocio.sucursales[1].id;
  await db.query(`UPDATE sucursales SET activo=1,zona_horaria='Pacific/Kiritimati'
    WHERE negocio_id=? AND id=?`, [negocio.id, segunda]);
  await db.query(`INSERT INTO personal_sucursales
    (negocio_id,personal_id,sucursal_id,activo) VALUES (?,?,?,1)
    ON DUPLICATE KEY UPDATE activo=1`, [negocio.id, profesionalId, segunda]);
  await db.query(`INSERT INTO personal_servicios_sucursales
    (negocio_id,personal_id,sucursal_id,servicio_id,activo) VALUES (?,?,?,?,1)
    ON DUPLICATE KEY UPDATE activo=1`, [negocio.id, profesionalId, segunda, servicioId]);
  // Martes 08:00 Chihuahua y miércoles 04:00 Kiritimati empiezan a las 14:00 UTC.
  await db.query(`INSERT INTO horarios_personal
    (negocio_id,personal_id,sucursal_id,dia_semana,orden,inicio_minutos,fin_minutos,activo)
    VALUES (?,?,?,2,0,480,720,1),(?,?,?,3,1,240,480,1)`,
  [negocio.id, profesionalId, primera, negocio.id, profesionalId, segunda]);
  return { negocioId: negocio.id, profesionalId, sucursales: [primera, segunda],
    servicioId, adminId: Number(admin.insertId) };
}

async function crearSesion(db: DataSource, base: BaseCarrera, semilla: string): Promise<string> {
  const titular = semilla.repeat(64).slice(0, 64);
  await db.query(`INSERT INTO sesiones_reserva_publica
    (negocio_id,titular_hash,generacion) VALUES (?,?,0)`, [base.negocioId, titular]);
  return titular;
}

function seleccion(base: BaseCarrera, clave: string, sede = 0, horaInicio = '08:00',
  fechaLocal = '2026-10-20') {
  return { clave, personalId: base.profesionalId, sucursalId: base.sucursales[sede],
    servicioId: base.servicioId, fechaLocal, horaInicio };
}

async function prepararEnvio(modulo: TestingModule, db: DataSource, base: BaseCarrera,
  semilla: string, cambios: Partial<ReturnType<typeof seleccion>> = {}): Promise<EnvioPreparado> {
  const titular = await crearSesion(db, base, semilla);
  const claveOperacion = `operacion_${semilla.repeat(12)}`;
  const apartado = await modulo.get(ApartadosService).solicitar(base.negocioId, titular,
    { ...seleccion(base, claveOperacion), ...cambios });
  expect(apartado.estado).toBe('concedida');
  const clave = `intento_${semilla.repeat(12)}`;
  await modulo.get(IntentosReservaPublicaService).preparar(base.negocioId, titular,
    { clave, apartadoId: apartado.apartadoId });
  return { titular, clave, apartado };
}

/** Mantiene una fila bloqueada para situar al escritor exactamente antes de
 * su lectura protegida; el callback confirma el cambio competidor primero. */
async function escritorEsperaFila<T>(conexionBarrera: DataSource, sql: string,
  parametros: unknown[], iniciar: () => Promise<T>, mientrasEspera: () => Promise<void>,
): Promise<PromiseSettledResult<T>> {
  const runner = conexionBarrera.createQueryRunner();
  await runner.connect();
  await runner.startTransaction('READ COMMITTED');
  let escritor: Promise<T> | undefined;
  let falloIntermedio: unknown;
  try {
    await runner.query(sql, parametros);
    let termino = false;
    escritor = iniciar().then((valor) => { termino = true; return valor; });
    try {
      await new Promise((resolver) => setTimeout(resolver, 80));
      expect(termino).toBe(false);
      await mientrasEspera();
    } catch (error) { falloIntermedio = error; }
    await runner.commitTransaction();
  } finally {
    if (runner.isTransactionActive) await runner.rollbackTransaction();
    await runner.release();
  }
  const resultado = (await Promise.allSettled([escritor!]))[0];
  if (falloIntermedio) throw falloIntermedio;
  return resultado;
}

async function contar(db: DataSource, tabla: string, negocioId: number): Promise<number> {
  return Number((await db.query(`SELECT COUNT(*) n FROM ${tabla} WHERE negocio_id=?`,
    [negocioId]))[0].n);
}

describe('M3-T086–T091: carreras del escritor público real', () => {
  const secretoAnterior = process.env.PORTAL_FORMULARIO_HMAC_SECRET;

  beforeAll(() => {
    process.env.PORTAL_FORMULARIO_HMAC_SECRET = 'secreto-carreras-publicas-123456789';
  });

  afterAll(() => {
    if (secretoAnterior === undefined) delete process.env.PORTAL_FORMULARIO_HMAC_SECRET;
    else process.env.PORTAL_FORMULARIO_HMAC_SECRET = secretoAnterior;
  });

  it('T086: dos conexiones sobre el mismo intervalo dejan una sola ocupación', async () => {
    await conBaseMigrada(async (db, segunda) => {
      const reloj = new RelojPrueba(AHORA);
      const base = await sembrarBase(db, reloj);
      const [moduloA, moduloB] = await Promise.all([
        crearModulo(db, reloj), crearModulo(segunda, reloj),
      ]);
      try {
        const titulares = await Promise.all([
          crearSesion(db, base, 'a'), crearSesion(db, base, 'b'),
        ]);
        const barrera = new BarreraDosParticipantes();
        const resultados = await Promise.all([moduloA, moduloB].map(async (modulo, indice) => {
          await barrera.esperar();
          return modulo.get(ApartadosService).solicitar(base.negocioId, titulares[indice],
            seleccion(base, `operacion_mismo_${indice}_123456`));
        }));
        expect(resultados.map((r) => r.estado).sort()).toEqual(['concedida', 'rechazada']);
        const ganador = resultados.findIndex((r) => r.estado === 'concedida');
        const perdedor = ganador === 0 ? 1 : 0;
        const modulos = [moduloA, moduloB];
        const claves = ['intento_mismo_a_123456', 'intento_mismo_b_123456'];
        await modulos[ganador].get(IntentosReservaPublicaService).preparar(base.negocioId,
          titulares[ganador], { clave: claves[ganador],
            apartadoId: resultados[ganador].apartadoId });
        // El segundo navegador solo puede obtener el intervalo cuando el primer
        // apartado deja de ser vigente; aun así ambos envíos llegan al escritor.
        await modulos[ganador].get(ApartadosService).liberar(base.negocioId,
          titulares[ganador], resultados[ganador].apartadoId!, resultados[ganador].generacion);
        const segundo = await modulos[perdedor].get(ApartadosService).solicitar(base.negocioId,
          titulares[perdedor], seleccion(base, `operacion_reintento_${perdedor}_123`));
        expect(segundo.estado).toBe('concedida');
        await modulos[perdedor].get(IntentosReservaPublicaService).preparar(base.negocioId,
          titulares[perdedor], { clave: claves[perdedor], apartadoId: segundo.apartadoId });
        const barreraEnvios = new BarreraDosParticipantes();
        const envios = await Promise.allSettled(modulos.map(async (modulo, indice) => {
          await barreraEnvios.esperar();
          return modulo.get(RegistroReservaPublicaService).registrar(base.negocioId,
            titulares[indice], claves[indice], { ...CONTACTO, nombre: `Cliente ${indice}` });
        }));
        expect(envios.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
        const conflicto = envios.find((r) => r.status === 'rejected') as PromiseRejectedResult;
        expect(conflicto.reason).toMatchObject({ status: 409 });
        expect(await contar(db, 'citas', base.negocioId)).toBe(1);
        expect(await contar(db, 'clientes', base.negocioId)).toBe(1);
      } finally {
        await Promise.all([moduloA.close(), moduloB.close()]);
      }
    });
  }, 120000);

  it('T087: rechaza traslape parcial entre sedes con fechas locales distintas', async () => {
    await conBaseMigrada(async (db, segunda) => {
      const reloj = new RelojPrueba(AHORA);
      const base = await sembrarBase(db, reloj);
      const [moduloA, moduloB] = await Promise.all([
        crearModulo(db, reloj), crearModulo(segunda, reloj),
      ]);
      try {
        const titulares = await Promise.all([
          crearSesion(db, base, 'c'), crearSesion(db, base, 'd'),
        ]);
        const barrera = new BarreraDosParticipantes();
        const entradas = [
          seleccion(base, 'operacion_parcial_a_123456'),
          seleccion(base, 'operacion_parcial_b_123456', 1, '04:15', '2026-10-21'),
        ];
        const resultados = await Promise.all([moduloA, moduloB].map(async (modulo, indice) => {
          await barrera.esperar();
          return modulo.get(ApartadosService).solicitar(base.negocioId,
            titulares[indice], entradas[indice]);
        }));
        expect(resultados.map((r) => r.estado).sort()).toEqual(['concedida', 'rechazada']);
        const ganador = resultados.findIndex((r) => r.estado === 'concedida');
        const perdedor = ganador === 0 ? 1 : 0;
        const modulos = [moduloA, moduloB];
        const claves = ['intento_parcial_a_12345', 'intento_parcial_b_12345'];
        await modulos[ganador].get(IntentosReservaPublicaService).preparar(base.negocioId,
          titulares[ganador], { clave: claves[ganador],
            apartadoId: resultados[ganador].apartadoId });
        await modulos[ganador].get(ApartadosService).liberar(base.negocioId,
          titulares[ganador], resultados[ganador].apartadoId!, resultados[ganador].generacion);
        const segundo = await modulos[perdedor].get(ApartadosService).solicitar(base.negocioId,
          titulares[perdedor], { ...entradas[perdedor],
            clave: `operacion_parcial_reintento_${perdedor}` });
        expect(segundo.estado).toBe('concedida');
        await modulos[perdedor].get(IntentosReservaPublicaService).preparar(base.negocioId,
          titulares[perdedor], { clave: claves[perdedor], apartadoId: segundo.apartadoId });
        const barreraEnvios = new BarreraDosParticipantes();
        const envios = await Promise.allSettled(modulos.map(async (modulo, indice) => {
          await barreraEnvios.esperar();
          return modulo.get(RegistroReservaPublicaService).registrar(base.negocioId,
            titulares[indice], claves[indice], { ...CONTACTO, nombre: `Parcial ${indice}` });
        }));
        expect(envios.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
        const conflicto = envios.find((r) => r.status === 'rejected') as PromiseRejectedResult;
        expect(conflicto.reason).toMatchObject({ status: 409 });
        expect(await contar(db, 'citas', base.negocioId)).toBe(1);
      } finally {
        await Promise.all([moduloA.close(), moduloB.close()]);
      }
    });
  }, 120000);

  it('T087: permite extremos contiguos entre sedes y registra ambas citas', async () => {
    await conBaseMigrada(async (db, segunda) => {
      const reloj = new RelojPrueba(AHORA);
      const base = await sembrarBase(db, reloj);
      const [moduloA, moduloB] = await Promise.all([
        crearModulo(db, reloj), crearModulo(segunda, reloj),
      ]);
      try {
        const titulares = await Promise.all([
          crearSesion(db, base, 'e'), crearSesion(db, base, 'f'),
        ]);
        const barrera = new BarreraDosParticipantes();
        const entradas = [
          seleccion(base, 'operacion_contigua_a_123'),
          seleccion(base, 'operacion_contigua_b_123', 1, '04:30', '2026-10-21'),
        ];
        const apartados = await Promise.all([moduloA, moduloB].map(async (modulo, indice) => {
          await barrera.esperar();
          return modulo.get(ApartadosService).solicitar(base.negocioId,
            titulares[indice], entradas[indice]);
        }));
        expect(apartados.map((a) => a.estado)).toEqual(['concedida', 'concedida']);
        for (const indice of [0, 1]) {
          const modulo = [moduloA, moduloB][indice];
          const clave = `intento_contiguo_${indice}_12345`;
          await modulo.get(IntentosReservaPublicaService).preparar(base.negocioId,
            titulares[indice], { clave, apartadoId: apartados[indice].apartadoId });
          await modulo.get(RegistroReservaPublicaService).registrar(base.negocioId,
            titulares[indice], clave, { ...CONTACTO, nombre: `Cliente ${indice}` });
        }
        const citas = await db.query(`SELECT inicio_utc,fin_utc FROM citas
          WHERE negocio_id=? ORDER BY inicio_utc`, [base.negocioId]);
        expect(citas).toHaveLength(2);
        expect(new Date(citas[0].fin_utc).getTime()).toBe(new Date(citas[1].inicio_utc).getTime());
      } finally {
        await Promise.all([moduloA.close(), moduloB.close()]);
      }
    });
  }, 120000);

  it('T088: al vencer exactamente mientras espera no consume ni crea cita', async () => {
    await conBaseMigrada(async (db, segunda) => {
      const reloj = new RelojPrueba(AHORA);
      const base = await sembrarBase(db, reloj);
      const modulo = await crearModulo(db, reloj);
      try {
        const envio = await prepararEnvio(modulo, db, base, '0');
        const resultado = await escritorEsperaFila(segunda,
          'SELECT id FROM usuarios WHERE id=? FOR UPDATE', [base.profesionalId],
          () => modulo.get(RegistroReservaPublicaService).registrar(base.negocioId,
            envio.titular, envio.clave, CONTACTO),
          async () => { reloj.fijar(envio.apartado.expiraEn!); });
        expect(resultado.status).toBe('rejected');
        expect(await contar(db, 'citas', base.negocioId)).toBe(0);
        const intento = (await db.query(`SELECT estado FROM intentos_reserva_publica
          WHERE negocio_id=? AND clave=?`, [base.negocioId, envio.clave]))[0];
        const apartado = (await db.query(`SELECT liberado_en,expira_en FROM bloqueos_temporales
          WHERE negocio_id=? AND id=?`, [base.negocioId, envio.apartado.apartadoId]))[0];
        expect(intento.estado).toBe('preparado');
        expect(apartado.liberado_en).toBeNull();
        expect(new Date(apartado.expira_en)).toEqual(envio.apartado.expiraEn);
      } finally { await modulo.close(); }
    });
  }, 120000);

  it('T089: un costo confirmado primero conserva el aceptado por el apartado', async () => {
    await conBaseMigrada(async (db, segunda) => {
      const reloj = new RelojPrueba(AHORA);
      const base = await sembrarBase(db, reloj);
      const [moduloA, moduloB] = await Promise.all([
        crearModulo(db, reloj), crearModulo(segunda, reloj),
      ]);
      try {
        const envio = await prepararEnvio(moduloA, db, base, '1');
        const resultado = await escritorEsperaFila(segunda,
          'SELECT id FROM usuarios WHERE id=? FOR UPDATE', [base.profesionalId],
          () => moduloA.get(RegistroReservaPublicaService).registrar(base.negocioId,
            envio.titular, envio.clave, CONTACTO),
          async () => { await moduloB.get(ServiciosService).editar(base.adminId,
            base.servicioId, { costo: '250.00' });
          const servicio = (await db.query(`SELECT costo,duracion_minutos,activo
            FROM servicios WHERE id=?`, [base.servicioId]))[0];
          expect(servicio).toMatchObject({ costo: '250.00', duracion_minutos: 30, activo: 1 }); });
        if (resultado.status === 'rejected') throw resultado.reason;
        expect(resultado).toMatchObject({ status: 'fulfilled',
          value: expect.objectContaining({ costoAceptado: '100.00' }) });
        const cita = (await db.query(`SELECT costo_aceptado FROM citas
          WHERE negocio_id=?`, [base.negocioId]))[0];
        expect(cita.costo_aceptado).toBe('100.00');
      } finally { await Promise.all([moduloA.close(), moduloB.close()]); }
    });
  }, 120000);

  it.each([
    ['oferta', async (servicios: ServiciosService, base: BaseCarrera) =>
      servicios.cambiarEstado(base.adminId, base.servicioId, false)],
    ['duración', async (servicios: ServiciosService, base: BaseCarrera) =>
      servicios.editar(base.adminId, base.servicioId, { duracionMinutos: 45 })],
  ])('T089: revalida %s confirmada antes que la reserva', async (_caso, mutar) => {
    await conBaseMigrada(async (db, segunda) => {
      const reloj = new RelojPrueba(AHORA);
      const base = await sembrarBase(db, reloj);
      const [moduloA, moduloB] = await Promise.all([
        crearModulo(db, reloj), crearModulo(segunda, reloj),
      ]);
      try {
        const envio = await prepararEnvio(moduloA, db, base, '2');
        const resultado = await escritorEsperaFila(segunda,
          'SELECT id FROM usuarios WHERE id=? FOR UPDATE', [base.profesionalId],
          () => moduloA.get(RegistroReservaPublicaService).registrar(base.negocioId,
            envio.titular, envio.clave, CONTACTO),
          async () => { await mutar(moduloB.get(ServiciosService), base); });
        expect(resultado.status).toBe('rejected');
        expect(await contar(db, 'citas', base.negocioId)).toBe(0);
        expect((await db.query(`SELECT liberado_en FROM bloqueos_temporales
          WHERE id=?`, [envio.apartado.apartadoId]))[0].liberado_en).toBeNull();
      } finally { await Promise.all([moduloA.close(), moduloB.close()]); }
    });
  }, 120000);

  it('T089: si la reserva confirma primero, cambios posteriores no la mutan', async () => {
    await conBaseMigrada(async (db, segunda) => {
      const reloj = new RelojPrueba(AHORA);
      const base = await sembrarBase(db, reloj);
      const [moduloA, moduloB] = await Promise.all([
        crearModulo(db, reloj), crearModulo(segunda, reloj),
      ]);
      let runner: QueryRunner | undefined;
      try {
        const envio = await prepararEnvio(moduloA, db, base, '3');
        runner = segunda.createQueryRunner();
        await runner.connect();
        await runner.startTransaction('READ COMMITTED');
        await runner.query('SELECT id FROM servicios WHERE id=? FOR UPDATE', [base.servicioId]);
        const reserva = moduloA.get(RegistroReservaPublicaService).registrar(base.negocioId,
          envio.titular, envio.clave, CONTACTO);
        await new Promise((resolver) => setTimeout(resolver, 80));
        const cambio = moduloB.get(ServiciosService).editar(base.adminId,
          base.servicioId, { costo: '300.00', duracionMinutos: 45 });
        await new Promise((resolver) => setTimeout(resolver, 80));
        await runner.commitTransaction();
        const resultado = await reserva;
        await cambio;
        expect(resultado.costoAceptado).toBe('100.00');
        const cita = (await db.query(`SELECT costo_aceptado,inicio_utc,fin_utc
          FROM citas WHERE negocio_id=?`, [base.negocioId]))[0];
        expect(cita.costo_aceptado).toBe('100.00');
        expect(new Date(cita.fin_utc).getTime() - new Date(cita.inicio_utc).getTime())
          .toBe(30 * 60_000);
      } finally {
        if (runner?.isTransactionActive) await runner.rollbackTransaction();
        if (runner) await runner.release();
        await Promise.all([moduloA.close(), moduloB.close()]);
      }
    });
  }, 120000);

  it.each([
    ['anticipación', { modo: 'ventana_libre', intervaloMinutos: 15,
      anticipacionMinutos: 180, diasFuturos: 60 }, {}],
    ['horizonte', { modo: 'ventana_libre', intervaloMinutos: 15,
      anticipacionMinutos: 15, diasFuturos: 0 },
    { fechaLocal: '2026-10-21', horaInicio: '08:00' }],
  ])('T090: no usa %s obsoleta después de esperar', async (_caso, configuracion, cambios) => {
    await conBaseMigrada(async (db, segunda) => {
      const reloj = new RelojPrueba(AHORA);
      const base = await sembrarBase(db, reloj);
      if (cambios.fechaLocal) {
        await db.query(`INSERT INTO horarios_personal
          (negocio_id,personal_id,sucursal_id,dia_semana,orden,inicio_minutos,fin_minutos,activo)
          VALUES (?,?,?,3,2,480,720,1)`, [base.negocioId, base.profesionalId, base.sucursales[0]]);
      }
      const [moduloA, moduloB] = await Promise.all([
        crearModulo(db, reloj), crearModulo(segunda, reloj),
      ]);
      try {
        const envio = await prepararEnvio(moduloA, db, base, '4', cambios);
        const resultado = await escritorEsperaFila(segunda,
          'SELECT id FROM usuarios WHERE id=? FOR UPDATE', [base.profesionalId],
          () => moduloA.get(RegistroReservaPublicaService).registrar(base.negocioId,
            envio.titular, envio.clave, CONTACTO),
          async () => { await moduloB.get(ConfiguracionAgendaService)
            .guardar(base.adminId, configuracion); });
        expect(resultado.status).toBe('rejected');
        expect(await contar(db, 'citas', base.negocioId)).toBe(0);
      } finally { await Promise.all([moduloA.close(), moduloB.close()]); }
    });
  }, 120000);

  it('T090: el cambio a agenda compacta invalida una ranura ya no ofrecida', async () => {
    await conBaseMigrada(async (db, segunda) => {
      const reloj = new RelojPrueba(AHORA);
      const base = await sembrarBase(db, reloj);
      const cliente = await db.query(`INSERT INTO clientes
        (negocio_id,nombre_completo,telefono) VALUES (?,'Ocupación','6140000000')`, [base.negocioId]);
      await db.query(`INSERT INTO citas
        (negocio_id,sucursal_id,personal_id,servicio_id,cliente_id,inicio_utc,fin_utc,
         zona_horaria_reserva,folio,estado,origen)
        VALUES (?,?,?,?,?,'2026-10-20 15:00:00','2026-10-20 15:30:00',
          'America/Chihuahua','COMPACTA-1','pendiente','manual')`,
      [base.negocioId, base.sucursales[0], base.profesionalId,
        base.servicioId, Number(cliente.insertId)]);
      const [moduloA, moduloB] = await Promise.all([
        crearModulo(db, reloj), crearModulo(segunda, reloj),
      ]);
      try {
        const envio = await prepararEnvio(moduloA, db, base, '5');
        const resultado = await escritorEsperaFila(segunda,
          'SELECT id FROM usuarios WHERE id=? FOR UPDATE', [base.profesionalId],
          () => moduloA.get(RegistroReservaPublicaService).registrar(base.negocioId,
            envio.titular, envio.clave, CONTACTO),
          async () => { await moduloB.get(ConfiguracionAgendaService).guardar(base.adminId,
            { modo: 'agenda_compacta', intervaloMinutos: 15,
              anticipacionMinutos: 15, diasFuturos: 60 }); });
        expect(resultado.status).toBe('rejected');
        expect(await contar(db, 'citas', base.negocioId)).toBe(1);
      } finally { await Promise.all([moduloA.close(), moduloB.close()]); }
    });
  }, 120000);

  it('T091: una excepción vacía confirmada primero rechaza la reserva', async () => {
    await conBaseMigrada(async (db, segunda) => {
      const reloj = new RelojPrueba(AHORA);
      const base = await sembrarBase(db, reloj);
      const [moduloA, moduloB] = await Promise.all([
        crearModulo(db, reloj), crearModulo(segunda, reloj),
      ]);
      try {
        // Este caso no necesita la segunda recurrencia cruzada de T087; retirarla
        // deja que la mutación real valide su calendario antes de competir.
        await db.query(`DELETE FROM horarios_personal WHERE negocio_id=?
          AND personal_id=? AND sucursal_id=?`,
        [base.negocioId, base.profesionalId, base.sucursales[1]]);
        const envio = await prepararEnvio(moduloA, db, base, '6');
        const resultado = await escritorEsperaFila(segunda,
          'SELECT id FROM usuarios WHERE id=? FOR UPDATE', [base.profesionalId],
          () => moduloA.get(RegistroReservaPublicaService).registrar(base.negocioId,
            envio.titular, envio.clave, CONTACTO),
          async () => { await moduloB.get(HorariosService).guardarExcepcion(base.negocioId,
            base.profesionalId, '2026-10-20', base.sucursales[0], [], '2026-10-20'); });
        expect(resultado.status).toBe('rejected');
        expect(await contar(db, 'citas', base.negocioId)).toBe(0);
      } finally { await Promise.all([moduloA.close(), moduloB.close()]); }
    });
  }, 120000);

  it('T091: reserva primero, conserva la cita y luego informa horario afectado', async () => {
    await conBaseMigrada(async (db, segunda) => {
      const reloj = new RelojPrueba(AHORA);
      const base = await sembrarBase(db, reloj);
      const sesionId = randomUUID();
      const creadaEn = new Date(AHORA.getTime() - 60_000);
      await db.query(`INSERT INTO sesiones (id,usuario_id,creada_en,expira_en)
        VALUES (?,?,?,?)`, [sesionId, base.adminId, creadaEn,
        new Date(creadaEn.getTime() + 12 * 3_600_000)]);
      const [moduloA, moduloB] = await Promise.all([
        crearModulo(db, reloj), crearModulo(segunda, reloj),
      ]);
      let runner: QueryRunner | undefined;
      try {
        await db.query(`DELETE FROM horarios_personal WHERE negocio_id=?
          AND personal_id=? AND sucursal_id=?`,
        [base.negocioId, base.profesionalId, base.sucursales[1]]);
        const envio = await prepararEnvio(moduloA, db, base, '7');
        runner = segunda.createQueryRunner();
        await runner.connect();
        await runner.startTransaction('READ COMMITTED');
        await runner.query('SELECT id FROM servicios WHERE id=? FOR UPDATE', [base.servicioId]);
        const reserva = moduloA.get(RegistroReservaPublicaService).registrar(base.negocioId,
          envio.titular, envio.clave, CONTACTO);
        await new Promise((resolver) => setTimeout(resolver, 80));
        const cambio = moduloB.get(HorariosService).guardarSemana(base.negocioId,
          base.profesionalId, [], '2026-10-20');
        await new Promise((resolver) => setTimeout(resolver, 80));
        await runner.commitTransaction();
        const resultado = await reserva;
        await cambio;
        const cita = (await db.query(`SELECT id,inicio_utc,fin_utc,estado FROM citas
          WHERE negocio_id=? AND folio=?`, [base.negocioId, resultado.folio]))[0];
        expect(cita.estado).toBe('pendiente');
        expect(new Date(cita.inicio_utc).toISOString()).toBe(resultado.inicioUtc);
        expect(new Date(cita.fin_utc).toISOString()).toBe(resultado.finUtc);
        const afectadas = await moduloA.get(CitasAfectadasService).consultar(
          { sub: base.adminId, sesionId }, { desde: '2026-10-20', hasta: '2026-10-20',
            personalId: base.profesionalId });
        expect(afectadas.citas).toEqual([expect.objectContaining({ citaId: Number(cita.id),
          causas: expect.arrayContaining([expect.objectContaining({
            codigo: 'horario_insuficiente' })]) })]);
      } finally {
        if (runner?.isTransactionActive) await runner.rollbackTransaction();
        if (runner) await runner.release();
        await Promise.all([moduloA.close(), moduloB.close()]);
      }
    });
  }, 120000);
});
