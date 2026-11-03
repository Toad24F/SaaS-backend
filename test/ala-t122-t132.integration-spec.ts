import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { RELOJ } from '../src/comun/reloj';
import { ApartadosService } from '../src/reservas-publicas/apartados.service';
import { CoordinacionReservaPublicaService } from '../src/reservas-publicas/coordinacion-reserva-publica.service';
import { IntentosReservaPublicaService } from '../src/reservas-publicas/intentos-reserva-publica.service';
import { RegistroReservaPublicaService } from '../src/reservas-publicas/registro-reserva-publica.service';
import { ResolucionReservaPublicaService } from '../src/reservas-publicas/resolucion-reserva-publica.service';
import { conBaseMigrada } from './support/mariadb';
import { crearEscenarioPortal } from './support/escenario-portal';
import { RelojPrueba } from './support/reloj';

const AHORA = new Date('2026-10-20T12:00:00.000Z');
const CONTACTO = { nombre: 'Ana Pérez', telefono: '6141234567', notas: 'Consulta' };
type Servicios = { apartados: ApartadosService; intentos: IntentosReservaPublicaService;
  registro: RegistroReservaPublicaService; resolucion: ResolucionReservaPublicaService;
  coordinacion: CoordinacionReservaPublicaService };
type Flujo = { db: DataSource; otra: DataSource; reloj: RelojPrueba;
  negocioId: number; sucursalId: number; servicioId: number; profesionales: number[];
  primero: Servicios; segundo: Servicios };

/** Dos módulos usan pools independientes y una base migrada que se destruye al terminar. */
async function conFlujo(ejecutar: (f: Flujo) => Promise<void>) {
  await conBaseMigrada(async (db, otra) => {
    const reloj = new RelojPrueba(AHORA);
    const { negocios: [negocio] } = await crearEscenarioPortal(db, reloj);
    const negocioId = negocio.id;
    const sucursalId = negocio.sucursales[0].id;
    const servicioId = Number((await db.query(
      'SELECT id FROM servicios WHERE negocio_id=? AND activo=1', [negocioId]))[0].id);
    await db.query(`INSERT INTO licencias (negocio_id,creado_en,habilitada_en,vence_en)
      VALUES (?,'2026-01-01','2026-01-01','2027-01-01')`, [negocioId]);
    await db.query(`INSERT INTO configuracion_agenda
      (negocio_id,modo,tiempo_entre_citas_minutos,anticipacion_minutos,dias_futuros)
      VALUES (?,'ventana_libre',0,15,1)`, [negocioId]);
    for (const [indice, personalId] of negocio.profesionales.entries()) {
      if (indice === 1) {
        await db.query(`INSERT INTO personal_sucursales
          (negocio_id,personal_id,sucursal_id,activo) VALUES (?,?,?,1)`,
        [negocioId, personalId, sucursalId]);
        await db.query(`INSERT INTO personal_servicios_sucursales
          (negocio_id,personal_id,sucursal_id,servicio_id,activo) VALUES (?,?,?,?,1)`,
        [negocioId, personalId, sucursalId, servicioId]);
      }
      await db.query(`INSERT INTO horarios_personal (negocio_id,personal_id,sucursal_id,
        dia_semana,orden,inicio_minutos,fin_minutos,activo)
        VALUES (?,?,?,2,0,480,720,1)`, [negocioId, personalId, sucursalId]);
    }
    const anterior = process.env.PORTAL_FORMULARIO_HMAC_SECRET;
    process.env.PORTAL_FORMULARIO_HMAC_SECRET = 'secreto-formulario-pruebas-aislado-123456';
    const modulos = [];
    try {
      for (const conexion of [db, otra]) {
        modulos.push(await Test.createTestingModule({ imports: [AppModule] })
          .overrideProvider(DataSource).useValue(conexion)
          .overrideProvider(RELOJ).useValue(reloj).compile());
      }
      const servicios = (indice: number): Servicios => ({
        apartados: modulos[indice].get(ApartadosService),
        intentos: modulos[indice].get(IntentosReservaPublicaService),
        registro: modulos[indice].get(RegistroReservaPublicaService),
        resolucion: modulos[indice].get(ResolucionReservaPublicaService),
        coordinacion: modulos[indice].get(CoordinacionReservaPublicaService),
      });
      await ejecutar({ db, otra, reloj, negocioId, sucursalId, servicioId,
        profesionales: negocio.profesionales,
        primero: servicios(0), segundo: servicios(1) });
    } finally {
      await Promise.all(modulos.map((modulo) => modulo.close()));
      if (anterior === undefined) delete process.env.PORTAL_FORMULARIO_HMAC_SECRET;
      else process.env.PORTAL_FORMULARIO_HMAC_SECRET = anterior;
    }
  });
}

async function preparar(f: Flujo, servicio: Servicios, letra: string,
  personalId = f.profesionales[0], horaInicio = '08:00') {
  const titular = letra.repeat(64);
  await f.db.query(`INSERT INTO sesiones_reserva_publica
    (negocio_id,titular_hash,generacion) VALUES (?,?,0)`, [f.negocioId, titular]);
  const apartado = await servicio.apartados.solicitar(f.negocioId, titular, {
    clave: `ala_122_apartado_${letra.repeat(4)}`, personalId,
    sucursalId: f.sucursalId, servicioId: f.servicioId,
    fechaLocal: '2026-10-20', horaInicio });
  expect(apartado.estado).toBe('concedida');
  const clave = `ala_122_intento_${letra.repeat(4)}`;
  const intento = await servicio.intentos.preparar(f.negocioId, titular,
    { clave, apartadoId: apartado.apartadoId });
  return { titular, apartadoId: apartado.apartadoId!, clave, intentoId: intento.id };
}

/** Sostiene una fila real de MariaDB hasta que cada contendiente alcanza su bloqueo. */
async function conBarrera(f: Flujo, servicios: Servicios[],
  ejecutar: () => Promise<unknown>[]) {
  const runner = f.db.createQueryRunner();
  await runner.connect();
  await runner.startTransaction('READ COMMITTED');
  const entradas: Promise<void>[] = [];
  const restaurar = servicios.map((servicio) => {
    let avisar!: () => void;
    entradas.push(new Promise((resolve) => { avisar = resolve; }));
    const original = servicio.coordinacion.bloquearRecursos.bind(servicio.coordinacion);
    const espia = jest.spyOn(servicio.coordinacion, 'bloquearRecursos')
      .mockImplementation((...args) => { avisar(); return original(...args); });
    return () => espia.mockRestore();
  });
  try {
    await runner.query('SELECT id FROM negocios WHERE id=? FOR UPDATE', [f.negocioId]);
    // Capturar rechazos evita promesas sin manejador mientras la barrera está cerrada.
    const trabajos = ejecutar().map((trabajo) => trabajo.then(
      (valor) => ({ valor }), (error: unknown) => ({ error })));
    await Promise.all(entradas);
    await runner.commitTransaction();
    return await Promise.all(trabajos);
  } finally {
    if (runner.isTransactionActive) await runner.rollbackTransaction();
    await runner.release();
    restaurar.forEach((hacer) => hacer());
  }
}

async function filas(f: Flujo) {
  const [clientes] = await f.db.query(`SELECT COUNT(*) AS n FROM clientes
    WHERE negocio_id=?`, [f.negocioId]);
  const citas = await f.db.query(`SELECT apartado_origen_id,personal_id,costo_aceptado,
    separacion_minutos,fin_ocupacion_utc FROM citas
    WHERE negocio_id=? AND origen='portal_publico' ORDER BY id`, [f.negocioId]);
  const intentos = await f.db.query(`SELECT id,estado,intento_anterior_id,cita_id
    FROM intentos_reserva_publica WHERE negocio_id=? ORDER BY id`, [f.negocioId]);
  const apartados = await f.db.query(`SELECT id,liberado_en,intento_actual_id
    FROM bloqueos_temporales WHERE negocio_id=? AND operacion_id IS NOT NULL ORDER BY id`,
  [f.negocioId]);
  return { clientes: Number(clientes.n), citas, intentos, apartados };
}

/** Detiene al contendiente en un punto observable antes de tomar filas de dominio. */
function pausar(servicio: Servicios, metodo: 'bloquearSesion' | 'bloquearRecursos') {
  let llego!: () => void;
  let continuar!: () => void;
  const entrada = new Promise<void>((resolve) => { llego = resolve; });
  const permiso = new Promise<void>((resolve) => { continuar = resolve; });
  const original = servicio.coordinacion[metodo].bind(servicio.coordinacion);
  const espia = jest.spyOn(servicio.coordinacion, metodo)
    .mockImplementation((async (...args: Parameters<typeof original>) => {
      llego();
      await permiso;
      return original(...args);
    }) as never);
  return { entrada, continuar, restaurar: () => espia.mockRestore() };
}

describe('ALA-T122–T132: carreras del escritor público', () => {
  it('T122 serializa el último lugar telefónico entre profesionales', async () => {
    await conFlujo(async (f) => {
      const a = await preparar(f, f.primero, 'a');
      const b = await preparar(f, f.segundo, 'b', f.profesionales[1], '09:00');
      // Una cita futura previa deja un único lugar del cupo de dos.
      await f.db.query(`UPDATE citas SET telefono_contacto=? WHERE id=?`,
        [CONTACTO.telefono, (await f.db.query('SELECT id FROM citas WHERE folio=?', ['P-1']))[0].id]);
      const resultados = await conBarrera(f, [f.primero, f.segundo], () => [
        f.primero.registro.registrar(f.negocioId, a.titular, a.clave, CONTACTO),
        f.segundo.registro.registrar(f.negocioId, b.titular, b.clave, CONTACTO),
      ]);
      expect(resultados.filter((r) => 'valor' in r)).toHaveLength(1);
      expect(resultados.filter((r) => 'error' in r)).toHaveLength(1);
      expect((resultados.find((r) => 'error' in r) as { error: { status: number } }).error.status)
        .toBe(409);
      const estado = await filas(f);
      expect(estado.clientes).toBe(2); // Uno de la fixture y solo uno nuevo.
      expect(estado.citas).toHaveLength(1);
      expect(estado.intentos.map((i: { estado: string }) => i.estado).sort())
        .toEqual(['no_registrado', 'registrado']);
      expect(estado.apartados.filter((i: { liberado_en: Date | null }) => i.liberado_en))
        .toHaveLength(1);
    });
  });

  it('T123 solo un sucesor puede tomar el puntero y el viejo no escribe', async () => {
    await conFlujo(async (f) => {
      const a = await preparar(f, f.primero, 'a');
      // Dos ocupaciones futuras consumen el cupo del teléfono inicial.
      for (const [indice, inicio] of ['17:00:00', '18:00:00'].entries()) {
        await f.db.query(`INSERT INTO citas (negocio_id,sucursal_id,personal_id,
          servicio_id,cliente_id,inicio_utc,fin_utc,zona_horaria_reserva,
          folio,estado,origen,telefono_contacto)
          VALUES (?,?,?,?,?, ?,?,'America/Chihuahua',?,'pendiente','manual',?)`,
        [f.negocioId, f.sucursalId, f.profesionales[0], f.servicioId,
          (await f.db.query('SELECT id FROM clientes WHERE negocio_id=?', [f.negocioId]))[0].id,
          new Date(`2026-10-20T${inicio}Z`), new Date(`2026-10-20T${indice + 18}:30:00Z`),
          `ALA123-${indice}`, CONTACTO.telefono]);
      }
      await expect(f.primero.registro.registrar(f.negocioId, a.titular, a.clave, CONTACTO))
        .rejects.toMatchObject({ status: 409 });
      const claves = ['ala_123_sucesor_aaaa', 'ala_123_sucesor_bbbb'];
      const solicitudes = [f.primero, f.segundo].map((s, indice) => ({
        servicio: s, clave: claves[indice],
      }));
      const barrera = pausar(f.segundo, 'bloquearSesion');
      try {
        const primera = solicitudes[0].servicio.intentos.preparar(f.negocioId,
          a.titular, { clave: claves[0], apartadoId: a.apartadoId,
            intentoAnteriorId: a.intentoId });
        const segunda = solicitudes[1].servicio.intentos.preparar(f.negocioId,
          a.titular, { clave: claves[1], apartadoId: a.apartadoId,
            intentoAnteriorId: a.intentoId });
        await barrera.entrada;
        const ganador = await primera;
        barrera.continuar();
        await expect(segunda).rejects.toMatchObject({ status: 409 });
        expect(await f.segundo.intentos.preparar(f.negocioId, a.titular,
          { clave: claves[0], apartadoId: a.apartadoId,
            intentoAnteriorId: a.intentoId })).toMatchObject({ id: ganador.id });
        await expect(f.primero.registro.registrar(f.negocioId, a.titular,
          a.clave, CONTACTO)).rejects.toMatchObject({ status: 409 });
        const estado = await filas(f);
        expect(estado.citas).toHaveLength(0);
        expect(estado.intentos).toHaveLength(2);
        expect(estado.apartados[0].intento_actual_id).toBe(ganador.id);
      } finally { barrera.continuar(); barrera.restaurar(); }
    });
  });

  it('T124 escritor confirmado antes de resolución recupera la misma cita', async () => {
    await conFlujo(async (f) => {
      const a = await preparar(f, f.primero, 'a');
      const barrera = pausar(f.segundo, 'bloquearSesion');
      try {
        const resolver = f.segundo.resolucion.resolver(f.negocioId,
          a.titular, a.clave, a.apartadoId);
        await barrera.entrada;
        const resultado = await f.primero.registro.registrar(f.negocioId,
          a.titular, a.clave, CONTACTO);
        barrera.continuar();
        expect(await resolver).toEqual({ estado: 'registrado', resultado });
        const estado = await filas(f);
        expect(estado.citas).toHaveLength(1);
        expect(estado.intentos[0].estado).toBe('registrado');
        expect(estado.apartados[0].liberado_en).not.toBeNull();
      } finally { barrera.continuar(); barrera.restaurar(); }
    });
  });

  it('T125 cierre terminal anterior impide al escritor tardío', async () => {
    await conFlujo(async (f) => {
      const a = await preparar(f, f.primero, 'a');
      const barrera = pausar(f.segundo, 'bloquearSesion');
      try {
        const escritor = f.segundo.registro.registrar(f.negocioId,
          a.titular, a.clave, CONTACTO);
        await barrera.entrada;
        expect(await f.primero.resolucion.resolver(f.negocioId,
          a.titular, a.clave, a.apartadoId)).toEqual({ estado: 'no_registrado' });
        barrera.continuar();
        await expect(escritor).rejects.toMatchObject({ status: 409 });
        const estado = await filas(f);
        expect(estado.citas).toHaveLength(0);
        expect(estado.intentos[0].estado).toBe('no_registrado');
        expect(estado.apartados[0].liberado_en).not.toBeNull();
      } finally { barrera.continuar(); barrera.restaurar(); }
    });
  });

  it('T126 una separación protegida entre sucursales admite a lo sumo una cita', async () => {
    await conFlujo(async (f) => {
      const otraSucursal = Number((await f.db.query(`SELECT id FROM sucursales
        WHERE negocio_id=? AND id<>?`, [f.negocioId, f.sucursalId]))[0].id);
      await f.db.query(`UPDATE sucursales SET activo=1,zona_horaria='America/Chihuahua'
        WHERE id=?`, [otraSucursal]);
      await f.db.query(`UPDATE personal_sucursales SET activo=1
        WHERE negocio_id=? AND personal_id=? AND sucursal_id=?`,
      [f.negocioId, f.profesionales[0], otraSucursal]);
      await f.db.query(`INSERT INTO personal_servicios_sucursales
        (negocio_id,personal_id,sucursal_id,servicio_id,activo)
        VALUES (?,?,?,?,1)`, [f.negocioId, f.profesionales[0], otraSucursal, f.servicioId]);
      await f.db.query(`UPDATE horarios_personal SET fin_minutos=510
        WHERE negocio_id=? AND personal_id=?`, [f.negocioId, f.profesionales[0]]);
      await f.db.query(`INSERT INTO horarios_personal (negocio_id,personal_id,sucursal_id,
        dia_semana,orden,inicio_minutos,fin_minutos,activo)
        VALUES (?,?,?,2,0,510,720,1)`,
      [f.negocioId, f.profesionales[0], otraSucursal]);
      const a = await preparar(f, f.primero, 'a');
      const titularB = 'b'.repeat(64);
      await f.db.query(`INSERT INTO sesiones_reserva_publica
        (negocio_id,titular_hash,generacion) VALUES (?,?,0)`,
      [f.negocioId, titularB]);
      const apartadoB = await f.segundo.apartados.solicitar(f.negocioId, titularB, {
        clave: 'ala_126_apartado_bbbb', personalId: f.profesionales[0],
        sucursalId: otraSucursal, servicioId: f.servicioId,
        fechaLocal: '2026-10-20', horaInicio: '08:30' });
      expect(apartadoB.estado).toBe('concedida');
      const claveB = 'ala_126_intento_bbbb';
      await f.segundo.intentos.preparar(f.negocioId, titularB,
        { clave: claveB, apartadoId: apartadoB.apartadoId });
      // Esta fixture adversarial representa apartados heredados cuyo fin de
      // atención es contiguo pero cuyos fines protegidos invaden la otra sede.
      await f.db.query(`UPDATE bloqueos_temporales SET separacion_minutos=15,
        fin_ocupacion_utc=DATE_ADD(fin_utc,INTERVAL 15 MINUTE)
        WHERE id IN (?,?)`, [a.apartadoId, apartadoB.apartadoId]);
      const resultados = await conBarrera(f, [f.primero, f.segundo], () => [
        f.primero.registro.registrar(f.negocioId, a.titular, a.clave, CONTACTO),
        f.segundo.registro.registrar(f.negocioId, titularB, claveB,
          { ...CONTACTO, telefono: '6147654321' }),
      ]);
      // Los dos apartados vigentes se excluyen mutuamente: ambos escritores
      // pueden rechazar, pero jamás confirmar dos intervalos protegidos.
      expect(resultados.filter((r) => 'valor' in r).length).toBeLessThanOrEqual(1);
      expect(resultados.filter((r) => 'error' in r).length).toBeGreaterThanOrEqual(1);
      const estado = await filas(f);
      expect(estado.citas.length).toBeLessThanOrEqual(1);
      expect(estado.intentos.filter((i: { estado: string }) => i.estado === 'registrado'))
        .toHaveLength(estado.citas.length);
      expect(estado.apartados.filter((i: { liberado_en: Date | null }) => i.liberado_en))
        .toHaveLength(estado.citas.length);
    });
  });

  it('T127 conserva modo y separación capturados en ambos órdenes', async () => {
    for (const cambioPrimero of [true, false]) {
      await conFlujo(async (f) => {
        const a = await preparar(f, f.primero, 'a');
        const cambio = () => f.otra.query(`UPDATE configuracion_agenda
          SET modo='agenda_compacta',tiempo_entre_citas_minutos=30
          WHERE negocio_id=?`, [f.negocioId]);
        if (cambioPrimero) {
          const barrera = pausar(f.primero, 'bloquearRecursos');
          try {
            const registro = f.primero.registro.registrar(f.negocioId,
              a.titular, a.clave, CONTACTO);
            await barrera.entrada;
            await cambio();
            barrera.continuar();
            expect((await registro).estado).toBe('pendiente');
          } finally { barrera.continuar(); barrera.restaurar(); }
        } else {
          expect((await f.primero.registro.registrar(f.negocioId,
            a.titular, a.clave, CONTACTO)).estado).toBe('pendiente');
          await cambio();
        }
        const estado = await filas(f);
        expect(estado.citas).toHaveLength(1);
        expect(estado.citas[0].separacion_minutos).toBe(0);
        expect(estado.apartados[0].liberado_en).not.toBeNull();
        expect((await f.db.query(`SELECT modo,tiempo_entre_citas_minutos
          FROM configuracion_agenda WHERE negocio_id=?`, [f.negocioId]))[0])
          .toMatchObject({ modo: 'agenda_compacta', tiempo_entre_citas_minutos: 30 });
        // Una concesión posterior usa las reglas nuevas, sin cambiar la cita.
        const titularNuevo = 'c'.repeat(64);
        await f.db.query(`INSERT INTO sesiones_reserva_publica
          (negocio_id,titular_hash,generacion) VALUES (?,?,0)`,
        [f.negocioId, titularNuevo]);
        const nuevo = await f.segundo.apartados.solicitar(f.negocioId, titularNuevo, {
          clave: 'ala_127_apartado_nuevo', personalId: f.profesionales[1],
          sucursalId: f.sucursalId, servicioId: f.servicioId,
          fechaLocal: '2026-10-20', horaInicio: '08:00' });
        expect(nuevo.estado).toBe('concedida');
        expect((await f.db.query(`SELECT modo_concesion,separacion_minutos
          FROM bloqueos_temporales WHERE id=?`, [nuevo.apartadoId]))[0])
          .toMatchObject({ modo_concesion: 'agenda_compacta', separacion_minutos: 30 });
      });
    }
  });

  it.each(['profesional', 'sucursal', 'servicio'])(
    'T128–T129 revalida baja de %s en ambos órdenes', async (tipo) => {
      for (const cambioPrimero of [true, false]) {
        await conFlujo(async (f) => {
          const a = await preparar(f, f.primero, 'a');
          const cambio = async () => {
            if (tipo === 'profesional') await f.otra.query(
              'UPDATE usuarios SET activo=0,inhabilitado_en=? WHERE id=?',
              [AHORA, f.profesionales[0]]);
            if (tipo === 'sucursal') await f.otra.query(
              'UPDATE sucursales SET activo=0,inhabilitado_en=? WHERE id=?',
              [AHORA, f.sucursalId]);
            if (tipo === 'servicio') await f.otra.query(
              'UPDATE servicios SET activo=0,inhabilitado_en=? WHERE id=?',
              [AHORA, f.servicioId]);
          };
          if (cambioPrimero) {
            const barrera = pausar(f.primero, 'bloquearRecursos');
            try {
              const registro = f.primero.registro.registrar(f.negocioId,
                a.titular, a.clave, CONTACTO);
              await barrera.entrada;
              await cambio();
              barrera.continuar();
              await expect(registro).rejects.toMatchObject({ status: 409 });
            } finally { barrera.continuar(); barrera.restaurar(); }
          } else {
            const resultado = await f.primero.registro.registrar(f.negocioId,
              a.titular, a.clave, CONTACTO);
            await cambio();
            expect((await f.segundo.resolucion.resolver(f.negocioId,
              a.titular, a.clave, a.apartadoId)).resultado.folio).toBe(resultado.folio);
          }
          const estado = await filas(f);
          expect(estado.citas).toHaveLength(cambioPrimero ? 0 : 1);
          expect(estado.intentos[0].estado).toBe(cambioPrimero ? 'preparado' : 'registrado');
          expect(estado.apartados[0].liberado_en === null).toBe(cambioPrimero);
          // La oferta retirada también impide una concesión nueva.
          const titularNuevo = 'c'.repeat(64);
          await f.db.query(`INSERT INTO sesiones_reserva_publica
            (negocio_id,titular_hash,generacion) VALUES (?,?,0)`,
          [f.negocioId, titularNuevo]);
          const nueva = await f.segundo.apartados.solicitar(f.negocioId,
            titularNuevo, { clave: 'ala_129_apartado_nuevo',
              personalId: f.profesionales[0], sucursalId: f.sucursalId,
              servicioId: f.servicioId, fechaLocal: '2026-10-20',
              horaInicio: '09:00' });
          expect(nueva.estado).toBe('rechazada');
        });
      }
    });

  it('T130 reevalúa vencimiento tras espera y conserva recuperación propia', async () => {
    await conFlujo(async (f) => {
      const a = await preparar(f, f.primero, 'a');
      const barrera = pausar(f.primero, 'bloquearRecursos');
      try {
        const registro = f.primero.registro.registrar(f.negocioId,
          a.titular, a.clave, CONTACTO);
        await barrera.entrada;
        await f.otra.query('UPDATE licencias SET vence_en=? WHERE negocio_id=?',
          [new Date('2026-10-20T12:01:00.000Z'), f.negocioId]);
        // El reloj avanza hasta el vencimiento exacto mientras el escritor
        // espera; su lectura inicial de 12:00 ya no autoriza el commit.
        f.reloj.fijar(new Date('2026-10-20T12:01:00.000Z'));
        barrera.continuar();
        await expect(registro).rejects.toMatchObject({ status: 404 });
        expect((await filas(f)).citas).toHaveLength(0);
        expect(await f.segundo.resolucion.resolver(f.negocioId,
          a.titular, a.clave, a.apartadoId)).toEqual({ estado: 'no_registrado' });
      } finally { barrera.continuar(); barrera.restaurar(); }
    });
  });

  it.each(['horario', 'bloqueo'])(
    'T131 revalida %s y conserva cita previa en el orden inverso', async (tipo) => {
      for (const cambioPrimero of [true, false]) {
        await conFlujo(async (f) => {
          const a = await preparar(f, f.primero, 'a');
          const cambio = async () => {
            if (tipo === 'horario') await f.otra.query(`UPDATE horarios_personal
              SET fin_minutos=490 WHERE negocio_id=? AND personal_id=?`,
            [f.negocioId, f.profesionales[0]]);
            else await f.otra.query(`INSERT INTO bloqueos_horario
              (negocio_id,personal_id,sucursal_id,creador_usuario_id,tipo,motivo,
               fecha_inicio,fecha_fin,inicio_minutos,fin_minutos)
              VALUES (?,?,?,?,'emergencia','Cierre',
                '2026-10-20','2026-10-20',480,510)`,
            [f.negocioId, f.profesionales[0], f.sucursalId, f.profesionales[0]]);
          };
          if (cambioPrimero) {
            const barrera = pausar(f.primero, 'bloquearRecursos');
            try {
              const registro = f.primero.registro.registrar(f.negocioId,
                a.titular, a.clave, CONTACTO);
              await barrera.entrada;
              await cambio();
              barrera.continuar();
              await expect(registro).rejects.toMatchObject({ status: 409 });
            } finally { barrera.continuar(); barrera.restaurar(); }
          } else {
            await f.primero.registro.registrar(f.negocioId, a.titular, a.clave, CONTACTO);
            await cambio();
          }
          const estado = await filas(f);
          expect(estado.citas).toHaveLength(cambioPrimero ? 0 : 1);
          expect(estado.apartados[0].liberado_en === null).toBe(cambioPrimero);
        });
      }
    });

  it('T132 fija costo y rechaza duración que ya no cabe en el apartado', async () => {
    await conFlujo(async (f) => {
      const a = await preparar(f, f.primero, 'a');
      const barrera = pausar(f.primero, 'bloquearRecursos');
      try {
        const registro = f.primero.registro.registrar(f.negocioId,
          a.titular, a.clave, CONTACTO);
        await barrera.entrada;
        await f.otra.query('UPDATE servicios SET costo=150 WHERE id=?', [f.servicioId]);
        barrera.continuar();
        expect((await registro).costoAceptado).toBe('100.00');
        expect((await filas(f)).citas[0].costo_aceptado).toBe('100.00');
      } finally { barrera.continuar(); barrera.restaurar(); }
    });
    await conFlujo(async (f) => {
      const a = await preparar(f, f.primero, 'a');
      const barrera = pausar(f.primero, 'bloquearRecursos');
      try {
        const registro = f.primero.registro.registrar(f.negocioId,
          a.titular, a.clave, CONTACTO);
        await barrera.entrada;
        await f.otra.query('UPDATE servicios SET duracion_minutos=45 WHERE id=?',
          [f.servicioId]);
        barrera.continuar();
        await expect(registro).rejects.toMatchObject({ status: 409 });
        const estado = await filas(f);
        expect(estado.citas).toHaveLength(0);
        expect(estado.clientes).toBe(1);
        expect(estado.intentos[0].estado).toBe('preparado');
        expect(estado.apartados[0].liberado_en).toBeNull();
      } finally { barrera.continuar(); barrera.restaurar(); }
    });
  });
});
