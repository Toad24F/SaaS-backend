import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { AltasService } from '../src/altas/altas.service';
import { ActivacionesService } from '../src/altas/activaciones.service';
import { ReservaCorreoService } from '../src/altas/reserva-correo.service';
import { AuditoriaService } from '../src/auditoria/auditoria.service';
import { AutorizacionService } from '../src/auth/services/autorizacion.service';
import { PoliticaContrasenasService } from '../src/auth/services/politica-contrasenas.service';
import { Rol } from '../src/auth/enums/rol.enum';
import { CodigosService } from '../src/codigos/codigos.service';
import { DerivadorCodigo } from '../src/codigos/derivador-codigo';
import { BandejaCorreoService } from '../src/correos/bandeja-correo.service';
import { ProcesadorCorreoService } from '../src/correos/procesador-correo.service';
import { TransporteCorreoControlado } from '../src/correos/transporte-correo-controlado';
import { Usuario } from '../src/usuarios/entities/usuario.entity';
import { Negocio } from '../src/negocios/entities/negocio.entity';
import { CalendarioLicenciasService } from '../src/licencias/services/calendario-licencias.service';
import { PoliticaAccesoLicenciaService } from '../src/licencias/services/politica-acceso-licencia.service';
import { conBaseMigrada } from './support/mariadb';
import { RelojPrueba } from './support/reloj';

const derivador = new DerivadorCodigo({ 1: 'clave-aislada-t037-t039-123456789012345' }, 1);
const password = 'password-aislada-t037';
const tablas = ['negocios', 'usuarios', 'licencias', 'altas_administrador', 'correos_acceso',
  'codigos_acceso', 'envios_correo', 'eventos_auditoria'];
async function estado(db: DataSource) {
  const filas = await Promise.all(tablas.map((tabla) => db.query(`SELECT * FROM ${tabla} ORDER BY id`)));
  return Object.fromEntries(tablas.map((tabla, i) => [tabla, filas[i]]));
}
function servicios(db: DataSource) {
  const auditoria = new AuditoriaService();
  const codigos = new CodigosService(auditoria, derivador);
  return { altas: new AltasService(db.getRepository(Negocio), new AutorizacionService(), codigos,
    auditoria, new ReservaCorreoService(), new BandejaCorreoService()),
  activaciones: new ActivacionesService(db.getRepository(Usuario), codigos, new PoliticaContrasenasService(),
    new PoliticaAccesoLicenciaService(), new CalendarioLicenciasService(), auditoria) };
}
// Reconstrucción exclusiva de tests: las operaciones públicas nunca devuelven el código.
async function valor(db: DataSource) {
  const [codigo] = await db.query('SELECT * FROM codigos_acceso ORDER BY id DESC LIMIT 1');
  return derivador.derivar({ emisionId: codigo.emision_id, nonce: codigo.nonce, claveVersion: codigo.clave_version,
    proposito: codigo.proposito, negocioId: codigo.negocio_id, destinatarioTipo: 'alta',
    destinatarioId: codigo.alta_administrador_id, destinatarioVersion: codigo.destinatario_version,
    correo: codigo.correo_destinatario });
}
async function escenario(db: DataSource) {
  const ahora = new Date(Date.now() + 120000);
  const actor = await db.getRepository(Usuario).save({ negocioId: null, nombre: 'Super',
    email: 'super@example.test', passwordHash: 'hash-test', rol: Rol.SUPERADMIN, activo: true, activadoEn: ahora });
  const servicio = servicios(db);
  const alta = await servicio.altas.crearNegocio({ actorUsuarioId: actor.id, nombre: 'Uno', rfc: 'ABC010101AB1',
    identificadorPublico: 'uno', emailAdministrador: 'admin@example.test', ahora });
  const codigo = await valor(db);
  const activar = { codigo, correo: ' ADMIN@EXAMPLE.TEST ',
    nombre: ' Administrador ', password, ahora: new Date(ahora.getTime() + 1000) };
  const gestionar = { actorUsuarioId: actor.id, negocioId: alta.negocioId, ahora: activar.ahora };
  return { ...servicio, alta, actor, activar, gestionar };
}

describe('M1-T037–T039: activación, corrección y reemisión de invitaciones', () => {
  it('crea cuenta completa, transfiere reserva, consume e inicia el primer año una sola vez', async () => {
    await conBaseMigrada(async (db, segunda) => {
      const ctx = await escenario(db);
      await ctx.activaciones.activarAdministrador(ctx.activar);
      const filas = await estado(segunda);
      const admin = filas.usuarios.find((usuario: { rol: string }) => usuario.rol === 'admin_negocio');
      expect(admin).toMatchObject({ negocio_id: ctx.alta.negocioId, email: 'admin@example.test',
        nombre: 'Administrador', activo: 1, activado_en: ctx.activar.ahora });
      expect(admin.password_hash).not.toBe(password);
      expect(await new PoliticaContrasenasService().comparar(password, admin.password_hash)).toBe(true);
      expect(filas.altas_administrador[0]).toMatchObject({ estado: 'activada', usuario_creado_id: admin.id, activado_en: ctx.activar.ahora });
      expect(filas.correos_acceso[0]).toMatchObject({ alta_administrador_id: null, usuario_id: admin.id });
      expect(filas.codigos_acceso[0]).toMatchObject({ consumido_en: ctx.activar.ahora, invalidado_en: null });
      expect(filas.negocios[0].activado_en).toEqual(ctx.activar.ahora);
      expect(filas.licencias[0]).toMatchObject({ habilitada_en: ctx.activar.ahora,
        vence_en: new CalendarioLicenciasService().sumarAnios(ctx.activar.ahora) });
      await expect(ctx.activaciones.activarAdministrador(ctx.activar)).rejects.toBeInstanceOf(BadRequestException);
      expect(await estado(segunda)).toEqual(filas);
      expect(JSON.stringify(filas.eventos_auditoria)).not.toContain(ctx.activar.codigo);
      expect(JSON.stringify(filas.eventos_auditoria)).not.toContain(password);
    });
  });

  it.each(['correo distinto', 'sin correo', 'vencido', 'contraseña corta', 'suspendido'])(
    'rechaza activación %s sin cambios', async (motivo) => {
      await conBaseMigrada(async (db) => {
        const ctx = await escenario(db);
        const datos = { ...ctx.activar };
        if (motivo === 'correo distinto') datos.correo = 'otro@example.test';
        if (motivo === 'sin correo') datos.correo = '';
        if (motivo === 'vencido') datos.ahora = ctx.alta.expiraEn;
        if (motivo === 'contraseña corta') datos.password = 'corta';
        if (motivo === 'suspendido') await db.query('UPDATE licencias SET suspendida_en = ?', [ctx.activar.ahora]);
        const antes = await estado(db);
        await expect(ctx.activaciones.activarAdministrador(datos)).rejects.toBeInstanceOf(BadRequestException);
        expect(await estado(db)).toEqual(antes);
      });
    });

  it('revierte cuenta, reserva, invitación y consumo si falla la auditoría de activación', async () => {
    await conBaseMigrada(async (db, segunda) => {
      const ctx = await escenario(db);
      const antes = await estado(segunda);
      // Falla después de todas las escrituras de dominio; se conserva el código sin consumir.
      await db.query(`CREATE TRIGGER fallo_activacion AFTER INSERT ON eventos_auditoria FOR EACH ROW
        BEGIN IF NEW.accion = 'administrador_activado' THEN SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Fallo activacion test'; END IF; END`);
      try {
        await expect(ctx.activaciones.activarAdministrador(ctx.activar)).rejects.toThrow('Fallo activacion test');
        expect(await estado(segunda)).toEqual(antes);
      } finally { await db.query('DROP TRIGGER fallo_activacion'); }
      await ctx.activaciones.activarAdministrador(ctx.activar);
    });
  });

  it('corrige correo, cambia la reserva e invalida código y envío anteriores sin iniciar licencia', async () => {
    await conBaseMigrada(async (db) => {
      const ctx = await escenario(db);
      const resultado = await ctx.altas.corregirCorreoInicial({ ...ctx.gestionar, nuevoCorreo: ' NUEVO@EXAMPLE.TEST ' });
      expect(resultado).not.toHaveProperty('codigo');
      const filas = await estado(db);
      expect(filas.usuarios).toHaveLength(1);
      expect(filas.altas_administrador[0]).toMatchObject({ correo: 'nuevo@example.test', correo_version: 2, estado: 'pendiente' });
      expect(filas.correos_acceso[0]).toMatchObject({ correo: 'nuevo@example.test', usuario_id: null });
      expect(filas.negocios[0]).toMatchObject({ correo_administrador: 'nuevo@example.test', activado_en: null });
      expect(filas.licencias[0]).toMatchObject({ habilitada_en: null, vence_en: null });
      expect(filas.codigos_acceso[0].invalidado_en).toEqual(ctx.gestionar.ahora);
      expect(filas.envios_correo.map((envio: { estado: string }) => envio.estado)).toEqual(['descartado', 'pendiente']);
      await expect(ctx.activaciones.activarAdministrador(ctx.activar)).rejects.toBeInstanceOf(BadRequestException);
      await expect(ctx.activaciones.activarAdministrador({ ...ctx.activar, codigo: await valor(db) })).rejects.toBeInstanceOf(BadRequestException);
      const repetido = await ctx.altas.corregirCorreoInicial({ ...ctx.gestionar, nuevoCorreo: 'nuevo@example.test' });
      expect(repetido).toEqual(resultado);
      expect(await estado(db)).toEqual(filas);
      await ctx.activaciones.activarAdministrador({ ...ctx.activar, correo: 'nuevo@example.test', codigo: await valor(db) });
      await expect(ctx.altas.corregirCorreoInicial({ ...ctx.gestionar, nuevoCorreo: 'otro@example.test' })).rejects.toBeInstanceOf(ConflictException);
    });
  });

  it.each(['cuenta', 'invitación', 'inválido'])('rechaza corregir a correo %s sin invalidar el anterior', async (motivo) => {
    await conBaseMigrada(async (db) => {
      const ctx = await escenario(db);
      let nuevoCorreo = 'super@example.test';
      if (motivo === 'invitación') {
        await ctx.altas.crearNegocio({ actorUsuarioId: ctx.actor.id, nombre: 'Dos', rfc: 'ABC010101AB1',
          identificadorPublico: 'dos', emailAdministrador: 'ocupado@example.test', ahora: ctx.gestionar.ahora });
        nuevoCorreo = ' OCUPADO@EXAMPLE.TEST ';
      }
      if (motivo === 'inválido') nuevoCorreo = 'no-es-correo';
      const antes = await estado(db);
      await expect(ctx.altas.corregirCorreoInicial({ ...ctx.gestionar, nuevoCorreo }))
        .rejects.toBeInstanceOf(motivo === 'inválido' ? BadRequestException : ConflictException);
      expect(await estado(db)).toEqual(antes);
    });
  });

  it('reemite una invitación vencida conservando destino y cupo, con nuevas 48 horas', async () => {
    await conBaseMigrada(async (db) => {
      const ctx = await escenario(db);
      const ahora = new Date(ctx.alta.expiraEn.getTime() + 1000);
      const resultado = await ctx.altas.reemitirCodigoInicial({ ...ctx.gestionar, ahora });
      expect(resultado).toMatchObject({ negocioId: ctx.alta.negocioId, altaAdministradorId: ctx.alta.altaAdministradorId,
        estadoEnvio: 'pendiente', expiraEn: new Date(ahora.getTime() + 48 * 3600000) });
      expect(resultado).not.toHaveProperty('codigo');
      const filas = await estado(db);
      expect(filas.altas_administrador[0]).toMatchObject({ correo_version: 1, estado: 'pendiente' });
      expect(filas.licencias[0]).toMatchObject({ habilitada_en: null, vence_en: null });
      expect(filas.negocios[0]).toMatchObject({ activado_en: null, limite_sucursales_activas: 1 });
      expect(filas.envios_correo.map((envio: { estado: string }) => envio.estado)).toEqual(['descartado', 'pendiente']);
      expect(filas.codigos_acceso[0].invalidado_en).toEqual(ahora);
      await expect(ctx.activaciones.activarAdministrador({ ...ctx.activar, ahora })).rejects.toBeInstanceOf(BadRequestException);
      await ctx.activaciones.activarAdministrador({ ...ctx.activar, ahora, codigo: await valor(db) });
      await expect(ctx.altas.reemitirCodigoInicial({ ...ctx.gestionar, ahora })).rejects.toBeInstanceOf(ConflictException);
    });
  });

  it.each(['corrección', 'reemisión'])('revierte %s si falla el nuevo envío', async (operacion) => {
    await conBaseMigrada(async (db, segunda) => {
      const ctx = await escenario(db);
      const antes = await estado(segunda);
      await db.query(`CREATE TRIGGER fallo_envio AFTER INSERT ON envios_correo FOR EACH ROW
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Fallo envio test'`);
      try {
        const promesa = operacion === 'corrección'
          ? ctx.altas.corregirCorreoInicial({ ...ctx.gestionar, nuevoCorreo: 'nuevo@example.test' })
          : ctx.altas.reemitirCodigoInicial(ctx.gestionar);
        await expect(promesa).rejects.toThrow('Fallo envio test');
        expect(await estado(segunda)).toEqual(antes);
      } finally { await db.query('DROP TRIGGER fallo_envio'); }
    });
  });

  it.each(['tomado', 'enviado'])('reemplaza el código con envío %s sin aceptar un acuse anterior ni borrar evidencia', async (estadoAnterior) => {
    await conBaseMigrada(async (db) => {
      const ctx = await escenario(db);
      const transporte = new TransporteCorreoControlado();
      const procesador = new ProcesadorCorreoService(db, transporte, derivador, new RelojPrueba(ctx.gestionar.ahora));
      const toma = estadoAnterior === 'tomado' ? await procesador.tomar() : null;
      if (estadoAnterior === 'enviado') await procesador.procesarUno();
      await ctx.altas.corregirCorreoInicial({ ...ctx.gestionar, nuevoCorreo: 'nuevo@example.test' });
      // El token del trabajo tomado pierde autoridad. El enviado conserva el acuse histórico.
      if (toma) expect(await procesador.registrarResultado(toma, null)).toBe(false);
      const [anterior] = await db.query('SELECT * FROM envios_correo ORDER BY id');
      expect(anterior.estado).toBe(estadoAnterior === 'tomado' ? 'descartado' : 'enviado');
      expect(anterior.arrendamiento_id).toBeNull();
      if (estadoAnterior === 'enviado') expect(anterior.confirmado_en).toEqual(ctx.gestionar.ahora);
      expect((await procesador.procesarUno())!.estado).toBe('enviado');
      expect(transporte.intentos.at(-1)!.destinatario).toBe('nuevo@example.test');
      await expect(ctx.activaciones.activarAdministrador(ctx.activar)).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  it('exige superadmin vigente y negocio existente para ambas operaciones', async () => {
    await conBaseMigrada(async (db) => {
      const ctx = await escenario(db);
      for (const operacion of ['corrección', 'reemisión']) {
        const ejecutar = (datos: typeof ctx.gestionar) => operacion === 'corrección'
          ? ctx.altas.corregirCorreoInicial({ ...datos, nuevoCorreo: 'nuevo@example.test' })
          : ctx.altas.reemitirCodigoInicial(datos);
        await expect(ejecutar({ ...ctx.gestionar, negocioId: 4294967295 })).rejects.toBeInstanceOf(NotFoundException);
        await db.getRepository(Usuario).update(ctx.actor.id, { activo: false });
        const antes = await estado(db);
        await expect(ejecutar(ctx.gestionar)).rejects.toBeInstanceOf(ForbiddenException);
        expect(await estado(db)).toEqual(antes);
        await db.getRepository(Usuario).update(ctx.actor.id, { activo: true });
        await db.getRepository(Usuario).update(ctx.actor.id, { rol: Rol.ADMIN_NEGOCIO, negocioId: ctx.alta.negocioId });
        const demovido = await estado(db);
        await expect(ejecutar(ctx.gestionar)).rejects.toBeInstanceOf(ForbiddenException);
        expect(await estado(db)).toEqual(demovido);
        await db.getRepository(Usuario).update(ctx.actor.id, { rol: Rol.SUPERADMIN, negocioId: null });
      }
    });
  });
});
