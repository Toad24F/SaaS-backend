import { DataSource } from 'typeorm';
import { ProcesadorCorreoService } from '../src/correos/procesador-correo.service';
import { BandejaCorreoService } from '../src/correos/bandeja-correo.service';
import { DerivadorCodigo } from '../src/codigos/derivador-codigo';
import { CodigosService } from '../src/codigos/codigos.service';
import { AuditoriaService } from '../src/auditoria/auditoria.service';
import { PropositoCodigoAcceso } from '../src/codigos/entities/codigo-acceso.entity';
import { TransporteCorreoControlado } from '../src/correos/transporte-correo-controlado';
import { Usuario } from '../src/usuarios/entities/usuario.entity';
import { Rol } from '../src/auth/enums/rol.enum';
import { conBaseMigrada } from './support/mariadb';
import { RelojPrueba } from './support/reloj';

describe('M1-T030–T033: procesamiento durable de códigos', () => {
  const derivador = new DerivadorCodigo({ 1: 'clave-de-prueba-en-memoria-123456789012345' }, 1);
  const codigos = new CodigosService(new AuditoriaService(), derivador);
  async function escenario(db: DataSource) {
    const reloj = new RelojPrueba(new Date('2026-09-29T18:00:00Z'));
    const negocioId = Number((await db.query(`INSERT INTO negocios (nombre, slug, email_contacto)
      VALUES ('Uno', 'uno', 'uno@example.test')`)).insertId);
    const actorId = Number((await db.query(`INSERT INTO usuarios
      (nombre, email, password_hash, rol, activado_en)
      VALUES ('Super', 'super@example.test', 'hash', 'superadmin', UTC_TIMESTAMP(6))`)).insertId);
    const altaId = Number((await db.query(`INSERT INTO altas_administrador (negocio_id, correo)
      VALUES (?, 'admin@example.test')`, [negocioId])).insertId);
    const codigo = await db.transaction(async (manager) => {
      const emitido = await codigos.emitir(manager, { negocioId, altaAdministradorId: altaId,
        emisorUsuarioId: actorId, proposito: PropositoCodigoAcceso.ACTIVACION_ADMIN, ahora: reloj.ahora() });
      const [fila] = await manager.query('SELECT id FROM codigos_acceso');
      const envio = await new BandejaCorreoService().encolarCodigo(manager,
        { negocioId, codigoAccesoId: String(fila.id), ahora: reloj.ahora() });
      return { ...emitido, id: String(fila.id), envioId: envio.id };
    });
    const transporte = new TransporteCorreoControlado();
    const crear = (conexion = db, smtp = transporte) =>
      new ProcesadorCorreoService(conexion, smtp, derivador, reloj);
    return { reloj, negocioId, actorId, altaId, codigo, transporte, crear };
  }

  it('dos procesadores toman una sola vez y recuperan el lease en el límite exacto', async () => {
    await conBaseMigrada(async (db, segunda) => {
      const { crear, reloj } = await escenario(db);
      const tomas = await Promise.all([crear().tomar(), crear(segunda).tomar()]);
      expect(tomas.filter(Boolean)).toHaveLength(1);
      const toma = tomas.find(Boolean)!;
      expect(await crear().tomar()).toBeNull();
      reloj.avanzar(300000);
      const recuperado = await crear(segunda).tomar();
      expect(recuperado!.id).toBe(toma.id);
      expect(recuperado!.arrendamientoId).not.toBe(toma.arrendamientoId);
      expect(await crear().registrarResultado(toma, null)).toBe(false);
    });
  });

  it('reconstruye el mismo código y no vuelve a enviar un confirmado', async () => {
    await conBaseMigrada(async (db) => {
      const { crear, codigo, transporte } = await escenario(db);
      expect((await crear().procesarUno())!.estado).toBe('enviado');
      expect(transporte.intentos[0].texto).toContain(codigo.codigo);
      expect(await crear().procesarUno()).toBeNull();
      expect(transporte.intentos).toHaveLength(1);
      const filas = await db.query('SELECT * FROM envios_correo');
      expect(JSON.stringify(filas)).not.toContain(codigo.codigo);
    });
  });

  it.each(['vencido', 'consumido', 'invalidado', 'version', 'correo', 'hash', 'proposito'])(
    'descarta código obsoleto: %s sin contactar transporte', async (motivo) => {
      await conBaseMigrada(async (db) => {
        const { crear, reloj, transporte, altaId, codigo } = await escenario(db);
        if (motivo === 'vencido') reloj.fijar(codigo.expiraEn);
        if (motivo === 'consumido') await db.query('UPDATE codigos_acceso SET consumido_en = emitido_en');
        if (motivo === 'invalidado') await db.query('UPDATE codigos_acceso SET invalidado_en = emitido_en');
        if (motivo === 'version') await db.query('UPDATE altas_administrador SET correo_version = 2 WHERE id = ?', [altaId]);
        if (motivo === 'correo') await db.query("UPDATE altas_administrador SET correo = 'nuevo@example.test' WHERE id = ?", [altaId]);
        if (motivo === 'hash') await db.query('UPDATE codigos_acceso SET codigo_hash = ?', ['a'.repeat(64)]);
        if (motivo === 'proposito') await db.query("UPDATE envios_correo SET tipo = 'recuperacion'");
        expect((await crear().procesarUno())!.estado).toBe('descartado');
        expect(transporte.intentos).toHaveLength(0);
        expect((await db.query('SELECT expira_en FROM codigos_acceso'))[0].expira_en).toEqual(codigo.expiraEn);
      });
    },
  );

  it.each([false, true])('recuperación se entrega solo al administrador vigente, desactivado=%s', async (desactivado) => {
    await conBaseMigrada(async (db) => {
      const { crear, reloj, negocioId, actorId, transporte } = await escenario(db);
      await db.query("UPDATE envios_correo SET estado = 'descartado'");
      const usuario = await db.getRepository(Usuario).save({ negocioId, nombre: 'Admin',
        email: 'cuenta@example.test', passwordHash: 'hash', rol: Rol.ADMIN_NEGOCIO,
        activo: true, activadoEn: reloj.ahora(), correoVersion: 1 });
      const emitido = await db.transaction(async (manager) => {
        const codigo = await codigos.emitir(manager, { negocioId, usuarioId: usuario.id,
          emisorUsuarioId: actorId, proposito: PropositoCodigoAcceso.RECUPERACION, ahora: reloj.ahora() });
        const [fila] = await manager.query("SELECT id FROM codigos_acceso WHERE proposito = 'recuperacion'");
        await new BandejaCorreoService().encolarCodigo(manager,
          { negocioId, codigoAccesoId: String(fila.id), ahora: reloj.ahora() });
        return codigo;
      });
      if (desactivado) await db.getRepository(Usuario).update(usuario.id, { activo: false });
      expect((await crear().procesarUno())!.estado).toBe(desactivado ? 'descartado' : 'enviado');
      expect(transporte.intentos).toHaveLength(desactivado ? 0 : 1);
      if (!desactivado) expect(transporte.intentos[0].texto).toContain(emitido.codigo);
    });
  });

  it('timeout y rechazo se reintentan tras reinicio sin persistir el error secreto', async () => {
    await conBaseMigrada(async (db) => {
      const { crear, reloj, codigo } = await escenario(db);
      const smtp = new TransporteCorreoControlado(['timeout', 'rechazar', 'aceptar']);
      expect((await crear(db, smtp).procesarUno())!.estado).toBe('fallido');
      expect(await crear(db, smtp).procesarUno()).toBeNull();
      reloj.avanzar(60000);
      expect((await crear(db, smtp).procesarUno())!.estado).toBe('fallido');
      reloj.avanzar(120000);
      expect((await crear(db, smtp).procesarUno())!.estado).toBe('enviado');
      expect(smtp.intentos).toHaveLength(3);
      expect(smtp.intentos.every((m) => m.texto.includes(codigo.codigo))).toBe(true);
      expect((await db.query('SELECT intentos FROM envios_correo'))[0].intentos).toBe(3);
    });
  });

  it('sanitiza un error arbitrario del proveedor sin guardar contenido ni credenciales', async () => {
    await conBaseMigrada(async (db) => {
      const { crear, transporte, codigo } = await escenario(db);
      jest.spyOn(transporte, 'enviar').mockRejectedValue(new Error(`password secreto ${codigo.codigo}`));
      const estado = await crear().procesarUno();
      expect(estado!.ultimoError).toBe('No se pudo entregar el correo.');
      expect(JSON.stringify(await db.query('SELECT * FROM envios_correo'))).not.toContain(codigo.codigo);
    });
  });

  it('caída tras aceptación puede duplicar entrega pero no el consumo del código', async () => {
    await conBaseMigrada(async (db) => {
      const { crear, reloj, transporte, codigo } = await escenario(db);
      const caido = crear();
      jest.spyOn(caido, 'registrarResultado').mockRejectedValueOnce(new Error('caída antes del acuse durable'));
      await expect(caido.procesarUno()).rejects.toThrow('caída antes');
      reloj.avanzar(300000);
      expect((await crear().procesarUno())!.estado).toBe('enviado');
      expect(transporte.intentos).toHaveLength(2);
      const datos = { codigo: codigo.codigo, correo: 'admin@example.test',
        proposito: PropositoCodigoAcceso.ACTIVACION_ADMIN, ahora: reloj.ahora() };
      await codigos.consumir(db, datos, async () => undefined);
      await expect(codigos.consumir(db, datos, async () => undefined)).rejects.toThrow();
    });
  });

  it('reintento manual rechaza lease activo y destinatario obsoleto sin cambiar el estado', async () => {
    await conBaseMigrada(async (db) => {
      const { crear, reloj, actorId, negocioId, altaId, codigo } = await escenario(db);
      const procesador = crear();
      await procesador.tomar();
      await expect(procesador.reintentar(negocioId, codigo.envioId, actorId)).rejects.toThrow('ocupado');
      reloj.avanzar(300000);
      await db.query('UPDATE altas_administrador SET correo_version = 2 WHERE id = ?', [altaId]);
      await expect(procesador.reintentar(negocioId, codigo.envioId, actorId)).rejects.toThrow('obsoleto');
      expect((await db.query('SELECT estado FROM envios_correo'))[0].estado).toBe('tomado');
      expect((await procesador.procesarUno())!.estado).toBe('descartado');
    });
  });
});
