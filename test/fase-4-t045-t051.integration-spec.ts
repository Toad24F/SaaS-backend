import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { RELOJ } from '../src/comun/reloj';
import { CoordinacionReservaPublicaService } from '../src/reservas-publicas/coordinacion-reserva-publica.service';
import { ProfesionalesService } from '../src/profesionales/profesionales.service';
import { LicenciasService } from '../src/licencias/licencias.service';
import { ConfiguracionAgendaService } from '../src/disponibilidad/configuracion-agenda.service';
import { SucursalesService } from '../src/sucursales/sucursales.service';
import { conBaseMigrada } from './support/mariadb';
import { crearEscenarioPortal } from './support/escenario-portal';
import { RelojPrueba } from './support/reloj';

const AHORA = new Date('2026-10-20T12:00:00Z');

/** Espera a que la mutación anuncie su inicio sin depender de un reloj real. */
async function esperarBarrera(db: DataSource, negocioId: number,
  iniciar: () => Promise<unknown>, comprobarEspera?: () => Promise<void>) {
  let soltar!: () => void;
  let entro!: () => void;
  const iniciada = new Promise<void>((resolver) => { entro = resolver; });
  const retenida = new Promise<void>((resolver) => { soltar = resolver; });
  const barrera = db.transaction('READ COMMITTED', async (manager) => {
    await manager.query('SELECT id FROM negocios WHERE id=? FOR UPDATE', [negocioId]);
    entro();
    await retenida;
  });
  await iniciada;
  let termino = false;
  const mutacion = iniciar().then(() => { termino = true; });
  let fallo: unknown;
  try {
    await new Promise((resolver) => setTimeout(resolver, 80));
    expect(termino).toBe(false);
    if (comprobarEspera) await comprobarEspera();
  } catch (error) { fallo = error; }
  finally { soltar(); await barrera; }
  const resultado = await Promise.allSettled([mutacion]);
  if (fallo) throw fallo;
  if (resultado[0].status === 'rejected') throw resultado[0].reason;
}

describe('M3-T045–T051: protocolo común de escritura', () => {
  it('reintenta desde rollback, converge por sesión/clave y toma recursos del mismo negocio', async () => {
    await conBaseMigrada(async (db) => {
      const reloj = new RelojPrueba(AHORA);
      const { negocios: [a, b] } = await crearEscenarioPortal(db, reloj);
      for (const n of [a, b]) await db.query(`INSERT INTO licencias
        (negocio_id,creado_en,habilitada_en,vence_en)
        VALUES (?,'2026-01-01','2026-01-01','2027-01-01')`, [n.id]);
      const servicio = new CoordinacionReservaPublicaService(db, reloj);
      const hash = 'a'.repeat(64);
      const sesion = await db.query(`INSERT INTO sesiones_reserva_publica
        (negocio_id,titular_hash,generacion) VALUES (?,?,0)`, [a.id, hash]);
      const sesionId = Number(sesion.insertId);
      let vueltas = 0;
      const id = await servicio.transaccion('operacion-fija', async (manager) => {
        vueltas += 1;
        const bloqueada = await servicio.bloquearSesion(manager, a.id, hash);
        expect(bloqueada.id).toBe(sesionId);
        const operacion = await servicio.bloquearOCrearOperacion(manager, bloqueada,
          'operacion-fija', { generacion: '1', seleccionHash: 'b'.repeat(64),
            personalId: a.profesionales[0], sucursalId: a.sucursales[0].id,
            servicioId: Number((await manager.query('SELECT id FROM servicios WHERE negocio_id=? AND activo=1', [a.id]))[0].id),
            fechaLocal: '2026-10-20', horaInicio: '10:00' });
        if (vueltas === 1) throw { code: 'ER_LOCK_DEADLOCK' };
        return operacion.id;
      });
      expect(vueltas).toBe(2);
      expect((await db.query('SELECT id FROM operaciones_apartado WHERE negocio_id=?', [a.id])))
        .toHaveLength(1);
      const repetida = await servicio.transaccion('operacion-fija', async (manager) => {
        const bloqueada = await servicio.bloquearSesion(manager, a.id, hash);
        return servicio.bloquearOCrearOperacion(manager, bloqueada, 'operacion-fija',
          { generacion: '1', seleccionHash: 'b'.repeat(64),
            personalId: a.profesionales[0], sucursalId: a.sucursales[0].id,
            servicioId: Number((await manager.query('SELECT id FROM servicios WHERE negocio_id=? AND activo=1', [a.id]))[0].id),
            fechaLocal: '2026-10-20', horaInicio: '10:00' });
      });
      expect(repetida.id).toBe(id);
      const intentos = await Promise.all([1, 2].map(() =>
        servicio.transaccion('intento-fijo', async (manager) => {
          const bloqueada = await servicio.bloquearSesion(manager, a.id, hash);
          return servicio.bloquearOCrearIntento(manager, bloqueada,
            'intento-fijo', a.ocupaciones[1]);
        })));
      expect(intentos[0].id).toBe(intentos[1].id);
      expect((await db.query('SELECT id FROM intentos_reserva_publica WHERE negocio_id=?', [a.id])))
        .toHaveLength(1);
      await expect(servicio.transaccion('ajena', async (manager) =>
        servicio.bloquearRecursos(manager, { negocioId: a.id,
          usuarioIds: [b.profesionales[0]], personalIds: [a.profesionales[0]],
          sucursalIds: [a.sucursales[0].id], servicioIds: [] })))
        .rejects.toMatchObject({ status: 404 });
      await servicio.transaccion('orden', async (manager) => {
        const consultas = jest.spyOn(manager, 'query');
        const servicioId = Number((await manager.query('SELECT id FROM servicios WHERE negocio_id=? AND activo=1',
          [a.id]))[0].id);
        consultas.mockClear();
        const instante = await servicio.bloquearRecursos(manager, {
          negocioId: a.id, usuarioIds: [...a.profesionales].reverse(),
          sucursalIds: [a.sucursales[0].id], servicioIds: [servicioId],
          personalIds: [...a.profesionales].reverse(), citaIds: [a.ocupaciones[0]],
          apartadoIds: [a.ocupaciones[1]],
        });
        expect(instante).toEqual(AHORA);
        const orden = consultas.mock.calls.map(([sql]) => String(sql).match(/FROM (\w+)/)?.[1]);
        expect(orden).toEqual(['usuarios', 'usuarios', 'negocios', 'licencias',
          'sucursales', 'servicios', 'personal', 'personal', 'citas', 'bloqueos_temporales']);
        expect(consultas.mock.calls[0][1]).toEqual([a.id, a.profesionales[0]]);
        consultas.mockRestore();
      });
    });
  }, 60000);

  it('coordina licencia, configuración, sucursal y estado de Profesional por negocio', async () => {
    await conBaseMigrada(async (db) => {
      const reloj = new RelojPrueba(AHORA);
      const { negocios: [a, b] } = await crearEscenarioPortal(db, reloj);
      const licencia = await db.query(`INSERT INTO licencias
        (negocio_id,creado_en,habilitada_en,vence_en)
        VALUES (?,'2026-01-01','2026-01-01','2027-01-01')`, [a.id]);
      const superadmin = await db.query(`INSERT INTO usuarios
        (nombre,email,password_hash,rol,activo,activado_en)
        VALUES ('Super','super-barrera@example.test','hash','superadmin',1,?)`, [AHORA]);
      const admin = await db.query(`INSERT INTO usuarios
        (negocio_id,nombre,email,password_hash,rol,activo,activado_en)
        VALUES (?,'Admin','admin-barrera@example.test','hash','admin_negocio',1,?)`, [a.id, AHORA]);
      const modulo = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(DataSource).useValue(db).overrideProvider(RELOJ).useValue(reloj).compile();
      const app = modulo.createNestApplication();
      try {
        await app.init();
        await expect(app.get(SucursalesService).desactivar(
          Number(admin.insertId), b.sucursales[0].id))
          .rejects.toMatchObject({ status: 404 });
        await expect(app.get(ProfesionalesService).cambiarEstado(
          Number(admin.insertId), b.profesionales[0], false, AHORA))
          .rejects.toMatchObject({ status: 404 });
        await esperarBarrera(db, a.id, () => app.get(LicenciasService).suspender(
          Number(superadmin.insertId), Number(licencia.insertId), AHORA), async () => {
          // Mientras la transición espera al negocio, no debe poseer la licencia.
          await db.transaction('READ COMMITTED', async (manager) => {
            const filas = await manager.query('SELECT id FROM licencias WHERE id=? FOR UPDATE NOWAIT',
              [Number(licencia.insertId)]);
            expect(filas).toHaveLength(1);
          });
        });
        await esperarBarrera(db, a.id, () => app.get(LicenciasService).reactivar(
          Number(superadmin.insertId), Number(licencia.insertId), AHORA));
        await esperarBarrera(db, a.id, () => app.get(LicenciasService).renovar(
          Number(superadmin.insertId), Number(licencia.insertId), AHORA));
        await esperarBarrera(db, a.id, () => app.get(LicenciasService).materializarSuspension(
          Number(superadmin.insertId), Number(licencia.insertId), AHORA));
        await esperarBarrera(db, a.id, () => app.get(ConfiguracionAgendaService).guardar(
          Number(admin.insertId), { modo: 'agenda_compacta', intervaloMinutos: 15,
            anticipacionMinutos: 15, diasFuturos: 60 }));
        await esperarBarrera(db, a.id, () => app.get(SucursalesService).editar(
          Number(admin.insertId), a.sucursales[0].id,
          { zonaHoraria: 'America/Mexico_City' }, '2026-10-20'));
        await esperarBarrera(db, a.id, () => app.get(SucursalesService).desactivar(
          Number(admin.insertId), a.sucursales[0].id));
        // La cuenta destino se bloquea antes del perfil: durante la espera,
        // otro escritor todavía puede tomar el perfil sin invertir el orden.
        let soltarUsuario!: () => void;
        let avisarUsuario!: () => void;
        const usuarioRetenido = new Promise<void>((resolver) => { soltarUsuario = resolver; });
        const usuarioBloqueado = new Promise<void>((resolver) => { avisarUsuario = resolver; });
        const tenedor = db.transaction('READ COMMITTED', async (manager) => {
          await manager.query('SELECT id FROM usuarios WHERE id=? FOR UPDATE', [a.profesionales[0]]);
          avisarUsuario();
          await usuarioRetenido;
        });
        await usuarioBloqueado;
        const cambio = app.get(ProfesionalesService).cambiarEstado(
          Number(admin.insertId), a.profesionales[0], false, AHORA);
        try {
          await new Promise((resolver) => setTimeout(resolver, 80));
          await db.transaction('READ COMMITTED', async (manager) => {
            const filas = await manager.query('SELECT id FROM personal WHERE id=? FOR UPDATE NOWAIT',
              [a.profesionales[0]]);
            expect(filas).toHaveLength(1);
          });
        } finally { soltarUsuario(); await tenedor; }
        await cambio;
      } finally { await app.close(); }
    });
  }, 120000);
});
