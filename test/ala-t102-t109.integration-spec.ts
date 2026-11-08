import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { Rol } from '../src/auth/enums/rol.enum';
import { SesionesService } from '../src/auth/services/sesiones.service';
import { RELOJ } from '../src/comun/reloj';
import { CitasAfectadasService } from '../src/disponibilidad/citas-afectadas.service';
import { ApartadosService } from '../src/reservas-publicas/apartados.service';
import { IntentosReservaPublicaService } from '../src/reservas-publicas/intentos-reserva-publica.service';
import { RegistroReservaPublicaService } from '../src/reservas-publicas/registro-reserva-publica.service';
import { conBaseMigrada } from './support/mariadb';
import { crearEscenarioPortal } from './support/escenario-portal';
import { RelojPrueba } from './support/reloj';

const AHORA = new Date('2026-10-20T12:00:00.000Z');
const CONTACTO = { nombre: 'María Pérez', telefono: '6141234567', notas: 'Consulta' };
type Flujo = { db: DataSource; reloj: RelojPrueba; negocioId: number;
  personalId: number; sucursalId: number; servicioId: number; titular: string;
  token: { sub: number; sesionId: string }; apartados: ApartadosService;
  intentos: IntentosReservaPublicaService; registro: RegistroReservaPublicaService;
  afectadas: CitasAfectadasService;
  conceder: (clave: string, horaInicio?: string) => ReturnType<ApartadosService['solicitar']>;
  preparar: (apartadoId: number, clave: string) => ReturnType<IntentosReservaPublicaService['preparar']>;
  registrar: (clave: string) => ReturnType<RegistroReservaPublicaService['registrar']> };

/** Cada caso escribe solo en una base temporal migrada y conserva un reloj inyectado. */
async function conFlujo(ejecutar: (flujo: Flujo) => Promise<void>) {
  await conBaseMigrada(async (db) => {
    const reloj = new RelojPrueba(AHORA);
    const { negocios: [negocio] } = await crearEscenarioPortal(db, reloj);
    const negocioId = negocio.id;
    const personalId = negocio.profesionales[0];
    const sucursalId = negocio.sucursales[0].id;
    const servicioId = Number((await db.query(`SELECT id FROM servicios
      WHERE negocio_id=? AND activo=1`, [negocioId]))[0].id);
    await db.query(`INSERT INTO licencias (negocio_id,creado_en,habilitada_en,vence_en)
      VALUES (?,'2026-01-01','2026-01-01','2027-01-01')`, [negocioId]);
    await db.query(`INSERT INTO configuracion_agenda
      (negocio_id,modo,tiempo_entre_citas_minutos,anticipacion_minutos,dias_futuros)
      VALUES (?,'agenda_compacta',10,15,1)`, [negocioId]);
    await db.query(`INSERT INTO horarios_personal (negocio_id,personal_id,sucursal_id,
      dia_semana,orden,inicio_minutos,fin_minutos,activo)
      VALUES (?,?,?,2,0,480,720,1)`, [negocioId, personalId, sucursalId]);
    const titular = 'a'.repeat(64);
    await db.query(`INSERT INTO sesiones_reserva_publica
      (negocio_id,titular_hash,generacion) VALUES (?,?,0)`, [negocioId, titular]);
    const admin = await db.query(`INSERT INTO usuarios
      (negocio_id,nombre,email,password_hash,rol,activo,activado_en,creado_en)
      VALUES (?,'Admin ALA','admin-t102@example.test','hash',?,1,?,?)`,
    [negocioId, Rol.ADMIN_NEGOCIO, AHORA, AHORA]);
    const anterior = process.env.PORTAL_FORMULARIO_HMAC_SECRET;
    process.env.PORTAL_FORMULARIO_HMAC_SECRET = 'secreto-formulario-pruebas-aislado-123456';
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DataSource).useValue(db).overrideProvider(RELOJ).useValue(reloj).compile();
    try {
      const sesion = await modulo.get(SesionesService).crear(Number(admin.insertId), AHORA);
      const apartados = modulo.get(ApartadosService);
      const intentos = modulo.get(IntentosReservaPublicaService);
      const registro = modulo.get(RegistroReservaPublicaService);
      await ejecutar({ db, reloj, negocioId, personalId, sucursalId, servicioId,
        titular, token: { sub: Number(admin.insertId), sesionId: sesion.id },
        apartados, intentos, registro, afectadas: modulo.get(CitasAfectadasService),
        conceder: (clave, horaInicio = '08:00') => apartados.solicitar(negocioId,
          titular, { clave, personalId, sucursalId, servicioId,
            fechaLocal: '2026-10-20', horaInicio }),
        preparar: (apartadoId, clave) => intentos.preparar(negocioId, titular,
          { apartadoId, clave }),
        registrar: (clave) => registro.registrar(negocioId, titular, clave, CONTACTO),
      });
    } finally {
      await modulo.close();
      if (anterior === undefined) delete process.env.PORTAL_FORMULARIO_HMAC_SECRET;
      else process.env.PORTAL_FORMULARIO_HMAC_SECRET = anterior;
    }
  });
}

describe('ALA-T102–T109: apartado preservado, cita protegida y rollback', () => {
  it('T102 captura modo, separación y extremos sin mover el vencimiento', async () => {
    await conFlujo(async (f) => {
      const apartado = await f.conceder('ala_102_apartado_123');
      expect(apartado.estado).toBe('concedida');
      const [fila] = await f.db.query(`SELECT modo_concesion,version_reglas,
        separacion_minutos,fin_utc,fin_ocupacion_utc,expira_en,
        costo_aceptado,zona_horaria_apartado FROM bloqueos_temporales WHERE id=?`,
      [apartado.apartadoId]);
      expect(fila).toMatchObject({ modo_concesion: 'agenda_compacta',
        version_reglas: 1, separacion_minutos: 10, costo_aceptado: '100.00',
        zona_horaria_apartado: 'America/Chihuahua' });
      expect(new Date(fila.fin_utc).toISOString()).toBe('2026-10-20T14:30:00.000Z');
      expect(new Date(fila.fin_ocupacion_utc).toISOString())
        .toBe('2026-10-20T14:40:00.000Z');
      expect(new Date(fila.expira_en).toISOString()).toBe('2026-10-20T12:05:00.000Z');
    });
  });

  it('T103 permite consumir apartado propio aunque reaparezca un inicio anterior', async () => {
    await conFlujo(async (f) => {
      // La ocupación de otra sesión desplaza Compacta a 08:30; liberarla después
      // no debe quitar al titular su apartado ya concedido para 08:30.
      const previo = await f.db.query(`INSERT INTO bloqueos_temporales
        (negocio_id,personal_id,sucursal_id,servicio_id,inicio_utc,fin_utc,
         expira_en,titular_hash) VALUES (?,?,?,?,?,?,?,?)`,
      [f.negocioId, f.personalId, f.sucursalId, f.servicioId,
        new Date('2026-10-20T14:00:00Z'), new Date('2026-10-20T14:30:00Z'),
        new Date('2026-10-20T12:05:00Z'), 'b'.repeat(64)]);
      const apartado = await f.conceder('ala_103_apartado_123', '08:30');
      expect(apartado.estado).toBe('concedida');
      await f.db.query('UPDATE bloqueos_temporales SET liberado_en=? WHERE id=?',
        [AHORA, previo.insertId]);
      await f.preparar(apartado.apartadoId!, 'ala_103_intento_1234');
      expect((await f.registrar('ala_103_intento_1234')).estado).toBe('pendiente');
    });
  });

  it('T104–T105 copia separación histórica aunque cambien modo y separación', async () => {
    await conFlujo(async (f) => {
      const apartado = await f.conceder('ala_104_apartado_123');
      await f.preparar(apartado.apartadoId!, 'ala_104_intento_1234');
      await f.db.query(`UPDATE configuracion_agenda SET modo='ventana_libre',
        tiempo_entre_citas_minutos=60 WHERE negocio_id=?`, [f.negocioId]);
      await f.db.query(`UPDATE horarios_personal SET fin_minutos=520
        WHERE negocio_id=? AND personal_id=?`, [f.negocioId, f.personalId]);
      const respuesta = await f.registrar('ala_104_intento_1234');
      const [cita] = await f.db.query(`SELECT apartado_origen_id,separacion_minutos,
        fin_utc,fin_ocupacion_utc,estado FROM citas WHERE folio=?`, [respuesta.folio]);
      expect(cita).toMatchObject({ apartado_origen_id: apartado.apartadoId,
        separacion_minutos: 10, estado: 'pendiente' });
      expect(new Date(cita.fin_utc).toISOString()).toBe('2026-10-20T14:30:00.000Z');
      expect(new Date(cita.fin_ocupacion_utc).toISOString())
        .toBe('2026-10-20T14:40:00.000Z');
      expect((await f.db.query(`SELECT COUNT(*) AS n FROM citas
        WHERE negocio_id=? AND apartado_origen_id=?`,
      [f.negocioId, apartado.apartadoId]))[0].n).toBe('1');
      expect(await f.registrar('ala_104_intento_1234')).toEqual(respuesta);
    });
  });

  it.each(['servicio', 'licencia', 'horario'])(
    'T106 conserva el apartado y rechaza consumo si cambia %s', async (cambio) => {
      await conFlujo(async (f) => {
        const apartado = await f.conceder(`ala_106_${cambio}_apartado`);
        const clave = `ala_106_${cambio}_intento_123`;
        await f.preparar(apartado.apartadoId!, clave);
        if (cambio === 'servicio') await f.db.query(
          'UPDATE servicios SET activo=0,inhabilitado_en=? WHERE id=?',
          [AHORA, f.servicioId]);
        if (cambio === 'licencia') await f.db.query(
          'UPDATE licencias SET vence_en=? WHERE negocio_id=?', [AHORA, f.negocioId]);
        if (cambio === 'horario') await f.db.query(`UPDATE horarios_personal
          SET fin_minutos=490 WHERE negocio_id=? AND personal_id=?`,
        [f.negocioId, f.personalId]);
        await expect(f.registrar(clave)).rejects.toMatchObject({
          status: cambio === 'licencia' ? 404 : 409 });
        expect((await f.db.query(`SELECT COUNT(*) AS n FROM citas
          WHERE negocio_id=? AND origen='portal_publico'`, [f.negocioId]))[0].n).toBe('0');
        const [fila] = await f.db.query(`SELECT liberado_en,expira_en FROM bloqueos_temporales
          WHERE id=?`, [apartado.apartadoId]);
        expect(fila.liberado_en).toBeNull();
        expect(new Date(fila.expira_en).toISOString()).toBe('2026-10-20T12:05:00.000Z');
      });
    }, 120000);

  it('T107 usa fin protegido histórico para detectar y retirar afectación', async () => {
    await conFlujo(async (f) => {
      const apartado = await f.conceder('ala_107_apartado_123');
      await f.preparar(apartado.apartadoId!, 'ala_107_intento_1234');
      const reserva = await f.registrar('ala_107_intento_1234');
      const [antes] = await f.db.query('SELECT * FROM citas WHERE folio=?', [reserva.folio]);
      const leer = () => f.afectadas.consultar(f.token, { desde: '2026-10-20',
        hasta: '2026-10-20', personalId: f.personalId });
      await f.db.query(`UPDATE configuracion_agenda SET tiempo_entre_citas_minutos=60
        WHERE negocio_id=?`, [f.negocioId]);
      await f.db.query(`UPDATE horarios_personal SET fin_minutos=510
        WHERE negocio_id=? AND personal_id=?`, [f.negocioId, f.personalId]);
      const afectadas = await leer();
      expect(afectadas.citas.find((c) => c.citaId === antes.id)?.causas)
        .toEqual(expect.arrayContaining([expect.objectContaining({
          codigo: 'horario_insuficiente' })]));
      await f.db.query(`UPDATE horarios_personal SET fin_minutos=520
        WHERE negocio_id=? AND personal_id=?`, [f.negocioId, f.personalId]);
      expect((await leer()).citas.some((c) => c.citaId === antes.id)).toBe(false);
      const bloqueo = await f.db.query(`INSERT INTO bloqueos_horario
        (negocio_id,personal_id,sucursal_id,creador_usuario_id,tipo,motivo,
         fecha_inicio,fecha_fin,inicio_minutos,fin_minutos)
        VALUES (?,?,?,?,'emergencia','Cierre protegido',
          '2026-10-20','2026-10-20',510,520)`,
      [f.negocioId, f.personalId, f.sucursalId, f.token.sub]);
      expect((await leer()).citas.find((c) => c.citaId === antes.id)?.causas)
        .toEqual(expect.arrayContaining([expect.objectContaining({ codigo: 'bloqueo' })]));
      await f.db.query('DELETE FROM bloqueos_horario WHERE id=?', [bloqueo.insertId]);
      expect((await leer()).citas.some((c) => c.citaId === antes.id)).toBe(false);
      const [despues] = await f.db.query('SELECT * FROM citas WHERE id=?', [antes.id]);
      expect(despues.fin_ocupacion_utc).toEqual(antes.fin_ocupacion_utc);
      expect(despues.estado).toBe(antes.estado);
    });
  });

  it('T108 reemplazo fallido y vencimiento exacto no reviven ni renuevan apartado', async () => {
    await conFlujo(async (f) => {
      const primero = await f.conceder('ala_108_primero_1234');
      expect((await f.conceder('ala_108_fallido_1234', '17:00')).estado)
        .toBe('rechazada');
      expect((await f.db.query(`SELECT liberado_en FROM bloqueos_temporales
        WHERE id=?`, [primero.apartadoId]))[0].liberado_en).not.toBeNull();
      const nuevo = await f.conceder('ala_108_nuevo_12345');
      const clave = 'ala_108_intento_1234';
      await f.preparar(nuevo.apartadoId!, clave);
      f.reloj.fijar(new Date('2026-10-20T12:05:00.000Z'));
      await expect(f.registrar(clave)).rejects.toMatchObject({ status: 409 });
      const [fila] = await f.db.query(`SELECT liberado_en,expira_en FROM bloqueos_temporales
        WHERE id=?`, [nuevo.apartadoId]);
      expect(fila.liberado_en).toBeNull();
      expect(new Date(fila.expira_en).toISOString()).toBe('2026-10-20T12:05:00.000Z');
    });
  });

  it.each(['cliente', 'cita', 'consumo'])(
    'T109 revierte todo tras fallo controlado de %s y permite repetir', async (punto) => {
      await conFlujo(async (f) => {
        const apartado = await f.conceder(`ala_109_${punto}_apartado`);
        const clave = `ala_109_${punto}_intento_123`;
        const intento = await f.preparar(apartado.apartadoId!, clave);
        const tabla = punto === 'cliente' ? 'clientes' :
          punto === 'cita' ? 'citas' : 'bloqueos_temporales';
        const evento = punto === 'consumo' ? 'AFTER UPDATE' : 'AFTER INSERT';
        const condicion = punto === 'consumo' ?
          "IF NEW.liberado_en IS NOT NULL THEN " : '';
        const cierre = punto === 'consumo' ? ' END IF;' : '';
        await f.db.query(`CREATE TRIGGER fallo_ala_109 ${evento} ON ${tabla}
          FOR EACH ROW BEGIN ${condicion}SIGNAL SQLSTATE '45000'
          SET MESSAGE_TEXT='fallo controlado';${cierre} END`);
        try { await expect(f.registrar(clave)).rejects.toThrow(); }
        finally { await f.db.query('DROP TRIGGER fallo_ala_109'); }
        // El fallo puede llegar después de INSERT o UPDATE; ninguna fila del
        // compromiso se confirma y el intento preparado conserva su identidad.
        expect((await f.db.query(`SELECT COUNT(*) AS n FROM clientes
          WHERE negocio_id=?`, [f.negocioId]))[0].n).toBe('1');
        expect((await f.db.query(`SELECT COUNT(*) AS n FROM citas
          WHERE negocio_id=? AND origen='portal_publico'`, [f.negocioId]))[0].n)
          .toBe('0');
        expect((await f.db.query(`SELECT estado,cita_id FROM intentos_reserva_publica
          WHERE id=?`, [intento.id]))[0]).toMatchObject({
          estado: 'preparado', cita_id: null });
        expect((await f.db.query(`SELECT liberado_en FROM bloqueos_temporales
          WHERE id=?`, [apartado.apartadoId]))[0].liberado_en).toBeNull();
        const registrado = await f.registrar(clave);
        expect(await f.registrar(clave)).toEqual(registrado);
        expect((await f.db.query(`SELECT COUNT(*) AS n FROM citas
          WHERE negocio_id=? AND apartado_origen_id=?`,
        [f.negocioId, apartado.apartadoId]))[0].n).toBe('1');
      });
    }, 120000);
});
