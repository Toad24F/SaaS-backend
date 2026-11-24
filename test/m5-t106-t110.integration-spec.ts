import { Rol } from '../src/auth/enums/rol.enum';
import { Cita } from '../src/disponibilidad/entities/cita.entity';
import { CortesReporteService } from '../src/reportes/cortes-reporte.service';
import { conAgendaHttp } from './support/agenda-http';

type Escenario = Parameters<Parameters<typeof conAgendaHttp>[0]>[0];
type DatosCita = Pick<Cita, 'estado' | 'origen' | 'costoAceptado' | 'causaCancelacion' |
  'sucursalId' | 'servicioId' | 'nombreServicio' | 'nombreSucursal' | 'finUtc'>;

async function sembrar(f: Escenario, entradas: Array<Partial<DatosCita> & { inicio: string }>) {
  const original = await f.db.manager.findOneByOrFail(Cita, { id: f.negocios[0].ocupaciones[0] });
  const { negocioId, sucursalId, personalId, servicioId, clienteId } = original;
  // El catálogo actual usa UTC. La fecha de las citas debe usar su zona histórica.
  await f.db.query("UPDATE sucursales SET zona_horaria='UTC' WHERE negocio_id=?", [negocioId]);
  await f.db.manager.insert(Cita, entradas.map(({ inicio, ...datos }) => {
    const inicioUtc = new Date(inicio);
    return { negocioId, sucursalId, personalId, servicioId, clienteId, inicioUtc,
      finUtc: new Date(inicioUtc.getTime() + 900_000), zonaHorariaReserva: 'America/New_York',
      estado: 'pendiente', origen: 'manual',
      nombreServicio: 'Servicio histórico', nombreSucursal: 'Sucursal histórica', ...datos };
  }));
  return original;
}

function consultas(f: Escenario) {
  const actor = f.actor(Rol.ADMIN_NEGOCIO).id;
  const cortes = f.app.get(CortesReporteService);
  return { crear: (desde: string, hasta: string, agrupacion: 'semana' | 'mes') =>
    cortes.crear(actor, { desde, hasta, agrupacion }),
  obtener: (id: string) => cortes.obtenerResumen(actor, id) };
}

describe('M5-T106–T110 · indicadores sobre un corte materializado', () => {
  it('respeta límites civiles inclusivos y agrupa domingo, lunes y cambio de mes con DST', async () => {
    await conAgendaHttp(async (f) => {
      await sembrar(f, [
        { inicio: '2026-10-31T03:59:59.999Z' },
        { inicio: '2026-10-31T04:00:00.000Z' },
        { inicio: '2026-11-01T05:30:00.000Z' },
        { inicio: '2026-11-01T06:30:00.000Z' },
        { inicio: '2026-11-02T04:59:59.999Z' },
        { inicio: '2026-11-02T05:00:00.000Z' },
        { inicio: '2026-11-03T04:59:59.999Z' },
        { inicio: '2026-11-03T05:00:00.000Z' },
      ]);
      const rep = consultas(f);
      const semanal = await rep.crear('2026-10-31', '2026-11-02', 'semana');
      const mensual = await rep.crear('2026-10-31', '2026-11-02', 'mes');
      const dias = await f.db.query(`SELECT CAST(fecha_civil AS CHAR) fecha FROM filas_corte_reporte
        WHERE corte_id=? ORDER BY inicio_utc`, [semanal.id]);
      expect(dias.map((fila: { fecha: string }) => fila.fecha)).toEqual([
        '2026-10-31', '2026-11-01', '2026-11-01', '2026-11-01', '2026-11-02', '2026-11-02',
      ]);
      // La hora que se repite en el retroceso DST pertenece al mismo domingo en ambos instantes.
      const series = async (id: string) => (await rep.obtener(id)).evolucion
        .map(({ inicioPeriodo, totalCitas }) => [inicioPeriodo, totalCitas]);
      await expect(series(semanal.id)).resolves.toEqual([['2026-10-26', 4], ['2026-11-02', 2]]);
      await expect(series(mensual.id)).resolves.toEqual([['2026-10-01', 1], ['2026-11-01', 5]]);
    });
  });

  it('concilia estados, origen, evolución, tasas y estimaciones con las filas del corte', async () => {
    await conAgendaHttp(async (f) => {
      const sucursalB = f.negocios[0].sucursales[1].id;
      const servicioB = f.negocios[0].servicioInactivoId;
      const origen = await sembrar(f, [
        { inicio: '2026-10-31T15:00Z', estado: 'completada', costoAceptado: '0.10', origen: 'portal_publico' },
        { inicio: '2026-11-02T15:00Z', estado: 'completada', costoAceptado: '0.20',
          nombreServicio: 'Servicio renombrado', nombreSucursal: 'Sucursal renombrada' },
        { inicio: '2026-11-03T15:00Z', estado: 'completada', costoAceptado: null,
          servicioId: servicioB, sucursalId: sucursalB, nombreServicio: 'Otro histórico', nombreSucursal: 'Otra sede' },
        { inicio: '2026-11-04T15:00Z', estado: 'completada', costoAceptado: '0.00', origen: 'portal_publico' },
        { inicio: '2026-11-05T15:00Z', estado: 'no_asistio', costoAceptado: '900.00' },
        { inicio: '2026-11-06T15:00Z', estado: 'cancelada', causaCancelacion: 'falta_confirmacion_plazo',
          origen: 'portal_publico', costoAceptado: '900.00' },
        { inicio: '2026-11-07T15:00Z', estado: 'cancelada', servicioId: servicioB, nombreServicio: 'Otro histórico' },
        { inicio: '2026-11-08T11:45Z', estado: 'pendiente', finUtc: new Date('2026-11-08T12:00Z') },
        { inicio: '2026-11-08T11:46Z', estado: 'confirmada', finUtc: new Date('2026-11-08T12:00:00.001Z') },
        { inicio: '2026-11-08T11:00Z', estado: 'confirmada' },
        { inicio: '2026-11-08T15:00Z', estado: 'pendiente', origen: 'portal_publico' },
      ]);
      const rep = consultas(f);
      const { id } = await rep.crear('2026-10-31', '2026-11-08', 'semana');
      // Cambiar catálogos y avanzar el reloj no altera los datos ni el instante del corte.
      await f.db.query("UPDATE servicios SET costo=9999,nombre='Nombre actual' WHERE id=?", [origen.servicioId]);
      await f.db.query("UPDATE sucursales SET nombre='Sede actual' WHERE id=?", [origen.sucursalId]);
      f.reloj.avanzar(60_000);
      const resumen = await rep.obtener(id);
      expect(resumen).toMatchObject({
        totalCitas: 11,
        estados: { completada: 4, no_asistio: 1, cancelada: 2, pendiente: 2, confirmada: 2 },
        origen: { portal_publico: { cantidad: 4, porcentaje: 36.36 }, manual: { cantidad: 7, porcentaje: 63.64 } },
        tasaInasistencia: 20, tasaCancelacion: 18.18, pasadasSinResultado: 2, cancelacionesAutomaticas: 1,
        denominadoresTasas: { inasistencia: 5, cancelacion: 11 },
      });
      expect(resumen.evolucion).toEqual([
        { inicioPeriodo: '2026-10-26', totalCitas: 1,
          estados: { completada: 1, no_asistio: 0, cancelada: 0, pendiente: 0, confirmada: 0 } },
        { inicioPeriodo: '2026-11-02', totalCitas: 10,
          estados: { completada: 3, no_asistio: 1, cancelada: 2, pendiente: 2, confirmada: 2 } },
      ]);
      expect(resumen.serviciosSolicitados).toEqual([
        { servicioId: origen.servicioId, nombres: ['Servicio histórico', 'Servicio renombrado'], cantidad: 9 },
        { servicioId: servicioB, nombres: ['Otro histórico'], cantidad: 2 },
      ]);
      expect(resumen.ingresosEstimados).toEqual({
        subtotalConocido: '0.30', sinCosto: 1, incompleta: true,
        porServicio: [
          { servicioId: origen.servicioId, nombres: ['Servicio histórico', 'Servicio renombrado'],
            subtotalConocido: '0.30', sinCosto: 0, incompleta: false },
          { servicioId: servicioB, nombres: ['Otro histórico'], subtotalConocido: '0.00', sinCosto: 1, incompleta: true },
        ],
        porSucursal: [
          { sucursalId: origen.sucursalId, nombres: ['Sucursal histórica', 'Sucursal renombrada'],
            subtotalConocido: '0.30', sinCosto: 0, incompleta: false },
          { sucursalId: sucursalB, nombres: ['Otra sede'], subtotalConocido: '0.00', sinCosto: 1, incompleta: true },
        ],
      });
    });
  });

  it('devuelve null con denominador cero y distingue una tasa de cancelación real de cero', async () => {
    await conAgendaHttp(async (f) => {
      await sembrar(f, [{ inicio: '2026-11-08T15:00Z' }]);
      const rep = consultas(f);
      const vacio = await rep.crear('2026-11-09', '2026-11-09', 'semana');
      const sinAtendidas = await rep.crear('2026-11-08', '2026-11-08', 'semana');
      await expect(rep.obtener(vacio.id)).resolves.toMatchObject({
        totalCitas: 0, tasaInasistencia: null, tasaCancelacion: null, pasadasSinResultado: 0,
        denominadoresTasas: { inasistencia: 0, cancelacion: 0 },
        origen: { manual: { cantidad: 0, porcentaje: null }, portal_publico: { cantidad: 0, porcentaje: null } },
        ingresosEstimados: { subtotalConocido: '0.00', sinCosto: 0, incompleta: false },
      });
      await expect(rep.obtener(sinAtendidas.id)).resolves.toMatchObject({
        totalCitas: 1, tasaInasistencia: null, tasaCancelacion: 0, pasadasSinResultado: 0,
      });
      await expect(f.app.get(CortesReporteService).obtenerResumen(f.actor(Rol.ADMIN_NEGOCIO, 1).id, vacio.id))
        .rejects.toMatchObject({ status: 404 });
    });
  });
});
