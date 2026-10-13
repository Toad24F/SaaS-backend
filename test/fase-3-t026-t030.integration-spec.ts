import { randomUUID } from 'node:crypto';
import type { DataSource, EntityManager } from 'typeorm';
import { conBaseMigrada } from './support/mariadb';
import { crearDatosOcupaciones } from './support/ocupaciones-fase-3';
import { RelojPrueba } from './support/reloj';
import { AutorizacionService } from '../src/auth/services/autorizacion.service';
import { PoliticaAccesoLicenciaService } from '../src/licencias/services/politica-acceso-licencia.service';
import { ContextoDisponibilidadService } from '../src/disponibilidad/contexto-disponibilidad.service';
import { OfertaEfectivaService } from '../src/disponibilidad/oferta-efectiva.service';

const ahora = new Date('2026-10-20T15:00:00.000Z');
const reloj = new RelojPrueba(ahora);
type TokenPrueba = { sub: number; sesionId: string; rol: string; negocioId: number | null };

function servicios() {
  const permisos = new AutorizacionService();
  return { contexto: new ContextoDisponibilidadService(permisos,
    new PoliticaAccesoLicenciaService()), oferta: new OfertaEfectivaService(permisos) };
}

async function cuenta(db: DataSource, negocioId: number | null, rol: string, sufijo: string) {
  const alta = await db.query(`INSERT INTO usuarios
    (negocio_id,nombre,email,password_hash,rol,activo,activado_en)
    VALUES (?,'Actor',?,'hash',?,1,CURRENT_TIMESTAMP(6))`,
  [negocioId, `oferta-${sufijo}@example.test`, rol]);
  return Number(alta.insertId);
}

async function sesion(db: DataSource, sub: number, rol = 'superadmin', negocioId: number | null = null) {
  const sesionId = randomUUID();
  await db.query(`INSERT INTO sesiones (id,usuario_id,creada_en,expira_en)
    VALUES (?,?,'2026-10-20 12:00:00.000000','2026-10-21 00:00:00.000000')`,
  [sesionId, sub]);
  // Rol y negocio del token son intencionalmente falsos: prevalece la base actual.
  return { sub, sesionId, rol, negocioId };
}

async function preparar(db: DataSource) {
  const [a, b] = (await crearDatosOcupaciones(db, reloj)).negocios;
  const administradores: TokenPrueba[] = [];
  const recepciones: TokenPrueba[] = [];
  for (const negocio of [a, b]) {
    await db.query('UPDATE negocios SET activado_en=creado_en WHERE id=?', [negocio.id]);
    await db.query(`INSERT INTO licencias (negocio_id,creado_en,habilitada_en,vence_en)
      VALUES (?,'2026-01-01','2026-01-01','2027-01-01')`, [negocio.id]);
    administradores.push(await sesion(db, await cuenta(db, negocio.id,
      'admin_negocio', `admin-${negocio.id}`), 'profesional', b.id));
    recepciones.push(await sesion(db, await cuenta(db, negocio.id,
      'recepcionista', `recepcion-${negocio.id}`), 'admin_negocio', b.id));
  }
  const profesionalA = await sesion(db, a.personalId, 'admin_negocio', b.id);
  const profesionalB = await sesion(db, b.personalId, 'admin_negocio', a.id);
  const superadmin = await sesion(db, await cuenta(db, null, 'superadmin', 'super'));
  return { a, b, administradores, recepciones, profesionalA, profesionalB, superadmin };
}

async function leer(manager: EntityManager, token: TokenPrueba, personalId: number,
  sucursalId: number, servicioId: number, modalidad: 'publica' | 'manual' = 'publica') {
  const { contexto, oferta } = servicios();
  const autorizado = await contexto.resolver(manager, token, personalId, reloj.ahora());
  return oferta.consultar(autorizado, sucursalId, servicioId, modalidad);
}

describe('M2-T027–T030: contexto actual y oferta efectiva', () => {
  it('distingue 401/403/404 y usa sesión, cuenta, licencia y rol actuales', async () => {
    await conBaseMigrada(async (db) => {
      const f = await preparar(db);
      const consultar = (token: TokenPrueba, perfil = f.a.personalId) =>
        db.transaction('REPEATABLE READ', (manager) => leer(manager, token, perfil,
          f.a.sucursales[0], f.a.servicios[0]));
      await expect(consultar(f.administradores[0])).resolves.toMatchObject({ ofrecido: true });
      await expect(consultar(f.recepciones[0])).resolves.toMatchObject({ ofrecido: true });
      await expect(consultar(f.profesionalA)).resolves.toMatchObject({ ofrecido: true });
      await expect(consultar(f.superadmin)).rejects.toMatchObject({ status: 403 });
      await expect(consultar(f.profesionalB)).rejects.toMatchObject({ status: 404 });
      await expect(consultar(f.recepciones[1])).rejects.toMatchObject({ status: 404 });
      await expect(consultar(f.profesionalA, 999999)).rejects.toMatchObject({ status: 404 });
      const segundoPerfil = await cuenta(db, f.a.id, 'profesional', 'segundo-perfil');
      await db.query('INSERT INTO personal (id,negocio_id) VALUES (?,?)', [segundoPerfil, f.a.id]);
      await expect(consultar(f.profesionalA, segundoPerfil))
        .rejects.toMatchObject({ status: 403 });
      await expect(consultar({ ...f.profesionalA, sesionId: randomUUID() }))
        .rejects.toMatchObject({ status: 401 });
      await db.query('UPDATE usuarios SET activo=0 WHERE id=?', [f.recepciones[0].sub]);
      await expect(consultar(f.recepciones[0])).rejects.toMatchObject({ status: 401 });
      await db.query('UPDATE usuarios SET activo=1 WHERE id=?', [f.recepciones[0].sub]);
      await db.query('UPDATE sesiones SET revocada_en=creada_en WHERE id=?',
        [f.profesionalA.sesionId]);
      await expect(consultar(f.profesionalA)).rejects.toMatchObject({ status: 401 });
      await db.query(`UPDATE licencias SET suspension_solicitada_en=?,
        bloqueo_programado_en=? WHERE negocio_id=?`,
      [new Date('2026-10-18T15:00:00Z'), ahora, f.a.id]);
      await db.transaction('REPEATABLE READ', async (manager) => {
        const { contexto } = servicios();
        await expect(contexto.resolver(manager, f.administradores[0], f.a.personalId,
          new Date(ahora.getTime() - 1))).resolves.toMatchObject({ negocioId: f.a.id });
      });
      await expect(consultar(f.administradores[0])).rejects.toMatchObject({ status: 401 });
      await db.query(`UPDATE licencias SET suspension_solicitada_en=NULL,
        bloqueo_programado_en=NULL WHERE negocio_id=?`, [f.a.id]);
      await db.query('UPDATE licencias SET vence_en=? WHERE negocio_id=?',
        [new Date('2026-10-20T15:00:00Z'), f.a.id]);
      await expect(consultar(f.administradores[0])).rejects.toMatchObject({ status: 401 });
    });
  });

  it('conserva seis estados fuente y excluye ambas modalidades sin borrar preferencias', async () => {
    await conBaseMigrada(async (db) => {
      const f = await preparar(db);
      const obtener = (modalidad: 'publica' | 'manual' = 'publica') =>
        db.transaction('REPEATABLE READ', (manager) => leer(manager,
          f.administradores[0], f.a.personalId, f.a.sucursales[0],
          f.a.servicios[0], modalidad));
      const candidatos = [{ inicioUtc: '2026-10-21T15:00:00.000Z' }];
      const filtrar = (modalidad: 'publica' | 'manual') => db.transaction('REPEATABLE READ',
        async (manager) => {
          const { contexto, oferta } = servicios();
          const autorizado = await contexto.resolver(manager, f.administradores[0],
            f.a.personalId, reloj.ahora());
          return oferta.filtrarCandidatos(autorizado, f.a.sucursales[0],
            f.a.servicios[0], modalidad, candidatos);
        });
      expect(await obtener()).toMatchObject({ ofrecido: true, motivosExclusion: [],
        fuentes: { asignado: true, sucursalActiva: true, cuentaActiva: true,
          servicioActivo: true, seleccionGeneralActiva: true,
          atencionActiva: true, seleccionSucursalActiva: true } });
      expect((await filtrar('publica')).candidatos).toEqual(candidatos);
      const casos = [
        ['sucursales', 'id', f.a.sucursales[0], 'sucursal_inactiva'],
        ['usuarios', 'id', f.a.personalId, 'cuenta_inactiva'],
        ['servicios', 'id', f.a.servicios[0], 'servicio_inactivo'],
        ['personal_sucursales', 'sucursal_id', f.a.sucursales[0], 'atencion_inactiva'],
        ['personal_servicios', 'servicio_id', f.a.servicios[0], 'servicio_no_seleccionado'],
        ['personal_servicios_sucursales', 'sucursal_id', f.a.sucursales[0],
          'servicio_no_ofrecido_en_sucursal'],
      ] as const;
      for (const [tabla, columna, id, motivo] of casos) {
        const filtro = tabla.startsWith('personal_') ? ' AND personal_id=?' : '';
        const parametros = tabla.startsWith('personal_')
          ? [id, f.a.id, f.a.personalId] : [id, f.a.id];
        await db.query(`UPDATE ${tabla} SET activo=0 WHERE ${columna}=? AND negocio_id=?${filtro}`,
          parametros);
        for (const modalidad of ['publica', 'manual'] as const) {
          expect(await obtener(modalidad)).toMatchObject({ ofrecido: false,
            motivosExclusion: expect.arrayContaining([motivo]) });
          expect((await filtrar(modalidad)).candidatos).toEqual([]);
        }
        await db.query(`UPDATE ${tabla} SET activo=1 WHERE ${columna}=? AND negocio_id=?${filtro}`,
          parametros);
        expect(await obtener()).toMatchObject({ ofrecido: true, motivosExclusion: [] });
        expect((await filtrar('manual')).candidatos).toEqual(candidatos);
      }
      await db.query(`DELETE FROM personal_servicios_sucursales
        WHERE negocio_id=? AND personal_id=? AND sucursal_id=? AND servicio_id=?`,
      [f.a.id, f.a.personalId, f.a.sucursales[0], f.a.servicios[0]]);
      expect(await obtener()).toMatchObject({ ofrecido: false,
        motivosExclusion: ['servicio_no_ofrecido_en_sucursal'] });
      expect(await db.query(`SELECT COUNT(*) total FROM personal_servicios
        WHERE negocio_id=? AND personal_id=? AND servicio_id=?`,
      [f.a.id, f.a.personalId, f.a.servicios[0]])).toEqual([{ total: '1' }]);
      expect(await db.query('SELECT COUNT(*) total FROM citas WHERE negocio_id=?', [f.a.id]))
        .toEqual([{ total: '2' }]);
    });
  });
});
