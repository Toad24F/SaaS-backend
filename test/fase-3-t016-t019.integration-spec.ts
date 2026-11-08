import { conBaseMigrada } from './support/mariadb';
import { crearDatosOcupaciones } from './support/ocupaciones-fase-3';
import { RelojPrueba } from './support/reloj';
import { SucursalesService } from '../src/sucursales/sucursales.service';
import { ServiciosService } from '../src/servicios/servicios.service';
import { ProfesionalesService } from '../src/profesionales/profesionales.service';
import { Sucursal } from '../src/sucursales/entities/sucursal.entity';
import { Servicio } from '../src/servicios/entities/servicio.entity';
import { Personal } from '../src/profesionales/entities/personal.entity';
import { Usuario } from '../src/usuarios/entities/usuario.entity';
import { AutorizacionService } from '../src/auth/services/autorizacion.service';
import { AuditoriaService } from '../src/auditoria/auditoria.service';
import { PoliticaContrasenasService } from '../src/auth/services/politica-contrasenas.service';
import { ReservaCorreoService } from '../src/altas/reserva-correo.service';
import type { DataSource } from 'typeorm';

const reloj = () => new RelojPrueba(new Date('2026-10-20T15:00:00.123Z'));

// Usa los mismos servicios de baja/desactivación que las rutas HTTP existentes.
function servicios(db: DataSource) { return new ServiciosService(db.getRepository(Servicio),
  new AutorizacionService(), new AuditoriaService()); }
function sucursales(db: DataSource) { return new SucursalesService(db.getRepository(Sucursal),
  new AutorizacionService(), new AuditoriaService()); }
function profesionales(db: DataSource) { return new ProfesionalesService(db.getRepository(Personal),
  new AutorizacionService(), new PoliticaContrasenasService(),
  new ReservaCorreoService(), new AuditoriaService()); }

describe('M2-T017–T019: integridad y conservación de ocupaciones', () => {
  it('rechaza cruces de negocio e intervalos nulos o invertidos sin alterar oferta', async () => {
    await conBaseMigrada(async (db) => {
      const [a, b] = (await crearDatosOcupaciones(db, reloj())).negocios;
      const citasAntes = await db.query('SELECT COUNT(*) total FROM citas');
      const apartadosAntes = await db.query('SELECT COUNT(*) total FROM bloqueos_temporales');
      const cita = `INSERT INTO citas (negocio_id,sucursal_id,personal_id,servicio_id,
        cliente_id,inicio_utc,fin_utc,zona_horaria_reserva,folio)
        SELECT ?,?,?,?,cliente_id,?,?,'America/Chihuahua',?
        FROM citas WHERE id=?`;
      const inicio = new Date('2026-10-21T15:00:00.123Z');
      const fin = new Date('2026-10-21T15:30:00.789Z');
      await expect(db.query(cita, [a.id, b.sucursales[0], a.personalId,
        a.servicios[0], inicio, fin, 'CRUCE-SUC', a.citas[0]])).rejects.toThrow();
      await expect(db.query(cita, [a.id, a.sucursales[0], b.personalId,
        a.servicios[0], inicio, fin, 'CRUCE-PRO', a.citas[0]])).rejects.toThrow();
      await expect(db.query(cita, [a.id, a.sucursales[0], a.personalId,
        b.servicios[0], inicio, fin, 'CRUCE-SER', a.citas[0]])).rejects.toThrow();
      await expect(db.query(`INSERT INTO citas (negocio_id,sucursal_id,personal_id,
        servicio_id,cliente_id,inicio_utc,fin_utc,zona_horaria_reserva,folio)
        SELECT ?,?,?,?,cliente_id,?,?,'America/Chihuahua','CRUCE-CLI'
        FROM citas WHERE id=?`, [a.id, a.sucursales[0], a.personalId,
        a.servicios[0], inicio, fin, b.citas[0]])).rejects.toThrow();
      for (const [desde, hasta] of [[null, fin], [inicio, null], [fin, inicio],
        [inicio, inicio]] as const) {
        await expect(db.query(cita, [a.id, a.sucursales[0], a.personalId,
          a.servicios[0], desde, hasta, `INVALIDA-${String(desde)}-${String(hasta)}`.slice(0, 20),
          a.citas[0]])).rejects.toThrow();
      }
      const apartado = `INSERT INTO bloqueos_temporales (negocio_id,personal_id,
        sucursal_id,servicio_id,inicio_utc,fin_utc,expira_en,titular_hash)
        VALUES (?,?,?,?,?,?,?,?)`;
      await expect(db.query(apartado, [a.id, a.personalId, b.sucursales[0],
        a.servicios[0], inicio, fin, fin, 'a'.repeat(64)])).rejects.toThrow();
      await expect(db.query(apartado, [a.id, b.personalId, a.sucursales[0],
        a.servicios[0], inicio, fin, fin, 'a'.repeat(64)])).rejects.toThrow();
      await expect(db.query(apartado, [a.id, a.personalId, a.sucursales[0],
        b.servicios[0], inicio, fin, fin, 'a'.repeat(64)])).rejects.toThrow();
      for (const [desde, hasta] of [[null, fin], [inicio, null], [fin, inicio],
        [inicio, inicio]] as const) {
        await expect(db.query(apartado, [a.id, a.personalId, a.sucursales[0],
          a.servicios[0], desde, hasta, fin, 'a'.repeat(64)])).rejects.toThrow();
      }
      expect(await db.query('SELECT COUNT(*) total FROM citas')).toEqual(citasAntes);
      expect(await db.query('SELECT COUNT(*) total FROM bloqueos_temporales'))
        .toEqual(apartadosAntes);
      // El fixture conserva la identidad y las preferencias individuales del fix.
      expect(await db.query(`SELECT COUNT(*) total FROM personal_sucursales
        WHERE negocio_id=? AND personal_id=?`, [a.id, a.personalId]))
        .toEqual([{ total: '2' }]);
      expect(await db.query(`SELECT COUNT(*) total FROM personal_servicios_sucursales
        WHERE negocio_id=? AND personal_id=?`, [a.id, a.personalId]))
        .toEqual([{ total: '2' }]);
    });
  });

  it('conserva citas y apartados al inhabilitar recursos con ocupaciones', async () => {
    await conBaseMigrada(async (db) => {
      const [a, b] = (await crearDatosOcupaciones(db, reloj())).negocios;
      const alta = await db.query(`INSERT INTO usuarios
        (negocio_id,nombre,email,password_hash,rol,activo,activado_en)
        VALUES (?,'Admin','admin-ocupaciones@example.test','hash','admin_negocio',1,
          CURRENT_TIMESTAMP(6))`, [a.id]);
      const adminId = Number(alta.insertId);
      const sede = a.sucursales[0];
      const servicio = a.servicios[0];
      // Compara las filas completas para detectar cambios silenciosos en franjas o referencias.
      const citasAntes = await db.query(`SELECT id,sucursal_id,personal_id,servicio_id,
        inicio_utc,fin_utc FROM citas WHERE negocio_id=? ORDER BY id`, [a.id]);
      const apartadosAntes = await db.query(`SELECT id,sucursal_id,personal_id,servicio_id,
        inicio_utc,fin_utc FROM bloqueos_temporales WHERE negocio_id=? ORDER BY id`, [a.id]);
      const ofertasAntes = await db.query(`SELECT personal_id,sucursal_id,servicio_id,activo
        FROM personal_servicios_sucursales WHERE negocio_id=? ORDER BY sucursal_id,servicio_id`, [a.id]);
      // Las ocupaciones ya no bloquean la retirada recuperable de sus recursos.
      await sucursales(db).inhabilitar(adminId, sede, reloj().ahora());
      await servicios(db).inhabilitar(adminId, servicio, reloj().ahora());
      await profesionales(db).inhabilitar(adminId, a.personalId, reloj().ahora());
      expect(await db.getRepository(Sucursal).findOneByOrFail({ id: sede }))
        .toMatchObject({ activo: false });
      expect(await db.getRepository(Servicio).findOneByOrFail({ id: servicio }))
        .toMatchObject({ activo: false });
      expect(await db.getRepository(Usuario).findOneByOrFail({ id: a.personalId }))
        .toMatchObject({ activo: false });
      expect(await db.query('SELECT COUNT(*) total FROM citas WHERE negocio_id=?', [a.id]))
        .toEqual([{ total: '2' }]);
      expect(await db.query('SELECT COUNT(*) total FROM bloqueos_temporales WHERE negocio_id=?',
        [a.id])).toEqual([{ total: '2' }]);
      expect(await db.query(`SELECT id,sucursal_id,personal_id,servicio_id,
        inicio_utc,fin_utc FROM citas WHERE negocio_id=? ORDER BY id`, [a.id]))
        .toEqual(citasAntes);
      expect(await db.query(`SELECT id,sucursal_id,personal_id,servicio_id,
        inicio_utc,fin_utc FROM bloqueos_temporales WHERE negocio_id=? ORDER BY id`, [a.id]))
        .toEqual(apartadosAntes);
      expect(await db.query(`SELECT personal_id,sucursal_id,servicio_id,activo
        FROM personal_servicios_sucursales WHERE negocio_id=? ORDER BY sucursal_id,servicio_id`, [a.id]))
        .toEqual(ofertasAntes);
      expect(await db.query('SELECT COUNT(*) total FROM citas WHERE negocio_id=?', [b.id]))
        .toEqual([{ total: '2' }]);
      expect(await db.query('SELECT COUNT(*) total FROM bloqueos_temporales WHERE negocio_id=?',
        [b.id])).toEqual([{ total: '2' }]);
      expect(await db.query(`SELECT COUNT(*) total FROM eventos_auditoria
        WHERE negocio_id=? AND accion IN ('sucursal_inhabilitada','servicio_inhabilitado',
          'profesional_inhabilitado')`, [a.id])).toEqual([{ total: '3' }]);
    });
  });

  it('conserva apartados al inhabilitar aunque ya no haya citas', async () => {
    await conBaseMigrada(async (db) => {
      const [a] = (await crearDatosOcupaciones(db, reloj())).negocios;
      const alta = await db.query(`INSERT INTO usuarios
        (negocio_id,nombre,email,password_hash,rol,activo,activado_en)
        VALUES (?,'Admin','admin-apartados@example.test','hash','admin_negocio',1,
          CURRENT_TIMESTAMP(6))`, [a.id]);
      await db.query('DELETE FROM citas WHERE negocio_id=?', [a.id]);
      const adminId = Number(alta.insertId);
      // Los apartados conservan sus referencias aunque los tres recursos se retiren.
      await sucursales(db).inhabilitar(adminId, a.sucursales[0], reloj().ahora());
      await servicios(db).inhabilitar(adminId, a.servicios[0], reloj().ahora());
      await profesionales(db).inhabilitar(adminId, a.personalId, reloj().ahora());
      expect(await db.query(`SELECT COUNT(*) total FROM bloqueos_temporales
        WHERE negocio_id=?`, [a.id])).toEqual([{ total: '2' }]);
    });
  });
});
