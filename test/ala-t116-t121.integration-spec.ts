import { ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { RELOJ } from '../src/comun/reloj';
import { ApartadosService } from '../src/reservas-publicas/apartados.service';
import { CoordinacionReservaPublicaService } from '../src/reservas-publicas/coordinacion-reserva-publica.service';
import { CupoTelefonicoService } from '../src/reservas-publicas/cupo-telefonico.service';
import { IntentosReservaPublicaService } from '../src/reservas-publicas/intentos-reserva-publica.service';
import { RegistroReservaPublicaService } from '../src/reservas-publicas/registro-reserva-publica.service';
import { ResolucionReservaPublicaService } from '../src/reservas-publicas/resolucion-reserva-publica.service';
import { conBaseMigrada } from './support/mariadb';
import { crearEscenarioPortal } from './support/escenario-portal';
import { RelojPrueba } from './support/reloj';

const AHORA = new Date('2026-10-20T12:00:00.000Z');
const CONTACTO = { nombre: 'Ana Pérez', telefono: '6141234567', notas: 'Primera vez' };

type Flujo = { db: DataSource; reloj: RelojPrueba; negocioId: number;
  sucursalId: number; personalId: number; servicioId: number; titular: string;
  apartadoId: number; clave: string; intentoId: string;
  apartados: ApartadosService; cupo: CupoTelefonicoService;
  intentos: IntentosReservaPublicaService; registro: RegistroReservaPublicaService;
  resolucion: ResolucionReservaPublicaService;
  coordinacion: CoordinacionReservaPublicaService };

/** Prepara un intento real y aísla cada caso en una base migrada desechable. */
async function conFlujo(ejecutar: (f: Flujo) => Promise<void>) {
  await conBaseMigrada(async (db) => {
    const reloj = new RelojPrueba(AHORA);
    const { negocios: [negocio] } = await crearEscenarioPortal(db, reloj);
    const negocioId = negocio.id;
    const personalId = negocio.profesionales[0];
    const sucursalId = negocio.sucursales[0].id;
    const servicioId = Number((await db.query(
      'SELECT id FROM servicios WHERE negocio_id=? AND activo=1', [negocioId]))[0].id);
    await db.query(`INSERT INTO licencias (negocio_id,creado_en,habilitada_en,vence_en)
      VALUES (?,'2026-01-01','2026-01-01','2027-01-01')`, [negocioId]);
    await db.query(`INSERT INTO configuracion_agenda
      (negocio_id,modo,tiempo_entre_citas_minutos,anticipacion_minutos,dias_futuros)
      VALUES (?,'ventana_libre',0,15,1)`, [negocioId]);
    await db.query(`INSERT INTO horarios_personal (negocio_id,personal_id,sucursal_id,
      dia_semana,orden,inicio_minutos,fin_minutos,activo)
      VALUES (?,?,?,2,0,480,720,1)`, [negocioId, personalId, sucursalId]);
    const titular = 'a'.repeat(64);
    await db.query(`INSERT INTO sesiones_reserva_publica
      (negocio_id,titular_hash,generacion) VALUES (?,?,0)`, [negocioId, titular]);
    const previo = process.env.PORTAL_FORMULARIO_HMAC_SECRET;
    process.env.PORTAL_FORMULARIO_HMAC_SECRET = 'secreto-formulario-pruebas-aislado-123456';
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DataSource).useValue(db).overrideProvider(RELOJ).useValue(reloj).compile();
    try {
      const apartados = modulo.get(ApartadosService);
      const apartado = await apartados.solicitar(negocioId, titular, {
        clave: 'ala_116_apartado_123', personalId, sucursalId, servicioId,
        fechaLocal: '2026-10-20', horaInicio: '08:00' });
      expect(apartado.estado).toBe('concedida');
      const clave = 'ala_116_intento_1234';
      const intentos = modulo.get(IntentosReservaPublicaService);
      const intento = await intentos.preparar(negocioId, titular,
        { clave, apartadoId: apartado.apartadoId });
      await ejecutar({ db, reloj, negocioId, sucursalId, personalId, servicioId,
        titular, apartadoId: apartado.apartadoId!, clave, intentoId: intento.id,
        apartados, intentos, cupo: modulo.get(CupoTelefonicoService),
        registro: modulo.get(RegistroReservaPublicaService),
        resolucion: modulo.get(ResolucionReservaPublicaService),
        coordinacion: modulo.get(CoordinacionReservaPublicaService) });
    } finally {
      await modulo.close();
      if (previo === undefined) delete process.env.PORTAL_FORMULARIO_HMAC_SECRET;
      else process.env.PORTAL_FORMULARIO_HMAC_SECRET = previo;
    }
  });
}

async function cita(f: Flujo, folio: string, inicio: Date,
  estado = 'pendiente', telefono = CONTACTO.telefono) {
  const [cliente] = await f.db.query('SELECT id FROM clientes WHERE negocio_id=?', [f.negocioId]);
  await f.db.query(`INSERT INTO citas (negocio_id,sucursal_id,personal_id,servicio_id,
    cliente_id,inicio_utc,fin_utc,zona_horaria_reserva,folio,estado,origen,telefono_contacto)
    VALUES (?,?,?,?,?,?,?,?,?,?,'manual',?)`,
  [f.negocioId, f.sucursalId, f.personalId, f.servicioId, cliente.id,
    inicio, new Date(inicio.getTime() + 1800000), 'America/Chihuahua', folio,
    estado, telefono]);
}

async function agotar(f: Flujo) {
  await cita(f, 'ALA116-UNO', new Date('2026-10-20T17:00:00Z'));
  await cita(f, 'ALA116-DOS', new Date('2026-10-20T18:00:00Z'));
  await expect(f.registro.registrar(f.negocioId, f.titular, f.clave, CONTACTO))
    .rejects.toMatchObject({ status: 409 });
}

describe('ALA-T116–T121: recuperación y corrección del cupo', () => {
  it('T116 recupera rechazo propio y calcula corrección sin liberar ni renovar', async () => {
    await conFlujo(async (f) => {
      await agotar(f);
      const [antes] = await f.db.query(`SELECT expira_en FROM bloqueos_temporales
        WHERE id=?`, [f.apartadoId]);
      expect(await f.resolucion.resolver(f.negocioId, f.titular,
        f.clave, f.apartadoId)).toEqual({ estado: 'no_registrado',
        causa: 'cupo_telefono_excedido', puedeCorregir: true });
      const [despues] = await f.db.query(`SELECT liberado_en,expira_en FROM bloqueos_temporales
        WHERE id=?`, [f.apartadoId]);
      expect(despues.liberado_en).toBeNull();
      expect(despues.expira_en).toEqual(antes.expira_en);
      // Un rechazo confirmado por el lote anterior conservaba este valor;
      // debe seguir siendo corregible y proyectarse con el código público nuevo.
      await f.db.query(`UPDATE intentos_reserva_publica SET causa_publica='cupo_telefonico'
        WHERE id=?`, [f.intentoId]);
      expect(await f.resolucion.resolver(f.negocioId, f.titular,
        f.clave, f.apartadoId)).toEqual({ estado: 'no_registrado',
        causa: 'cupo_telefono_excedido', puedeCorregir: true });
      f.reloj.fijar(new Date('2026-10-20T12:05:00Z'));
      expect(await f.resolucion.resolver(f.negocioId, f.titular,
        f.clave, f.apartadoId)).toEqual({ estado: 'no_registrado',
        causa: 'cupo_telefono_excedido', puedeCorregir: false });
    });
  });

  it('T117 ausencia y cierre genérico liberan; un 503 no crea resultado terminal', async () => {
    await conFlujo(async (f) => {
      const fallo = jest.spyOn(f.coordinacion, 'transaccion')
        .mockRejectedValueOnce(new ServiceUnavailableException('Espera agotada.'));
      await expect(f.resolucion.resolver(f.negocioId, f.titular,
        f.clave, f.apartadoId)).rejects.toMatchObject({ status: 503 });
      fallo.mockRestore();
      expect((await f.db.query(`SELECT estado FROM intentos_reserva_publica
        WHERE id=?`, [f.intentoId]))[0].estado).toBe('preparado');
      expect(await f.resolucion.resolver(f.negocioId, f.titular,
        f.clave, f.apartadoId)).toEqual({ estado: 'no_registrado' });
      expect((await f.db.query(`SELECT liberado_en FROM bloqueos_temporales
        WHERE id=?`, [f.apartadoId]))[0].liberado_en).not.toBeNull();
      await expect(f.intentos.preparar(f.negocioId, f.titular,
        { clave: 'ala_117_sucesor_1234', apartadoId: f.apartadoId,
          intentoAnteriorId: f.intentoId })).rejects.toMatchObject({ status: 404 });
    });
    await conFlujo(async (f) => {
      // La clave que nunca llegó se cierra antes de permitir otra escritura;
      // esa ausencia no habilita corrección sobre el apartado anterior.
      const ausente = 'ala_117_ausente_1234';
      expect(await f.resolucion.resolver(f.negocioId, f.titular,
        ausente, f.apartadoId)).toEqual({ estado: 'no_registrado' });
      expect((await f.db.query(`SELECT liberado_en FROM bloqueos_temporales
        WHERE id=?`, [f.apartadoId]))[0].liberado_en).not.toBeNull();
      expect((await f.db.query(`SELECT causa_publica FROM intentos_reserva_publica
        WHERE negocio_id=? AND clave=?`, [f.negocioId, ausente]))[0].causa_publica)
        .toBe('envio_no_registrado');
    });
  });

  it('T119 cambia el conteo justo en el inicio y excluye canceladas', async () => {
    await conFlujo(async (f) => {
      const inicio = new Date('2026-10-20T17:00:00Z');
      await cita(f, 'ALA119-A', inicio);
      await cita(f, 'ALA119-B', new Date('2026-10-20T18:00:00Z'), 'cancelada');
      const contar = (ahora: Date) => f.db.transaction('READ COMMITTED', (m) =>
        f.cupo.contar(m, f.negocioId, f.sucursalId, CONTACTO.telefono, ahora));
      expect(await contar(new Date(inicio.getTime() - 1))).toBe(1);
      expect(await contar(inicio)).toBe(0);
      expect(await contar(new Date(inicio.getTime() + 1))).toBe(0);
    });
  });

  it('T120 conserva dos personas con teléfono compartido y repite sin gastar cupo', async () => {
    await conFlujo(async (f) => {
      const primera = await f.registro.registrar(f.negocioId, f.titular,
        f.clave, CONTACTO);
      const otro = 'b'.repeat(64);
      await f.db.query(`INSERT INTO sesiones_reserva_publica
        (negocio_id,titular_hash,generacion) VALUES (?,?,0)`, [f.negocioId, otro]);
      const segundoApartado = await f.apartados.solicitar(f.negocioId, otro, {
        clave: 'ala_120_apartado_123', personalId: f.personalId,
        sucursalId: f.sucursalId, servicioId: f.servicioId,
        fechaLocal: '2026-10-20', horaInicio: '08:30' });
      expect(segundoApartado.estado).toBe('concedida');
      await f.intentos.preparar(f.negocioId, otro,
        { clave: 'ala_120_intento_1234', apartadoId: segundoApartado.apartadoId });
      const segunda = await f.registro.registrar(f.negocioId, otro,
        'ala_120_intento_1234', { ...CONTACTO, nombre: 'Beatriz López' });
      expect(segunda.folio).not.toBe(primera.folio);
      expect(await f.registro.registrar(f.negocioId, f.titular,
        f.clave, CONTACTO)).toEqual(primera);
      const filas = await f.db.query(`SELECT c.nombre_contacto,cl.nombre_completo,
        c.telefono_contacto FROM citas c JOIN clientes cl ON cl.id=c.cliente_id
        WHERE c.negocio_id=? AND c.origen='portal_publico' ORDER BY c.id`, [f.negocioId]);
      expect(filas).toEqual([
        expect.objectContaining({ nombre_contacto: 'Ana Pérez',
          nombre_completo: 'Ana Pérez', telefono_contacto: CONTACTO.telefono }),
        expect.objectContaining({ nombre_contacto: 'Beatriz López',
          nombre_completo: 'Beatriz López', telefono_contacto: CONTACTO.telefono }),
      ]);
    });
  });

  it('T121 impide sucesor vencido o ajeno y conserva intento incierto', async () => {
    await conFlujo(async (f) => {
      await agotar(f);
      await f.db.query(`INSERT INTO sesiones_reserva_publica
        (negocio_id,titular_hash,generacion) VALUES (?,?,0)`,
      [f.negocioId, 'c'.repeat(64)]);
      await expect(f.intentos.preparar(f.negocioId, 'c'.repeat(64),
        { clave: 'ala_121_ajeno_12345', apartadoId: f.apartadoId,
          intentoAnteriorId: f.intentoId })).rejects.toMatchObject({ status: 404 });
      f.reloj.fijar(new Date('2026-10-20T12:05:00Z'));
      await expect(f.intentos.preparar(f.negocioId, f.titular,
        { clave: 'ala_121_vencido_1234', apartadoId: f.apartadoId,
          intentoAnteriorId: f.intentoId })).rejects.toMatchObject({ status: 404 });
      expect((await f.db.query(`SELECT intento_actual_id FROM bloqueos_temporales
        WHERE id=?`, [f.apartadoId]))[0].intento_actual_id).toBe(f.intentoId);
    });
    await conFlujo(async (f) => {
      await expect(f.intentos.preparar(f.negocioId, f.titular,
        { clave: 'ala_121_incierto_1234', apartadoId: f.apartadoId,
          intentoAnteriorId: f.intentoId })).rejects.toMatchObject({ status: 409 });
      expect((await f.db.query(`SELECT estado,formulario_hash FROM intentos_reserva_publica
        WHERE id=?`, [f.intentoId]))[0]).toMatchObject({
        estado: 'preparado', formulario_hash: null });
      const registrada = await f.registro.registrar(f.negocioId, f.titular,
        f.clave, CONTACTO);
      const [antes] = await f.db.query(`SELECT formulario_hash FROM intentos_reserva_publica
        WHERE id=?`, [f.intentoId]);
      await expect(f.registro.registrar(f.negocioId, f.titular,
        f.clave, { ...CONTACTO, nombre: 'Otra persona' }))
        .rejects.toMatchObject({ status: 409 });
      expect((await f.db.query(`SELECT formulario_hash FROM intentos_reserva_publica
        WHERE id=?`, [f.intentoId]))[0].formulario_hash).toBe(antes.formulario_hash);
      expect((await f.db.query(`SELECT c.folio,i.estado FROM intentos_reserva_publica i
        JOIN citas c ON c.id=i.cita_id WHERE i.id=?`, [f.intentoId]))[0])
        .toMatchObject({ folio: registrada.folio, estado: 'registrado' });
    });
  });
});
