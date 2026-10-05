import { BandejaCorreoService } from '../src/correos/bandeja-correo.service';
import { CodigosService } from '../src/codigos/codigos.service';
import { DerivadorCodigo } from '../src/codigos/derivador-codigo';
import { PropositoCodigoAcceso } from '../src/codigos/entities/codigo-acceso.entity';
import { AuditoriaService } from '../src/auditoria/auditoria.service';
import { TransporteCorreoSmtp } from '../src/correos/transporte-correo-smtp';
import { conBaseMigrada } from './support/mariadb';
import type { DataSource, EntityManager } from 'typeorm';

describe('M1-T029: encolado dentro de la transacción de dominio', () => {
  const bandeja = new BandejaCorreoService();
  const ahora = new Date('2026-09-28T18:00:00.000Z');
  const codigos = new CodigosService(new AuditoriaService(),
    new DerivadorCodigo({ 1: 'clave-de-prueba-solo-en-memoria-123456789' }, 1));

  async function escenario(db: DataSource) {
    const negocioId = Number((await db.query(`INSERT INTO negocios (nombre, slug, email_contacto)
      VALUES ('Uno', 'uno', 'uno@example.test')`)).insertId);
    const ajenoId = Number((await db.query(`INSERT INTO negocios (nombre, slug, email_contacto)
      VALUES ('Dos', 'dos', 'dos@example.test')`)).insertId);
    const actorId = Number((await db.query(`INSERT INTO usuarios
      (nombre, email, password_hash, rol, activado_en)
      VALUES ('Super', 'super@example.test', 'hash', 'superadmin', UTC_TIMESTAMP(6))`)).insertId);
    const altaId = Number((await db.query(`INSERT INTO altas_administrador (negocio_id, correo)
      VALUES (?, 'admin@example.test')`, [negocioId])).insertId);
    const emitir = async (manager: EntityManager) => {
      const emitido = await codigos.emitir(manager, { negocioId, altaAdministradorId: altaId,
        emisorUsuarioId: actorId, proposito: PropositoCodigoAcceso.ACTIVACION_ADMIN, ahora });
      const [codigo] = await manager.query('SELECT id FROM codigos_acceso WHERE negocio_id = ?', [negocioId]);
      return { codigoAccesoId: String(codigo.id), valor: emitido.codigo };
    };
    return { negocioId, ajenoId, emitir };
  }

  it('confirma código y envío juntos sin invocar SMTP antes ni después del commit', async () => {
    const enviar = jest.spyOn(TransporteCorreoSmtp.prototype, 'enviar')
      .mockRejectedValue(new Error('No debe entregarse al encolar.'));
    try {
      await conBaseMigrada(async (db, observador) => {
        const { negocioId, emitir } = await escenario(db);
        const envio = await db.transaction(async (manager) => {
          const codigo = await emitir(manager);
          const pendiente = await bandeja.encolarCodigo(manager,
            { negocioId, codigoAccesoId: codigo.codigoAccesoId, ahora });
          // Otra conexión no puede observar el pendiente de una operación aún no confirmada.
          expect(Number((await observador.query('SELECT COUNT(*) AS total FROM envios_correo'))[0].total)).toBe(0);
          expect(enviar).not.toHaveBeenCalled();
          expect(JSON.stringify(pendiente)).not.toContain(codigo.valor);
          return pendiente;
        });
        const [fila] = await observador.query('SELECT * FROM envios_correo WHERE id = ?', [envio.id]);
        expect(fila).toMatchObject({ negocio_id: negocioId, tipo: 'activacion_admin',
          correo_destinatario: 'admin@example.test', estado: 'pendiente', intentos: 0,
          arrendamiento_id: null, confirmado_en: null });
        expect(fila.proximo_intento_en).toEqual(ahora);
        expect(enviar).not.toHaveBeenCalled();
      });
    } finally { enviar.mockRestore(); }
  });

  it('revierte operación de dominio, código, auditoría y pendiente ante un fallo posterior', async () => {
    await conBaseMigrada(async (db) => {
      const { negocioId, emitir } = await escenario(db);
      await expect(db.transaction(async (manager) => {
        await manager.query("UPDATE negocios SET nombre = 'Cambio' WHERE id = ?", [negocioId]);
        const codigo = await emitir(manager);
        await bandeja.encolarCodigo(manager, { negocioId, codigoAccesoId: codigo.codigoAccesoId, ahora });
        throw new Error('fallo después de encolar');
      })).rejects.toThrow('fallo después de encolar');
      for (const tabla of ['codigos_acceso', 'envios_correo', 'eventos_auditoria']) {
        expect(Number((await db.query(`SELECT COUNT(*) AS total FROM ${tabla}`))[0].total)).toBe(0);
      }
      expect((await db.query('SELECT nombre FROM negocios WHERE id = ?', [negocioId]))[0].nombre).toBe('Uno');
    });
  });

  it('exige una transacción activa, valida negocio y deduplica sin reiniciar el estado', async () => {
    await conBaseMigrada(async (db) => {
      const { negocioId, ajenoId, emitir } = await escenario(db);
      const codigo = await db.transaction(emitir);
      await expect(bandeja.encolarCodigo(db.manager,
        { negocioId, codigoAccesoId: codigo.codigoAccesoId, ahora })).rejects.toThrow('transacción');
      await expect(db.transaction((manager) => bandeja.encolarCodigo(manager,
        { negocioId: ajenoId, codigoAccesoId: codigo.codigoAccesoId, ahora }))).rejects.toThrow();
      const primero = await db.transaction((manager) => bandeja.encolarCodigo(manager,
        { negocioId, codigoAccesoId: codigo.codigoAccesoId, ahora }));
      await db.query("UPDATE envios_correo SET estado = 'fallido', intentos = 2 WHERE id = ?", [primero.id]);
      const repetido = await db.transaction((manager) => bandeja.encolarCodigo(manager,
        { negocioId, codigoAccesoId: codigo.codigoAccesoId, ahora }));
      expect(repetido.id).toBe(primero.id);
      expect(repetido.intentos).toBe(2);
      expect(repetido.estado).toBe('fallido');
      expect(Number((await db.query('SELECT COUNT(*) AS total FROM envios_correo'))[0].total)).toBe(1);
    });
  });

  it('encola avisos solo para licencia y administrador completos del propio negocio', async () => {
    await conBaseMigrada(async (db) => {
      const { negocioId, ajenoId } = await escenario(db);
      const fecha = new Date(Date.now() + 120_000);
      const vence = new Date(fecha.getTime() + 48 * 60 * 60 * 1000);
      await db.query(`UPDATE negocios SET activado_en=?, correo_administrador='cuenta@example.test'
        WHERE id=?`, [fecha, negocioId]);
      const licenciaId = Number((await db.query(`INSERT INTO licencias
        (negocio_id,habilitada_en,vence_en,version_vencimiento) VALUES (?,?,?,1)`,
      [negocioId, fecha, vence])).insertId);
      const usuarioId = Number((await db.query(`INSERT INTO usuarios
        (negocio_id, nombre, email, password_hash, rol, activado_en)
        VALUES (?, 'Admin', 'cuenta@example.test', 'hash', 'admin_negocio', ?)`,
      [negocioId, fecha])).insertId);
      const datos = { negocioId, licenciaId, usuarioId, versionVencimiento: 1, ahora: fecha };
      await expect(db.transaction((manager) => bandeja.encolarAviso(manager,
        { ...datos, negocioId: ajenoId }))).rejects.toThrow();
      await expect(db.transaction((manager) => bandeja.encolarAviso(manager,
        { ...datos, versionVencimiento: 0 }))).rejects.toThrow();
      const envio = await db.transaction((manager) => bandeja.encolarAviso(manager, datos));
      expect(envio).toMatchObject({ licenciaId, codigoAccesoId: null, versionVencimiento: 1,
        correoDestinatario: 'cuenta@example.test', estado: 'pendiente' });
    });
  });

  it('dos transacciones concurrentes obtienen el mismo pendiente lógico', async () => {
    await conBaseMigrada(async (primera, segunda) => {
      const { negocioId, emitir } = await escenario(primera);
      const codigo = await primera.transaction(emitir);
      const datos = { negocioId, codigoAccesoId: codigo.codigoAccesoId, ahora };
      const envios = await Promise.all([primera, segunda].map((db) =>
        db.transaction((manager) => bandeja.encolarCodigo(manager, datos))));
      expect(envios[0].id).toBe(envios[1].id);
      expect(Number((await primera.query('SELECT COUNT(*) AS total FROM envios_correo'))[0].total)).toBe(1);
    });
  });

  it('no crea pendientes para códigos vencidos en el límite exacto o invalidados', async () => {
    await conBaseMigrada(async (db) => {
      const { negocioId, emitir } = await escenario(db);
      const codigo = await db.transaction(emitir);
      const datos = { negocioId, codigoAccesoId: codigo.codigoAccesoId, ahora };
      await expect(db.transaction((manager) => bandeja.encolarCodigo(manager,
        { ...datos, ahora: new Date('2026-09-30T18:00:00.000Z') }))).rejects.toThrow();
      await db.query('UPDATE codigos_acceso SET invalidado_en = ? WHERE id = ?', [ahora, codigo.codigoAccesoId]);
      await expect(db.transaction((manager) => bandeja.encolarCodigo(manager, datos))).rejects.toThrow();
      expect(Number((await db.query('SELECT COUNT(*) AS total FROM envios_correo'))[0].total)).toBe(0);
    });
  });
});
