import { createHash, randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { AutorizacionService } from '../src/auth/services/autorizacion.service';
import { PoliticaAccesoLicenciaService } from '../src/licencias/services/politica-acceso-licencia.service';
import { ContextoDisponibilidadService } from '../src/disponibilidad/contexto-disponibilidad.service';
import { ConfiguracionAgendaService } from '../src/disponibilidad/configuracion-agenda.service';
import { OfertaEfectivaService } from '../src/disponibilidad/oferta-efectiva.service';
import { AtencionInternaService } from '../src/disponibilidad/atencion-interna.service';
import { BloqueosAplicablesService } from '../src/disponibilidad/bloqueos-aplicables.service';
import { OcupacionesService } from '../src/disponibilidad/ocupaciones.service';
import { MotorDisponibilidadService } from '../src/disponibilidad/motor-disponibilidad.service';
import { conBaseMigrada } from './support/mariadb';
import { crearDatosOcupaciones } from './support/ocupaciones-fase-3';
import { RelojPrueba } from './support/reloj';

const ahora = new Date('2026-07-06T16:07:00Z');
const fecha = '2026-07-06';
const titularHash = createHash('sha256').update('titular-t080').digest('hex');

async function escenario(ejecutar: (datos: {
  primera: DataSource; segunda: DataSource;
  motor: MotorDisponibilidadService; configuracion: ConfiguracionAgendaService;
  token: { sub: number; sesionId: string };
  negocioId: number; personalId: number; sucursalId: number; servicioId: number;
}) => Promise<void>) {
  await conBaseMigrada(async (primera, segunda) => {
    const a = (await crearDatosOcupaciones(primera, new RelojPrueba(ahora))).negocios[0];
    await primera.query('DELETE FROM bloqueos_temporales WHERE negocio_id=?', [a.id]);
    await primera.query('DELETE FROM citas WHERE negocio_id=?', [a.id]);
    await primera.query('UPDATE negocios SET activado_en=creado_en WHERE id=?', [a.id]);
    await primera.query(`INSERT INTO licencias
      (negocio_id,creado_en,habilitada_en,vence_en)
      VALUES (?,'2026-01-01','2026-01-01','2027-01-01')`, [a.id]);
    const sesionId = randomUUID();
    await primera.query(`INSERT INTO sesiones (id,usuario_id,creada_en,expira_en)
      VALUES (?,?,?,?)`, [sesionId, a.personalId,
      new Date(ahora.getTime() - 3600000), new Date(ahora.getTime() + 11 * 3600000)]);
    await primera.query(`INSERT INTO horarios_personal
      (negocio_id,personal_id,sucursal_id,dia_semana,orden,
      inicio_minutos,fin_minutos,activo) VALUES (?,?,?,1,0,540,780,1)`,
    [a.id, a.personalId, a.sucursales[0]]);
    const permisos = new AutorizacionService();
    const configuracion = new ConfiguracionAgendaService(primera, {} as never, permisos);
    const motor = new MotorDisponibilidadService(primera, new RelojPrueba(ahora),
      new ContextoDisponibilidadService(permisos, new PoliticaAccesoLicenciaService()),
      configuracion, new OfertaEfectivaService(permisos),
      new AtencionInternaService(new BloqueosAplicablesService()),
      new OcupacionesService());
    await ejecutar({ primera, segunda, motor, configuracion,
      token: { sub: a.personalId, sesionId }, negocioId: a.id,
      personalId: a.personalId, sucursalId: a.sucursales[0],
      servicioId: a.servicios[0] });
  });
}

describe('M2-T080–T081: duración histórica y lectura coherente', () => {
  it('aplica 45 minutos solo a nuevas ranuras y conserva cita y apartado previos', async () => {
    await escenario(async ({ primera, motor, token, negocioId,
      personalId, sucursalId, servicioId }) => {
      const cliente = await primera.query('SELECT id FROM clientes WHERE negocio_id=? LIMIT 1',
        [negocioId]);
      const cita = await primera.query(`INSERT INTO citas
        (negocio_id,personal_id,sucursal_id,servicio_id,cliente_id,inicio_utc,
        fin_utc,zona_horaria_reserva,estado,folio,origen)
        VALUES (?,?,?,?,?,? ,?,'America/Chihuahua','confirmada','T080-HIST','manual')`,
      [negocioId, personalId, sucursalId, servicioId, cliente[0].id,
        new Date('2026-07-06T16:00:00Z'), new Date('2026-07-06T16:30:00Z')]);
      const apartado = await primera.query(`INSERT INTO bloqueos_temporales
        (negocio_id,personal_id,sucursal_id,servicio_id,inicio_utc,fin_utc,
        expira_en,titular_hash) VALUES (?,?,?,?,?,?,?,?)`,
      [negocioId, personalId, sucursalId, servicioId,
        new Date('2026-07-06T17:00:00Z'), new Date('2026-07-06T17:30:00Z'),
        new Date('2026-07-06T17:40:00Z'), titularHash]);
      const args = [token, personalId, sucursalId, servicioId, fecha, fecha] as const;
      const antes = await motor.consultar(...args);
      expect(antes.ranuras).toEqual(expect.arrayContaining([
        expect.objectContaining({ inicioUtc: new Date('2026-07-06T16:30:00Z'),
          finUtc: new Date('2026-07-06T17:00:00Z') })]));
      await primera.query('UPDATE servicios SET duracion_minutos=45 WHERE id=?', [servicioId]);
      const despues = await motor.consultar(...args);
      expect(despues.ranuras.some((r) => r.inicioUtc.toISOString() ===
        '2026-07-06T16:30:00.000Z')).toBe(false);
      expect(despues.ranuras).toEqual(expect.arrayContaining([
        expect.objectContaining({ inicioUtc: new Date('2026-07-06T17:30:00Z'),
          finUtc: new Date('2026-07-06T18:15:00Z') })]));
      const rechazo = await primera.transaction('READ COMMITTED', (manager) =>
        motor.revalidarEnTransaccion(manager, token, { personalId, sucursalId,
          servicioId, fechaLocal: fecha, horaInicio: '11:00', modalidad: 'manual',
          apartadoPropio: { id: Number(apartado.insertId), titularHash } }));
      expect(rechazo).toMatchObject({ valido: false,
        motivos: expect.arrayContaining(['apartado_no_vigente_o_incompatible']) });
      // La nueva duración solo afecta cálculos nuevos; ambos compromisos guardados siguen intactos.
      const historica = await primera.query(`SELECT inicio_utc,fin_utc,zona_horaria_reserva,
        estado FROM citas WHERE id=?`, [cita.insertId]);
      const retenido = await primera.query('SELECT inicio_utc,fin_utc,liberado_en FROM bloqueos_temporales WHERE id=?',
        [apartado.insertId]);
      expect(new Date(historica[0].fin_utc).toISOString()).toBe('2026-07-06T16:30:00.000Z');
      expect(historica[0]).toMatchObject({ zona_horaria_reserva: 'America/Chihuahua',
        estado: 'confirmada' });
      expect(new Date(retenido[0].fin_utc).toISOString()).toBe('2026-07-06T17:30:00.000Z');
      expect(retenido[0].liberado_en).toBeNull();
    });
  });

  it('lee reglas y oferta de una sola instantánea ante un commit concurrente', async () => {
    await escenario(async ({ primera, segunda, motor, configuracion, token,
      negocioId, personalId, sucursalId, servicioId }) => {
      let anunciar!: () => void;
      let continuar!: () => void;
      const reglasLeidas = new Promise<void>((resolver) => { anunciar = resolver; });
      const permitirContinuar = new Promise<void>((resolver) => { continuar = resolver; });
      const original = configuracion.consultarEnContexto.bind(configuracion);
      // La barrera ocurre tras leer reglas en A y antes de leer oferta: B confirma ambos cambios.
      const pausa = jest.spyOn(configuracion, 'consultarEnContexto')
        .mockImplementationOnce(async (contexto) => {
          const reglas = await original(contexto);
          anunciar();
          await permitirContinuar;
          return reglas;
        });
      const args = [token, personalId, sucursalId, servicioId, fecha, fecha] as const;
      try {
        const pendiente = motor.consultar(...args);
        await reglasLeidas;
        await segunda.transaction(async (manager) => {
          await manager.query(`INSERT INTO configuracion_agenda
            (negocio_id,modo,intervalo_minutos,anticipacion_minutos,dias_futuros)
            VALUES (?,'agenda_compacta',30,0,7)`, [negocioId]);
          await manager.query('UPDATE servicios SET activo=0 WHERE id=?', [servicioId]);
        });
        continuar();
        const antigua = await pendiente;
        expect(antigua.reglas).toMatchObject({ modo: 'ventana_libre',
          intervaloMinutos: 15 });
        expect(antigua.ranuras.length).toBeGreaterThan(0);
        const nueva = await motor.consultar(...args);
        expect(nueva.reglas).toMatchObject({ modo: 'agenda_compacta',
          intervaloMinutos: 30 });
        expect(nueva.ranuras).toEqual([]);
        const error = jest.spyOn(configuracion, 'consultarEnContexto')
          .mockRejectedValueOnce(new Error('detalle SQL privado'));
        await expect(motor.consultar(...args)).rejects.toThrow('detalle SQL privado');
        error.mockRestore();
        await segunda.query('UPDATE servicios SET activo=1 WHERE id=?', [servicioId]);
        expect((await motor.consultar(...args)).ranuras.length).toBeGreaterThan(0);
      } finally {
        continuar();
        pausa.mockRestore();
      }
      expect(primera).not.toBe(segunda);
    });
  });
});
