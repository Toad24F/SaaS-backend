import { DataSource } from 'typeorm';
import { Rol } from '../src/auth/enums/rol.enum';
import { AutorizacionService } from '../src/auth/services/autorizacion.service';
import { PoliticaAccesoLicenciaService } from '../src/licencias/services/politica-acceso-licencia.service';
import { AccesoOperativoService } from '../src/citas/acceso-operativo.service';
import { ConsultaAgendaService } from '../src/citas/consulta-agenda.service';
import { Cita } from '../src/disponibilidad/entities/cita.entity';
import { conBaseOperativa } from './support/operacion-fase-5';
import { crearAccesoOperativo } from './support/acceso-operativo';
import { crearCausasOperativas } from './support/causas-operativas';

// La semilla nace el 1 de enero UTC: en México varias citas pertenecen al 31 de diciembre.
const rango = { desde: '2025-12-31', hasta: '2026-01-30' };

// Todas las variaciones se escriben exclusivamente en una instalación efímera migrada.
async function escenario(db: DataSource) {
  const f = await crearAccesoOperativo(db);
  const acceso = new AccesoOperativoService(db, new AutorizacionService(), new PoliticaAccesoLicenciaService(), f.reloj);
  const agenda = new ConsultaAgendaService(acceso, crearCausasOperativas(db, f.reloj));
  const actor = (rol: Rol, negocio = 0) => {
    const u = f.actores.find((a) => a.rol === rol && a.negocioId === f.negocios[negocio].id)!;
    return { sub: u.id, sesionId: u.sesionId };
  };
  return { ...f, agenda, acceso, actor };
}

describe('M4-T026–T030: agenda persistida y acotada', () => {
  it('T026 conserva los cinco estados, ambos orígenes y aísla dos negocios', async () => {
    await conBaseOperativa(async (db) => {
      const f = await escenario(db);
      for (const negocio of [0, 1]) {
        for (const rol of [Rol.ADMIN_NEGOCIO, Rol.RECEPCIONISTA]) {
          const pagina = await f.agenda.listar(f.actor(rol, negocio), rango);
          expect(pagina.citas).toHaveLength(negocio === 0 ? 6 : 5);
          expect(new Set(pagina.citas.map((c) => c.estado)).size).toBe(5);
          if (negocio === 0) expect(new Set(pagina.citas.map((c) => c.origen)).size).toBe(2);
          expect(pagina.citas.every((c) => c.negocioId === f.negocios[negocio].id)).toBe(true);
          expect(pagina.citas.every((c) => c.version === 1)).toBe(true);
          expect(pagina).not.toHaveProperty('hayMas');
        }
      }
      const u = f.actores.find((a) => a.rol === Rol.SUPERADMIN)!;
      await expect(f.agenda.listar({ sub: u.id, sesionId: u.sesionId }, rango)).rejects.toMatchObject({ status: 403 });
    });
  });

  it('T027 limita Profesional, contacto y notas, y deniega filtros de otros perfiles', async () => {
    await conBaseOperativa(async (db) => {
      const f = await escenario(db);
      const actor = f.actor(Rol.PROFESIONAL);
      const resultado = await f.agenda.listar(actor, { ...rango, personalId: String(actor.sub) });
      expect(resultado.citas).toHaveLength(5);
      expect(resultado.citas.every((c) => c.personalId === actor.sub && c.nombreContacto === 'Paciente propio')).toBe(true);
      expect(resultado.citas[0]).not.toHaveProperty('motivoConsulta');
      const detalle = await f.agenda.detalle(actor, String(resultado.citas[0].id), {});
      expect(detalle).toMatchObject({ motivoConsulta: 'Nota propia', telefonoContacto: '6141234567' });
      expect(JSON.stringify(resultado)).not.toContain('Nota ajena');
      for (const personalId of [f.negocios[0].profesionales[1], f.negocios[1].profesionales[0], 999999]) {
        await expect(f.agenda.listar(actor, { ...rango, personalId: String(personalId) })).rejects.toMatchObject({ status: 404 });
      }
    });
  });

  it('T028 filtra por fecha de inicio local, con zonas distintas en el mismo UTC y extremos exactos', async () => {
    await conBaseOperativa(async (db) => {
      const f = await escenario(db);
      const filas = await db.getRepository(Cita).findBy({ negocioId: f.negocios[0].id });
      // Un instante cae en enero en Phoenix y en febrero en Ciudad de México.
      for (const [indice, zona] of ['America/Phoenix', 'America/Mexico_City'].entries()) {
        await db.getRepository(Cita).update(filas[indice].id, { inicioUtc: new Date('2026-02-01T06:30:00Z'),
          finUtc: new Date('2026-02-01T07:00:00Z'), finOcupacionUtc: null, zonaHorariaReserva: zona });
      }
      const enero = await f.agenda.listar(f.actor(Rol.ADMIN_NEGOCIO), { desde: '2026-01-31', hasta: '2026-01-31' });
      expect(enero.citas.map((c) => c.id)).toEqual([filas[0].id]);
      expect(enero.citas[0]).toMatchObject({ fechaLocal: '2026-01-31', horaInicio: '23:30:00',
        fechaFinLocal: '2026-02-01', nombreServicio: null });
      await db.query("UPDATE sucursales SET zona_horaria='Asia/Tokyo' WHERE negocio_id=?", [f.negocios[0].id]);
      const febrero = await f.agenda.listar(f.actor(Rol.ADMIN_NEGOCIO), { desde: '2026-02-01', hasta: '2026-02-01' });
      expect(febrero.citas.map((c) => c.id)).toEqual([filas[1].id]);
      expect(febrero.citas[0]).toMatchObject({ fechaLocal: '2026-02-01', horaInicio: '00:30:00' });
      // El límite inicial se incluye y la medianoche del siguiente día se excluye.
      await db.getRepository(Cita).update(filas[0].id, { inicioUtc: new Date('2026-02-01T07:00:00Z'), finUtc: new Date('2026-02-01T07:30:00Z') });
      expect((await f.agenda.listar(f.actor(Rol.ADMIN_NEGOCIO), { desde: '2026-01-31', hasta: '2026-01-31' })).citas).toEqual([]);
    });
  });

  it('T029 combina sucursal, personal y estado sin exigir oferta vigente y no distingue IDs ajenos/ausentes', async () => {
    await conBaseOperativa(async (db) => {
      const f = await escenario(db);
      const a = f.negocios[0];
      await db.query('UPDATE sucursales SET activo=0 WHERE negocio_id=?', [a.id]);
      const base = await db.getRepository(Cita).findBy({ negocioId: a.id });
      for (const sucursalId of [undefined, ...a.sucursales.map((s) => String(s.id))]) {
        for (const personalId of [undefined, ...a.profesionales.map(String)]) {
          for (const estado of [undefined, 'pendiente', 'confirmada', 'completada', 'cancelada', 'no_asistio']) {
            const entrada = { ...rango, ...(sucursalId ? { sucursalId } : {}), ...(personalId ? { personalId } : {}), ...(estado ? { estado } : {}) };
            const actual = await f.agenda.listar(f.actor(Rol.RECEPCIONISTA), entrada);
            const esperadas = base.filter((c) => (!sucursalId || c.sucursalId === Number(sucursalId)) &&
              (!personalId || c.personalId === Number(personalId)) && (!estado || c.estado === estado));
            expect(actual.citas.map((c) => c.id).sort()).toEqual(esperadas.map((c) => c.id).sort());
          }
        }
      }
      for (const filtro of [{ sucursalId: String(f.negocios[1].sucursales[0].id) }, { sucursalId: '999999' },
        { personalId: String(f.negocios[1].profesionales[0]) }, { personalId: '999999' }]) {
        await expect(f.agenda.listar(f.actor(Rol.ADMIN_NEGOCIO), { ...rango, ...filtro })).rejects.toMatchObject({ status: 404, message: 'Recurso no disponible.' });
      }
    });
  });

  it('T028 no confunde fechas cuando el reloj retrocede al día anterior', async () => {
    await conBaseOperativa(async (db) => {
      const f = await escenario(db);
      const filas = await db.getRepository(Cita).findBy({ negocioId: f.negocios[0].id });
      // Casey volvió de 2010-03-05 02:00 a 2010-03-04 23:00; el día 5 tiene dos intervalos.
      for (const [i, hora] of ['13', '15', '16'].entries()) {
        await db.getRepository(Cita).update(filas[i].id, { zonaHorariaReserva: 'Antarctica/Casey',
          inicioUtc: new Date(`2010-03-04T${hora}:10:00Z`), finUtc: new Date(`2010-03-04T${hora}:40:00Z`), finOcupacionUtc: null });
      }
      const actor = f.actor(Rol.ADMIN_NEGOCIO);
      const dia5 = await f.agenda.listar(actor, { desde: '2010-03-05', hasta: '2010-03-05' });
      const dia4 = await f.agenda.listar(actor, { desde: '2010-03-04', hasta: '2010-03-04' });
      expect(dia5.citas.map((c) => c.id)).toEqual([filas[0].id, filas[2].id]);
      expect(dia4.citas.map((c) => c.id)).toEqual([filas[1].id]);
    });
  });

  it('T030 busca el contacto histórico literalmente y devuelve el periodo con orden estable por inicio e ID', async () => {
    await conBaseOperativa(async (db) => {
      const f = await escenario(db);
      const a = f.negocios[0];
      const ids = (await db.getRepository(Cita).findBy({ negocioId: a.id })).map((c) => c.id).sort((x, y) => x - y);
      await db.getRepository(Cita).update({ negocioId: a.id }, { nombreContacto: 'Ana %_!\\',
        inicioUtc: new Date('2026-01-15T12:00:00Z'), finUtc: new Date('2026-01-15T12:30:00Z'), finOcupacionUtc: null });
      await db.query("UPDATE clientes SET nombre_completo='Ficha corregida' WHERE negocio_id=?", [a.id]);
      const r = await f.agenda.listar(f.actor(Rol.ADMIN_NEGOCIO), { ...rango, busqueda: '%_!\\' });
      const recibidas = r.citas.map((c) => c.id);
      expect(r).not.toHaveProperty('hayMas');
      expect(recibidas).toEqual(ids);
      for (const busqueda of ['Ficha corregida', "' OR 1=1 --", 'Paciente ajeno']) {
        expect((await f.agenda.listar(f.actor(Rol.ADMIN_NEGOCIO), { ...rango, busqueda })).citas).toEqual([]);
      }
      expect((await f.agenda.listar(f.actor(Rol.PROFESIONAL), { ...rango, busqueda: 'Ana' })).citas).toHaveLength(5);
    });
  });

  it('T030 devuelve más de cien citas reales sin ocultarlas tras páginas', async () => {
    await conBaseOperativa(async (db) => {
      const f = await escenario(db);
      const a = f.negocios[0];
      // Las filas adicionales comparten inicio para comprobar el desempate por ID.
      for (let i = 0; i < 105; i++) {
        await db.query(`INSERT INTO citas(negocio_id,sucursal_id,personal_id,servicio_id,cliente_id,
          inicio_utc,fin_utc,zona_horaria_reserva,folio,nombre_contacto)
          SELECT negocio_id,sucursal_id,personal_id,servicio_id,cliente_id,
          '2026-01-15 12:00:00','2026-01-15 12:30:00',zona_horaria_reserva,?,'Paciente paginado'
          FROM citas WHERE id=?`, [`PAG-${i}`, a.ocupaciones[0]]);
      }
      const actor = f.actor(Rol.RECEPCIONISTA);
      const completa = await f.agenda.listar(actor, rango);
      expect(completa.citas).toHaveLength(111);
      expect(new Set(completa.citas.map((c) => c.id)).size).toBe(111);
      expect(completa).not.toHaveProperty('hayMas');
    });
  });

  it('T026 conserva fotografía de lectura y vuelve a leer cambios confirmados en la siguiente operación', async () => {
    await conBaseOperativa(async (db, segunda) => {
      const f = await escenario(db);
      const actor = f.actor(Rol.ADMIN_NEGOCIO);
      const id = f.negocios[0].ocupaciones[0];
      // Dos conexiones reales: autorización establece la fotografía antes de la actualización ajena.
      await f.acceso.ejecutar(actor, 'consultar_citas' as import('../src/auth/services/autorizacion.service').Permiso, async (ctx) => {
        await segunda.getRepository(Cita).update(id, { nombreContacto: 'Cambio confirmado' });
        expect((await ctx.manager.getRepository(Cita).findOneByOrFail({ id })).nombreContacto).toBe('Paciente propio');
      }, 'REPEATABLE READ');
      const despues = await f.agenda.listar(actor, { ...rango, busqueda: 'Cambio confirmado' });
      expect(despues.citas.map((c) => c.id)).toEqual([id]);
    });
  });
});
