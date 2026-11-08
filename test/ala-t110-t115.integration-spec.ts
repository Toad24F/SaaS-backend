import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { RELOJ } from '../src/comun/reloj';
import { ApartadosService } from '../src/reservas-publicas/apartados.service';
import { CupoTelefonicoService } from '../src/reservas-publicas/cupo-telefonico.service';
import { IntentosReservaPublicaService } from '../src/reservas-publicas/intentos-reserva-publica.service';
import { RegistroReservaPublicaService } from '../src/reservas-publicas/registro-reserva-publica.service';
import { conBaseMigrada } from './support/mariadb';
import { crearEscenarioPortal } from './support/escenario-portal';
import { RelojPrueba } from './support/reloj';

const AHORA = new Date('2026-10-20T12:00:00.000Z');
const CONTACTO = { nombre: 'María Pérez', telefono: '+52 614-123-4567', notas: 'Consulta' };

/** Cada prueba usa una base migrada desechable y un reloj fijo. */
async function conFlujo(ejecutar: (f: {
  db: DataSource; negocioId: number; otroNegocioId: number; sucursalId: number;
  otraSucursalId: number; personalId: number; otroPersonalId: number;
  servicioId: number; titular: string; cupo: CupoTelefonicoService;
  apartados: ApartadosService; intentos: IntentosReservaPublicaService;
  registro: RegistroReservaPublicaService;
}) => Promise<void>) {
  await conBaseMigrada(async (db) => {
    const reloj = new RelojPrueba(AHORA);
    const { negocios: [negocio, otro] } = await crearEscenarioPortal(db, reloj);
    const negocioId = negocio.id;
    const servicioId = Number((await db.query(
      'SELECT id FROM servicios WHERE negocio_id=? AND activo=1', [negocioId]))[0].id);
    await db.query(`INSERT INTO licencias (negocio_id,creado_en,habilitada_en,vence_en)
      VALUES (?,'2026-01-01','2026-01-01','2027-01-01')`, [negocioId]);
    await db.query(`INSERT INTO configuracion_agenda
      (negocio_id,modo,tiempo_entre_citas_minutos,anticipacion_minutos,dias_futuros)
      VALUES (?,'agenda_compacta',10,15,1)`, [negocioId]);
    await db.query(`INSERT INTO horarios_personal (negocio_id,personal_id,sucursal_id,
      dia_semana,orden,inicio_minutos,fin_minutos,activo)
      VALUES (?,?,?,2,0,480,720,1)`,
    [negocioId, negocio.profesionales[0], negocio.sucursales[0].id]);
    const titular = 'a'.repeat(64);
    await db.query(`INSERT INTO sesiones_reserva_publica
      (negocio_id,titular_hash,generacion) VALUES (?,?,0)`, [negocioId, titular]);
    const anterior = process.env.PORTAL_FORMULARIO_HMAC_SECRET;
    process.env.PORTAL_FORMULARIO_HMAC_SECRET = 'secreto-formulario-pruebas-aislado-123456';
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DataSource).useValue(db).overrideProvider(RELOJ).useValue(reloj).compile();
    try {
      await ejecutar({ db, negocioId, otroNegocioId: otro.id,
        sucursalId: negocio.sucursales[0].id,
        otraSucursalId: negocio.sucursales[1].id,
        personalId: negocio.profesionales[0], otroPersonalId: negocio.profesionales[1],
        servicioId, titular, cupo: modulo.get(CupoTelefonicoService),
        apartados: modulo.get(ApartadosService),
        intentos: modulo.get(IntentosReservaPublicaService),
        registro: modulo.get(RegistroReservaPublicaService) });
    } finally {
      await modulo.close();
      if (anterior === undefined) delete process.env.PORTAL_FORMULARIO_HMAC_SECRET;
      else process.env.PORTAL_FORMULARIO_HMAC_SECRET = anterior;
    }
  });
}

/** Siembra citas históricas de distintos profesionales sin crear apartados. */
async function sembrarCita(f: { db: DataSource; negocioId: number; sucursalId: number;
  personalId: number; servicioId: number }, folio: string, inicio: Date,
  telefono = '6141234567', estado = 'pendiente') {
  const [cliente] = await f.db.query('SELECT id FROM clientes WHERE negocio_id=?', [f.negocioId]);
  await f.db.query(`INSERT INTO citas (negocio_id,sucursal_id,personal_id,servicio_id,
    cliente_id,inicio_utc,fin_utc,zona_horaria_reserva,folio,estado,origen,telefono_contacto)
    VALUES (?,?,?,?,?,?,?,?,?,?,'manual',?)`,
  [f.negocioId, f.sucursalId, f.personalId, f.servicioId, cliente.id,
    inicio, new Date(inicio.getTime() + 1800000), 'America/Chihuahua', folio, estado, telefono]);
}

describe('ALA-T110–T115: cupo telefónico y sucesión de intentos', () => {
  it('T110 cuenta solo citas futuras no canceladas del negocio y sucursal', async () => {
    await conFlujo(async (f) => {
      // La fixture ya tiene una cita sin teléfono de contacto y un apartado.
      await sembrarCita(f, 'ALA110-A', new Date('2026-10-20T15:00:00Z'));
      await sembrarCita({ ...f, personalId: f.otroPersonalId },
        'ALA110-B', new Date('2026-10-20T16:00:00Z'), '6141234567', 'confirmada');
      await sembrarCita(f, 'ALA110-C', AHORA, '6141234567', 'pendiente');
      await sembrarCita(f, 'ALA110-D', new Date('2026-10-20T17:00:00Z'),
        '6141234567', 'cancelada');
      await sembrarCita({ ...f, sucursalId: f.otraSucursalId },
        'ALA110-E', new Date('2026-10-20T18:00:00Z'));
      expect(await f.db.transaction('READ COMMITTED', (m) =>
        f.cupo.contar(m, f.negocioId, f.sucursalId, '6141234567', AHORA))).toBe(2);
      expect(await f.db.transaction('READ COMMITTED', (m) =>
        f.cupo.contar(m, f.otroNegocioId, f.sucursalId, '6141234567', AHORA))).toBe(0);
    });
  });

  it('T112–T115 confirma rechazo, conserva apartado y permite sucesor explícito', async () => {
    await conFlujo(async (f) => {
      await sembrarCita(f, 'ALA112-A', new Date('2026-10-20T17:00:00Z'));
      await sembrarCita({ ...f, personalId: f.otroPersonalId },
        'ALA112-B', new Date('2026-10-20T18:00:00Z'));
      const apartado = await f.apartados.solicitar(f.negocioId, f.titular,
        { clave: 'ala_112_apartado_123', personalId: f.personalId,
          sucursalId: f.sucursalId, servicioId: f.servicioId,
          fechaLocal: '2026-10-20', horaInicio: '08:00' });
      expect(apartado.estado).toBe('concedida');
      const clave = 'ala_112_intento_1234';
      const primero = await f.intentos.preparar(f.negocioId, f.titular,
        { apartadoId: apartado.apartadoId, clave });
      expect(await f.intentos.preparar(f.negocioId, f.titular,
        { apartadoId: apartado.apartadoId, clave })).toEqual(primero);
      const [antes] = await f.db.query(`SELECT expira_en FROM bloqueos_temporales
        WHERE id=?`, [apartado.apartadoId]);
      await expect(f.intentos.preparar(f.negocioId, f.titular,
        { apartadoId: apartado.apartadoId, clave: 'ala_112_no_autorizado' }))
        .rejects.toMatchObject({ status: 409 });
      await expect(f.registro.registrar(f.negocioId, f.titular, clave, CONTACTO))
        .rejects.toMatchObject({ status: 409 });
      const [rechazo] = await f.db.query(`SELECT estado,formulario_hash,causa_publica,cita_id
        FROM intentos_reserva_publica WHERE id=?`, [primero.id]);
      expect(rechazo).toMatchObject({ estado: 'no_registrado',
        causa_publica: 'cupo_telefono_excedido', cita_id: null });
      expect(rechazo.formulario_hash).toMatch(/^[a-f0-9]{64}$/);
      const [vigente] = await f.db.query(`SELECT intento_actual_id,liberado_en,expira_en
        FROM bloqueos_temporales WHERE id=?`, [apartado.apartadoId]);
      expect(String(vigente.intento_actual_id)).toBe(primero.id);
      expect(vigente.liberado_en).toBeNull();
      expect(vigente.expira_en).toEqual(antes.expira_en);
      expect((await f.db.query(`SELECT COUNT(*) AS n FROM citas
        WHERE negocio_id=? AND origen='portal_publico'`, [f.negocioId]))[0].n).toBe('0');
      expect((await f.db.query(`SELECT COUNT(*) AS n FROM clientes
        WHERE negocio_id=?`, [f.negocioId]))[0].n).toBe('1');
      await expect(f.intentos.preparar(f.negocioId, f.titular,
        { apartadoId: apartado.apartadoId, clave: 'ala_112_sucesor_1234' }))
        .rejects.toMatchObject({ status: 409 });
      const nuevo = await f.intentos.preparar(f.negocioId, f.titular,
        { apartadoId: apartado.apartadoId, clave: 'ala_112_sucesor_1234',
          intentoAnteriorId: primero.id });
      expect(nuevo.id).not.toBe(primero.id);
      expect(await f.intentos.preparar(f.negocioId, f.titular,
        { apartadoId: apartado.apartadoId, clave: 'ala_112_sucesor_1234',
          intentoAnteriorId: primero.id })).toEqual(nuevo);
      const [despues] = await f.db.query(`SELECT intento_actual_id,expira_en
        FROM bloqueos_temporales WHERE id=?`, [apartado.apartadoId]);
      expect(String(despues.intento_actual_id)).toBe(nuevo.id);
      expect(despues.expira_en).toEqual(antes.expira_en);
      await expect(f.registro.registrar(f.negocioId, f.titular, clave,
        { ...CONTACTO, telefono: '6149999999' }))
        .rejects.toMatchObject({ status: 409 });
      const resultado = await f.registro.registrar(f.negocioId, f.titular,
        'ala_112_sucesor_1234', { ...CONTACTO, telefono: '6149999999' });
      expect(resultado.estado).toBe('pendiente');
      expect((await f.db.query(`SELECT COUNT(*) AS n FROM citas
        WHERE negocio_id=? AND origen='portal_publico'`, [f.negocioId]))[0].n).toBe('1');
      expect((await f.db.query(`SELECT estado FROM intentos_reserva_publica
        WHERE id=?`, [primero.id]))[0].estado).toBe('no_registrado');
    });
  });

  it('T111 serializa el último cupo entre profesionales distintos', async () => {
    await conFlujo(async (f) => {
      // Ambos profesionales comparten sucursal y teléfono, pero no su fila
      // personal: solo la barrera de negocio puede proteger el último cupo.
      await f.db.query(`INSERT INTO personal_sucursales
        (negocio_id,personal_id,sucursal_id,activo) VALUES (?,?,?,1)`,
      [f.negocioId, f.otroPersonalId, f.sucursalId]);
      await f.db.query(`INSERT INTO personal_servicios_sucursales
        (negocio_id,personal_id,sucursal_id,servicio_id,activo) VALUES (?,?,?,?,1)`,
      [f.negocioId, f.otroPersonalId, f.sucursalId, f.servicioId]);
      await f.db.query(`INSERT INTO horarios_personal (negocio_id,personal_id,
        sucursal_id,dia_semana,orden,inicio_minutos,fin_minutos,activo)
        VALUES (?,?,?,2,0,540,720,1)`,
      [f.negocioId, f.otroPersonalId, f.sucursalId]);
      await sembrarCita(f, 'ALA111-UNO', new Date('2026-10-20T17:00:00Z'));
      const otroTitular = 'c'.repeat(64);
      await f.db.query(`INSERT INTO sesiones_reserva_publica
        (negocio_id,titular_hash,generacion) VALUES (?,?,0)`,
      [f.negocioId, otroTitular]);
      const primero = await f.apartados.solicitar(f.negocioId, f.titular,
        { clave: 'ala_111_apartado_uno', personalId: f.personalId,
          sucursalId: f.sucursalId, servicioId: f.servicioId,
          fechaLocal: '2026-10-20', horaInicio: '08:00' });
      const segundo = await f.apartados.solicitar(f.negocioId, otroTitular,
        { clave: 'ala_111_apartado_dos', personalId: f.otroPersonalId,
          sucursalId: f.sucursalId, servicioId: f.servicioId,
          fechaLocal: '2026-10-20', horaInicio: '09:00' });
      expect(primero.estado).toBe('concedida');
      expect(segundo.estado).toBe('concedida');
      await f.intentos.preparar(f.negocioId, f.titular,
        { apartadoId: primero.apartadoId, clave: 'ala_111_intento_uno' });
      await f.intentos.preparar(f.negocioId, otroTitular,
        { apartadoId: segundo.apartadoId, clave: 'ala_111_intento_dos' });
      const barrera = f.db.createQueryRunner();
      await barrera.connect();
      await barrera.startTransaction('READ COMMITTED');
      try {
        await barrera.query('SELECT id FROM negocios WHERE id=? FOR UPDATE',
          [f.negocioId]);
        // La tercera conexión retiene la barrera mientras ambos escritores
        // avanzan por sesiones y profesionales distintos; luego los libera.
        const envios = Promise.allSettled([
          f.registro.registrar(f.negocioId, f.titular, 'ala_111_intento_uno', CONTACTO),
          f.registro.registrar(f.negocioId, otroTitular, 'ala_111_intento_dos', CONTACTO),
        ]);
        await new Promise((resolver) => setTimeout(resolver, 50));
        await barrera.commitTransaction();
        const resultados = await envios;
        expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
        expect(resultados.filter((r) => r.status === 'rejected')).toHaveLength(1);
      } finally {
        if (barrera.isTransactionActive) await barrera.rollbackTransaction();
        await barrera.release();
      }
      expect((await f.db.query(`SELECT COUNT(*) AS n FROM citas
        WHERE negocio_id=? AND sucursal_id=? AND telefono_contacto=?
          AND inicio_utc>? AND estado<>'cancelada'`,
      [f.negocioId, f.sucursalId, '6141234567', AHORA]))[0].n).toBe('2');
      expect((await f.db.query(`SELECT COUNT(*) AS n FROM intentos_reserva_publica
        WHERE negocio_id=? AND estado='no_registrado' AND causa_publica='cupo_telefono_excedido'`,
      [f.negocioId]))[0].n).toBe('1');
    });
  }, 120000);
});
