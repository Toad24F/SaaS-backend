import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { RELOJ } from '../src/comun/reloj';
import { ApartadosService } from '../src/reservas-publicas/apartados.service';
import { IntentosReservaPublicaService } from '../src/reservas-publicas/intentos-reserva-publica.service';
import { RegistroReservaPublicaService } from '../src/reservas-publicas/registro-reserva-publica.service';
import { ResolucionReservaPublicaService } from '../src/reservas-publicas/resolucion-reserva-publica.service';
import { conBaseMigrada } from './support/mariadb';
import { crearEscenarioPortal } from './support/escenario-portal';
import { RelojPrueba } from './support/reloj';

const AHORA = new Date('2026-10-20T12:00:00.000Z');
const CONTACTO = { nombre: '  María Pérez  ', telefono: '+52 614-123-4567',
  notas: '  Primera visita  ' };

type Flujo = { db: DataSource; reloj: RelojPrueba; negocioId: number;
  segunda: DataSource;
  titular: string; apartadoId: number; intentoId: string; clave: string;
  registro: RegistroReservaPublicaService; resolucion: ResolucionReservaPublicaService;
  intentos: IntentosReservaPublicaService };

/** Siembra una oferta real y prepara el intento bajo los servicios de producción. */
async function conFlujo(ejecutar: (flujo: Flujo) => Promise<void>) {
  await conBaseMigrada(async (db, segunda) => {
    const reloj = new RelojPrueba(AHORA);
    const { negocios: [negocio] } = await crearEscenarioPortal(db, reloj);
    await db.query(`INSERT INTO licencias (negocio_id,creado_en,habilitada_en,vence_en)
      VALUES (?,'2026-01-01','2026-01-01','2027-01-01')`, [negocio.id]);
    await db.query(`INSERT INTO horarios_personal (negocio_id,personal_id,sucursal_id,
      dia_semana,orden,inicio_minutos,fin_minutos,activo)
      VALUES (?,?,?,2,0,480,720,1)`, [negocio.id, negocio.profesionales[0],
      negocio.sucursales[0].id]);
    const servicioId = Number((await db.query(`SELECT id FROM servicios
      WHERE negocio_id=? AND activo=1`, [negocio.id]))[0].id);
    const previo = process.env.PORTAL_FORMULARIO_HMAC_SECRET;
    process.env.PORTAL_FORMULARIO_HMAC_SECRET = 'secreto-formulario-pruebas-aislado-123456';
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DataSource).useValue(db).overrideProvider(RELOJ).useValue(reloj).compile();
    try {
      const titular = 'a'.repeat(64);
      await db.query(`INSERT INTO sesiones_reserva_publica
        (negocio_id,titular_hash,generacion) VALUES (?,?,0)`, [negocio.id, titular]);
      const apartados = modulo.get(ApartadosService);
      const apartado = await apartados.solicitar(negocio.id, titular, {
        clave: 'operacion_reserva_12345', personalId: negocio.profesionales[0],
        sucursalId: negocio.sucursales[0].id, servicioId,
        fechaLocal: '2026-10-20', horaInicio: '08:00' });
      expect(apartado.estado).toBe('concedida');
      const apartadoId = apartado.apartadoId!;
      const clave = 'intento_reserva_12345';
      const intentos = modulo.get(IntentosReservaPublicaService);
      const intento = await intentos.preparar(negocio.id, titular, { clave, apartadoId });
      await ejecutar({ db, segunda, reloj, negocioId: negocio.id, titular, apartadoId,
        intentoId: intento.id, clave, intentos,
        registro: modulo.get(RegistroReservaPublicaService),
        resolucion: modulo.get(ResolucionReservaPublicaService) });
    } finally {
      await modulo.close();
      if (previo === undefined) delete process.env.PORTAL_FORMULARIO_HMAC_SECRET;
      else process.env.PORTAL_FORMULARIO_HMAC_SECRET = previo;
    }
  });
}

describe('M3-T074–T079: escritor y resolución de intentos', () => {
  it('revalida, guarda copia histórica y recupera una sola cita', async () => {
    await conFlujo(async (f) => {
      const resultado = await f.registro.registrar(f.negocioId, f.titular, f.clave, CONTACTO);
      expect(resultado).toMatchObject({ estado: 'pendiente', costoAceptado: '100.00',
        nombreNegocio: 'Portal 1', nombreServicio: 'Corte' });
      expect(resultado).not.toHaveProperty('nombreContacto');
      expect(resultado.folio).toMatch(/^P-[A-F0-9]{18}$/);
      const cita = (await f.db.query(`SELECT c.*,cl.nombre_completo,cl.telefono
        FROM citas c JOIN clientes cl ON cl.id=c.cliente_id AND cl.negocio_id=c.negocio_id
        WHERE c.folio=?`, [resultado.folio]))[0];
      expect(cita).toMatchObject({ nombre_completo: 'María Pérez',
        telefono: '6141234567', nombre_contacto: 'María Pérez',
        telefono_contacto: '6141234567', motivo_consulta: 'Primera visita',
        costo_aceptado: '100.00', origen: 'portal_publico', estado: 'pendiente' });
      expect((await f.db.query('SELECT apartado_actual_id FROM sesiones_reserva_publica WHERE negocio_id=?',
        [f.negocioId]))[0].apartado_actual_id).toBeNull();
      expect((await f.db.query('SELECT liberado_en FROM bloqueos_temporales WHERE id=?',
        [f.apartadoId]))[0].liberado_en).not.toBeNull();
      f.reloj.fijar(new Date('2026-10-20T12:10:00Z'));
      await f.db.query(`UPDATE licencias SET vence_en='2026-10-20 12:05:00'
        WHERE negocio_id=?`, [f.negocioId]);
      expect(await f.registro.registrar(f.negocioId, f.titular, f.clave,
        { nombre: 'María Pérez', telefono: '6141234567', notas: 'Primera visita' }))
        .toEqual(resultado);
      expect(await f.resolucion.resolver(f.negocioId, f.titular,
        f.clave, f.apartadoId)).toEqual({ estado: 'registrado', resultado });
      await expect(f.registro.registrar(f.negocioId, f.titular, f.clave,
        { ...CONTACTO, nombre: 'Otra' })).rejects.toThrow();
      expect((await f.db.query('SELECT COUNT(*) AS n FROM citas WHERE origen=?',
        ['portal_publico']))[0].n).toBe('1');
    });
  }, 120000);

  it('una negativa funcional no inserta cita ni consume apartado', async () => {
    await conFlujo(async (f) => {
      await f.db.query('UPDATE servicios SET activo=0 WHERE negocio_id=? AND nombre=?',
        [f.negocioId, 'Corte']);
      await expect(f.registro.registrar(f.negocioId, f.titular, f.clave, CONTACTO))
        .rejects.toThrow();
      expect((await f.db.query('SELECT COUNT(*) AS n FROM citas WHERE origen=?',
        ['portal_publico']))[0].n).toBe('0');
      expect((await f.db.query('SELECT estado FROM intentos_reserva_publica WHERE id=?',
        [f.intentoId]))[0].estado).toBe('preparado');
      expect((await f.db.query('SELECT liberado_en FROM bloqueos_temporales WHERE id=?',
        [f.apartadoId]))[0].liberado_en).toBeNull();
      await f.db.query('UPDATE servicios SET activo=1,duracion_minutos=45 WHERE negocio_id=? AND nombre=?',
        [f.negocioId, 'Corte']);
      await expect(f.registro.registrar(f.negocioId, f.titular, f.clave, CONTACTO))
        .rejects.toThrow();
      expect((await f.db.query('SELECT COUNT(*) AS n FROM citas WHERE origen=?',
        ['portal_publico']))[0].n).toBe('0');
    });
  }, 120000);

  it.each(['clientes', 'citas', 'resultado'])(
    'revierte todo si falla la escritura de %s', async (punto) => {
      await conFlujo(async (f) => {
        const tabla = punto === 'resultado' ? 'intentos_reserva_publica' : punto;
        const evento = punto === 'resultado' ? 'BEFORE UPDATE' : 'AFTER INSERT';
        const condicion = punto === 'resultado' ? "IF NEW.estado='registrado' THEN " : '';
        const cierre = punto === 'resultado' ? ' END IF;' : '';
        await f.db.query(`CREATE TRIGGER fallo_prueba_${punto} ${evento} ON ${tabla}
          FOR EACH ROW BEGIN ${condicion}SIGNAL SQLSTATE '45000'
          SET MESSAGE_TEXT='fallo controlado';${cierre} END`);
        try {
          await expect(f.registro.registrar(f.negocioId, f.titular, f.clave, CONTACTO))
            .rejects.toThrow();
        } finally {
          await f.db.query(`DROP TRIGGER fallo_prueba_${punto}`);
        }
        // El intento preparado y el apartado siguen exactamente como antes.
        expect((await f.db.query('SELECT COUNT(*) AS n FROM citas WHERE origen=?',
          ['portal_publico']))[0].n).toBe('0');
        expect((await f.db.query('SELECT COUNT(*) AS n FROM clientes WHERE negocio_id=?',
          [f.negocioId]))[0].n).toBe('1');
        expect((await f.db.query('SELECT estado,cita_id FROM intentos_reserva_publica WHERE id=?',
          [f.intentoId]))[0]).toMatchObject({ estado: 'preparado', cita_id: null });
        expect((await f.db.query('SELECT liberado_en FROM bloqueos_temporales WHERE id=?',
          [f.apartadoId]))[0].liberado_en).toBeNull();
      });
    }, 120000);

  it('cierra la clave ausente y la preparación o escritura tardías quedan bloqueadas', async () => {
    await conFlujo(async (f) => {
      const ausente = 'intento_que_no_llego_123';
      expect(await f.resolucion.resolver(f.negocioId, f.titular,
        ausente, f.apartadoId)).toEqual({ estado: 'no_registrado' });
      await expect(f.intentos.preparar(f.negocioId, f.titular,
        { clave: ausente, apartadoId: f.apartadoId })).rejects.toThrow();
      await expect(f.registro.registrar(f.negocioId, f.titular, ausente, CONTACTO))
        .rejects.toThrow();
      expect((await f.db.query('SELECT COUNT(*) AS n FROM citas WHERE origen=?',
        ['portal_publico']))[0].n).toBe('0');
    });
  }, 120000);

  it('espera la sesión bloqueada y cierra un intento preparado liberando solo su apartado', async () => {
    await conFlujo(async (f) => {
      const corredor = f.segunda.createQueryRunner();
      await corredor.connect();
      await corredor.startTransaction('READ COMMITTED');
      try {
        await corredor.query(`SELECT id FROM sesiones_reserva_publica
          WHERE negocio_id=? AND titular_hash=? FOR UPDATE`, [f.negocioId, f.titular]);
        let terminado = false;
        const pendiente = f.resolucion.resolver(f.negocioId, f.titular,
          f.clave, f.apartadoId).then((valor) => { terminado = true; return valor; });
        await new Promise((resolver) => setTimeout(resolver, 50));
        expect(terminado).toBe(false);
        await corredor.commitTransaction();
        expect(await pendiente).toEqual({ estado: 'no_registrado' });
      } finally {
        if (corredor.isTransactionActive) await corredor.rollbackTransaction();
        await corredor.release();
      }
      expect((await f.db.query('SELECT estado FROM intentos_reserva_publica WHERE id=?',
        [f.intentoId]))[0].estado).toBe('no_registrado');
      expect((await f.db.query('SELECT liberado_en FROM bloqueos_temporales WHERE id=?',
        [f.apartadoId]))[0].liberado_en).not.toBeNull();
      expect((await f.db.query('SELECT apartado_actual_id FROM sesiones_reserva_publica WHERE negocio_id=?',
        [f.negocioId]))[0].apartado_actual_id).toBeNull();
      await expect(f.registro.registrar(f.negocioId, f.titular, f.clave, CONTACTO))
        .rejects.toThrow();
    });
  }, 120000);
});
