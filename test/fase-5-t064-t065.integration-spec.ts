import { randomUUID } from 'node:crypto';
import { Cita } from '../src/disponibilidad/entities/cita.entity';
import { RegistroCitaManualService } from '../src/citas/registro-cita-manual.service';
import { IntentosCitaManualService } from '../src/citas/intentos-cita-manual.service';
import { AccesoOperativoService } from '../src/citas/acceso-operativo.service';
import { conAgendaHttp } from './support/agenda-http';
import { prepararManual, filasManuales, esperarBloqueoManual } from './support/cita-manual';

const intervalos = [
  { caso: 'iguales', inicio: '15:17', fin: '15:47', separacion: 10, valido: false },
  { caso: 'parcial', inicio: '15:40', fin: '16:10', separacion: 10, valido: false },
  { caso: 'solo separación anterior', inicio: '14:40', fin: '15:10', separacion: 15, valido: false },
  { caso: 'solo separación nueva', inicio: '15:50', fin: '16:20', separacion: 0, valido: false },
  { caso: 'contiguo anterior', inicio: '14:32', fin: '15:02', separacion: 15, valido: true },
  { caso: 'contiguo posterior', inicio: '15:57', fin: '16:27', separacion: 10, valido: true },
];

describe('M4-T064–T065: escritor manual real entre sucursales y tras esperas', () => {
  const previo = process.env.CITAS_MANUALES_HMAC_SECRET;
  beforeAll(() => { process.env.CITAS_MANUALES_HMAC_SECRET = 'secreto-fijo-aceptacion-manual-t064-t065'; });
  afterAll(() => { if (previo === undefined) delete process.env.CITAS_MANUALES_HMAC_SECRET; else process.env.CITAS_MANUALES_HMAC_SECRET = previo; });

  it.each(['cita', 'apartado'].flatMap((tipo) => intervalos.map((intervalo) => ({ tipo, ...intervalo }))))
   ('T064 $tipo en otra sucursal: $caso', async ({ tipo, inicio, fin, separacion, valido }) => {
      await conAgendaHttp(async (f) => {
        const m = await prepararManual(f);
        const s = m.seleccion;
        const otra = f.negocios[0].sucursales[1];
        const inicioUtc = new Date(`2026-11-09T${inicio}:00Z`);
        const finUtc = new Date(`2026-11-09T${fin}:00Z`);
        const finProtegido = new Date(finUtc.getTime() + separacion * 60000);
        // La ocupación pertenece a otra sede y otro servicio; su zona difiere y solo UTC decide el choque.
        await f.db.query("UPDATE sucursales SET zona_horaria='America/Tijuana' WHERE id=?", [otra.id]);
        if (tipo === 'cita') {
          await f.db.query(`INSERT INTO citas
            (negocio_id,sucursal_id,personal_id,servicio_id,cliente_id,inicio_utc,fin_utc,zona_horaria_reserva,
             folio,estado,origen,separacion_minutos,fin_ocupacion_utc,telefono_contacto)
            VALUES(?,?,?,?,?,?,?,'America/Tijuana',?,'no_asistio','manual',?,?,'6149990000')`,
          [f.negocios[0].id, otra.id, s.personalId, f.negocios[0].servicioInactivoId, s.clienteId,
            inicioUtc, finUtc, `T064-${randomUUID().slice(0, 8)}`, separacion, finProtegido]);
        } else {
          await f.db.query(`INSERT INTO bloqueos_temporales
            (negocio_id,personal_id,sucursal_id,servicio_id,inicio_utc,fin_utc,expira_en,titular_hash,separacion_minutos,fin_ocupacion_utc,modo_concesion,version_reglas)
            VALUES(?,?,?,?,?,?,?,?,?,?,'ventana_libre',1)`, [f.negocios[0].id, s.personalId, otra.id, f.negocios[0].servicioInactivoId,
            inicioUtc, finUtc, new Date(f.reloj.ahora().getTime() + 300000), 'e'.repeat(64), separacion, finProtegido]);
        }
        const intentos = f.app.get(IntentosCitaManualService);
        const registro = f.app.get(RegistroCitaManualService);
        const clave = randomUUID();
        await intentos.preparar(m.identidad, clave, m.nueva);
        const antes = await filasManuales(f.db);
        const apartadosAntes = await f.db.query('SELECT * FROM bloqueos_temporales ORDER BY id');
        if (!valido) {
          await expect(registro.registrar(m.identidad, clave, m.nueva)).rejects.toMatchObject({ status: 409 });
          expect(await filasManuales(f.db)).toEqual(antes);
        } else {
          const r = await registro.registrar(m.identidad, clave, m.nueva);
          expect(r).toMatchObject({ inicioUtc: '2026-11-09T15:17:00.000Z', finUtc: '2026-11-09T15:47:00.000Z',
            finOcupacionUtc: '2026-11-09T15:57:00.000Z', separacionMinutos: 10, estado: 'confirmada' });
          expect(inicioUtc.getTime() >= new Date(r.finOcupacionUtc).getTime() || finProtegido.getTime() <= new Date(r.inicioUtc).getTime()).toBe(true);
          const despues = await filasManuales(f.db);
          expect(despues.citas).toHaveLength(antes.citas.length + 1);
          expect(despues.citas.filter((c) => c.id !== r.id)).toEqual(antes.citas);
          expect(despues.clientes).toHaveLength(antes.clientes.length + 1);
          expect(despues.eventos).toHaveLength(antes.eventos.length + 1);
          expect(despues.intentos.find((i) => i.clave === clave)).toMatchObject({ estado: 'registrado', citaId: r.id });
        }
        expect(await f.db.query('SELECT * FROM bloqueos_temporales ORDER BY id')).toEqual(apartadosAntes);
      });
    });

  it.each(['licencia', 'oferta', 'costo', 'duracion', 'separacion', 'horario'])
   ('T065 relee %s confirmado mientras el escritor real espera negocio', async (cambio) => {
      await conAgendaHttp(async (f) => {
        const m = await prepararManual(f);
        const s = m.seleccion;
        const registro = f.app.get(RegistroCitaManualService);
        const acceso = f.app.get(AccesoOperativoService);
        const holder = f.segunda.createQueryRunner();
        let pendiente: Promise<{ valor?: Awaited<ReturnType<typeof registro.registrar>>; error?: unknown }> | undefined;
        let conexion = 0;
        const resolver = acceso.resolverEnTransaccion.bind(acceso);
        const espia = jest.spyOn(acceso, 'resolverEnTransaccion').mockImplementation(async (...args) => {
          const ctx = await resolver(...args);
          conexion = Number((await ctx.manager.query('SELECT CONNECTION_ID() id'))[0].id);
          return ctx;
        });
        try {
          const clave = randomUUID();
          await f.app.get(IntentosCitaManualService).preparar(m.identidad, clave, m.nueva);
          const antes = await filasManuales(f.db);
          await holder.connect(); await holder.startTransaction('READ COMMITTED');
          await holder.query('SELECT id FROM negocios WHERE id=? FOR UPDATE', [f.negocios[0].id]);
          // El escritor completo conserva la transacción pendiente; no se sustituye guardar por un callback de prueba.
          pendiente = registro.registrar(m.identidad, clave, m.nueva).then((valor) => ({ valor }), (error: unknown) => ({ error }));
          await esperarBloqueoManual(f.segunda, () => conexion, 'negocios');
          if (cambio === 'licencia') await holder.query('UPDATE licencias SET vence_en=? WHERE negocio_id=?', [f.reloj.ahora(), f.negocios[0].id]);
          if (cambio === 'oferta') await holder.query('UPDATE personal_servicios_sucursales SET activo=0 WHERE negocio_id=? AND sucursal_id=?', [f.negocios[0].id, s.sucursalId]);
          if (cambio === 'costo') await holder.query('UPDATE servicios SET costo=195.35 WHERE id=?', [s.servicioId]);
          if (cambio === 'duracion') await holder.query('UPDATE servicios SET duracion_minutos=45 WHERE id=?', [s.servicioId]);
          if (cambio === 'separacion') await holder.query('UPDATE configuracion_agenda SET tiempo_entre_citas_minutos=20 WHERE negocio_id=?', [f.negocios[0].id]);
          if (cambio === 'horario') await holder.query('UPDATE horarios_personal SET fin_minutos=580 WHERE negocio_id=?', [f.negocios[0].id]);
          await holder.commitTransaction();
          const respuesta = await pendiente;
          const despues = await filasManuales(f.db);
          if (['licencia', 'oferta', 'horario'].includes(cambio)) {
            expect(respuesta).toMatchObject({ error: { status: cambio === 'licencia' ? 401 : 409 } });
            expect(despues).toEqual(antes);
          } else {
            expect(respuesta.error).toBeUndefined();
            const r = respuesta.valor!;
            expect(r).toMatchObject({ estado: 'confirmada', costoAceptado: cambio === 'costo' ? '195.35' : '100.00',
              separacionMinutos: cambio === 'separacion' ? 20 : 10,
              finUtc: cambio === 'duracion' ? '2026-11-09T16:02:00.000Z' : '2026-11-09T15:47:00.000Z',
              finOcupacionUtc: cambio === 'duracion' ? '2026-11-09T16:12:00.000Z' : cambio === 'separacion' ? '2026-11-09T16:07:00.000Z' : '2026-11-09T15:57:00.000Z' });
            expect(despues.citas).toHaveLength(antes.citas.length + 1);
            expect(despues.clientes).toHaveLength(antes.clientes.length + 1);
            expect(despues.eventos).toHaveLength(antes.eventos.length + 1);
            expect(despues.auditoria).toHaveLength(antes.auditoria.length + 1);
            expect(despues.citas.filter((c) => c.id !== r.id)).toEqual(antes.citas);
            expect(despues.intentos.find((i) => i.clave === clave)).toMatchObject({ estado: 'registrado', citaId: r.id });
            expect(await f.db.getRepository(Cita).findOneByOrFail({ id: r.id })).toMatchObject({ costoAceptado: r.costoAceptado,
              finUtc: new Date(r.finUtc), finOcupacionUtc: new Date(r.finOcupacionUtc), separacionMinutos: r.separacionMinutos });
          }
        } finally {
          if (holder.isTransactionActive) await holder.rollbackTransaction();
          if (pendiente) await pendiente;
          await holder.release(); espia.mockRestore();
        }
      });
    });
});
