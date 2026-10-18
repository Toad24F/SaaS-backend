import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { RELOJ } from '../src/comun/reloj';
import { ServiciosService } from '../src/servicios/servicios.service';
import { ProfesionalesService } from '../src/profesionales/profesionales.service';
import { HorariosService } from '../src/horarios/horarios.service';
import { BloqueosService } from '../src/bloqueos/bloqueos.service';
import { conBaseMigrada } from './support/mariadb';
import { crearEscenarioPortal } from './support/escenario-portal';
import { RelojPrueba } from './support/reloj';

const AHORA = new Date('2026-10-20T12:00:00Z');

/** Dos conexiones comprueban que el negocio precede al recurso específico. */
async function comprobarBarrera(db: DataSource, negocioId: number, tabla: string,
  id: number, mutar: () => Promise<unknown>) {
  let soltar!: () => void;
  let avisar!: () => void;
  const retenida = new Promise<void>((resolver) => { soltar = resolver; });
  const lista = new Promise<void>((resolver) => { avisar = resolver; });
  const barrera = db.transaction('READ COMMITTED', async (manager) => {
    await manager.query('SELECT id FROM negocios WHERE id=? FOR UPDATE', [negocioId]);
    avisar();
    await retenida;
  });
  await lista;
  let termino = false;
  const operacion = mutar().then(() => { termino = true; });
  let error: unknown;
  try {
    await new Promise((resolver) => setTimeout(resolver, 80));
    expect(termino).toBe(false);
    await db.transaction('READ COMMITTED', async (manager) => {
      const filas = await manager.query(`SELECT id FROM ${tabla} WHERE id=? FOR UPDATE NOWAIT`, [id]);
      expect(filas).toHaveLength(1);
    });
  } catch (fallo) { error = fallo; }
  finally { soltar(); await barrera; }
  const resultado = await Promise.allSettled([operacion]);
  if (error) throw error;
  if (resultado[0].status === 'rejected') throw resultado[0].reason;
}

describe('M3-T052–T057: mutaciones bajo protocolo común', () => {
  it('espera la barrera antes de servicio, perfil, horario y bloqueo', async () => {
    await conBaseMigrada(async (db) => {
      const reloj = new RelojPrueba(AHORA);
      const { negocios: [negocio] } = await crearEscenarioPortal(db, reloj);
      const admin = await db.query(`INSERT INTO usuarios
        (negocio_id,nombre,email,password_hash,rol,activo,activado_en)
        VALUES (?,'Admin','admin-t052@example.test','hash','admin_negocio',1,?)`, [negocio.id, AHORA]);
      const servicioId = Number((await db.query('SELECT id FROM servicios WHERE negocio_id=? LIMIT 1',
        [negocio.id]))[0].id);
      const perfilId = negocio.profesionales[0];
      const sucursalId = negocio.sucursales[0].id;
      const modulo = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(DataSource).useValue(db).overrideProvider(RELOJ).useValue(reloj).compile();
      const app = modulo.createNestApplication();
      try {
        await app.init();
        const actorId = Number(admin.insertId);
        await comprobarBarrera(db, negocio.id, 'servicios', servicioId,
          () => app.get(ServiciosService).editar(actorId, servicioId, { costo: '99.00' }));
        await comprobarBarrera(db, negocio.id, 'servicios', servicioId,
          () => app.get(ServiciosService).cambiarEstado(actorId, servicioId, true));
        await comprobarBarrera(db, negocio.id, 'personal', perfilId,
          () => app.get(ProfesionalesService).asignarSucursales(actorId, perfilId,
            { sucursalIds: [sucursalId] }));
        await comprobarBarrera(db, negocio.id, 'personal', perfilId,
          () => app.get(ProfesionalesService).seleccionarServicios(actorId, perfilId,
            { servicioIds: [servicioId] }));
        await comprobarBarrera(db, negocio.id, 'personal', perfilId,
          () => app.get(ProfesionalesService).cambiarAtencionSucursal(actorId, perfilId,
            sucursalId, false, '2026-10-20'));
        await comprobarBarrera(db, negocio.id, 'personal', perfilId,
          () => app.get(ProfesionalesService).seleccionarServiciosSucursal(actorId, perfilId,
            sucursalId, { servicioIds: [servicioId] }));
        await comprobarBarrera(db, negocio.id, 'personal', perfilId,
          () => app.get(HorariosService).guardarSemana(negocio.id, perfilId, [], '2026-10-20'));
        await comprobarBarrera(db, negocio.id, 'personal', perfilId,
          () => app.get(HorariosService).guardarExcepcion(negocio.id, perfilId,
            '2026-10-22', sucursalId, [], '2026-10-20'));
        await comprobarBarrera(db, negocio.id, 'personal', perfilId,
          () => app.get(HorariosService).retirarExcepcion(negocio.id, perfilId,
            '2026-10-22', sucursalId, '2026-10-20'));
        const bloqueo = await app.get(BloqueosService).crear(actorId, {
          personalId: perfilId, sucursalId, tipo: 'emergencia', motivo: 'Prueba',
          fechaInicio: '2026-10-21', fechaFin: '2026-10-21',
          inicioMinutos: null, finMinutos: null,
        });
        await comprobarBarrera(db, negocio.id, 'bloqueos_horario', bloqueo.id,
          () => app.get(BloqueosService).editar(actorId, bloqueo.id,
            { motivo: 'Motivo actualizado' }));
        await comprobarBarrera(db, negocio.id, 'bloqueos_horario', bloqueo.id,
          () => app.get(BloqueosService).eliminar(actorId, bloqueo.id));
        await comprobarBarrera(db, negocio.id, 'personal', perfilId,
          () => app.get(BloqueosService).crear(actorId, {
            personalId: null, sucursalId: null, tipo: 'dia_festivo', motivo: 'Colectivo',
            fechaInicio: '2026-10-23', fechaFin: '2026-10-23',
            inicioMinutos: null, finMinutos: null,
          }));
      } finally { await app.close(); }
    });
  }, 120000);
});
