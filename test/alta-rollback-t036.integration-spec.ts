import { BadRequestException, ConflictException } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { AltasService } from '../src/altas/altas.service';
import { ReservaCorreoService } from '../src/altas/reserva-correo.service';
import { AuditoriaService } from '../src/auditoria/auditoria.service';
import { AutorizacionService } from '../src/auth/services/autorizacion.service';
import { Rol } from '../src/auth/enums/rol.enum';
import { CodigosService } from '../src/codigos/codigos.service';
import { DerivadorCodigo } from '../src/codigos/derivador-codigo';
import { BandejaCorreoService } from '../src/correos/bandeja-correo.service';
import { ProcesadorCorreoService } from '../src/correos/procesador-correo.service';
import { TransporteCorreoControlado } from '../src/correos/transporte-correo-controlado';
import { Usuario } from '../src/usuarios/entities/usuario.entity';
import { Negocio } from '../src/negocios/entities/negocio.entity';
import { conBaseMigrada } from './support/mariadb';
import { RelojPrueba } from './support/reloj';

const derivador = new DerivadorCodigo({ 1: 'clave-aislada-t036-12345678901234567890' }, 1);
const tablas = ['negocios', 'licencias', 'altas_administrador', 'correos_acceso',
  'codigos_acceso', 'envios_correo', 'eventos_auditoria', 'usuarios'] as const;
type Tabla = typeof tablas[number];

function altas(db: DataSource, claves = derivador) {
  const auditoria = new AuditoriaService();
  return new AltasService(db.getRepository(Negocio), new AutorizacionService(),
    new CodigosService(auditoria, claves), auditoria,
    new ReservaCorreoService(), new BandejaCorreoService());
}

// Lee todos los registros, no solo cantidades: detecta alteraciones del negocio previo.
// Los nombres SQL proceden exclusivamente de esta lista cerrada de tablas de prueba.
async function estado(db: DataSource, incluirEnvios = true) {
  const seleccion = tablas.filter((tabla) => incluirEnvios || tabla !== 'envios_correo');
  const filas = await Promise.all(seleccion.map((tabla) => db.query(`SELECT * FROM ${tabla} ORDER BY id`)));
  return Object.fromEntries(seleccion.map((tabla, indice) => [tabla, filas[indice]]));
}

async function escenario(db: DataSource) {
  const reloj = new RelojPrueba(new Date(Date.now() + 120000));
  const actor = await db.getRepository(Usuario).save({ negocioId: null, nombre: 'Superadmin',
    email: 'super-t036@example.test', passwordHash: 'hash-aislado-t036',
    rol: Rol.SUPERADMIN, activo: true, activadoEn: reloj.ahora() });
  const datos = { actorUsuarioId: actor.id, nombre: 'Negocio T036', rfc: ' abc010101ab1 ',
    identificadorPublico: ' negocio-t036 ', emailAdministrador: ' ADMIN-T036@EXAMPLE.TEST ',
    ahora: reloj.ahora() };
  return { actor, reloj, datos };
}

describe('M1-T036: alta completa, identidad y rollback conjunto', () => {
  it('admite RFC repetido y mantiene independientes ambos conjuntos sin administradores', async () => {
    await conBaseMigrada(async (db) => {
      const { datos } = await escenario(db);
      const uno = await altas(db).crearNegocio(datos);
      const dos = await altas(db).crearNegocio({ ...datos, rfc: 'ABC010101AB1',
        identificadorPublico: 'otro-t036', emailAdministrador: 'otro-t036@example.test' });
      const filas = await estado(db);
      expect(filas.negocios.map((negocio: { rfc: string }) => negocio.rfc)).toEqual(['ABC010101AB1', 'ABC010101AB1']);
      expect(filas.usuarios).toHaveLength(1);
      for (const resultado of [uno, dos]) {
        const negocioId = resultado.negocioId;
        expect(filas.licencias.filter((fila: { negocio_id: number }) => fila.negocio_id === negocioId))
          .toEqual([expect.objectContaining({ id: resultado.licenciaId, habilitada_en: null, vence_en: null })]);
        expect(filas.altas_administrador.filter((fila: { negocio_id: number }) => fila.negocio_id === negocioId))
          .toEqual([expect.objectContaining({ id: resultado.altaAdministradorId, estado: 'pendiente', usuario_creado_id: null })]);
        expect(filas.codigos_acceso.filter((fila: { negocio_id: number }) => fila.negocio_id === negocioId))
          .toEqual([expect.objectContaining({ alta_administrador_id: resultado.altaAdministradorId, usuario_id: null })]);
        expect(filas.envios_correo.filter((fila: { negocio_id: number }) => fila.negocio_id === negocioId))
          .toEqual([expect.objectContaining({ estado: 'pendiente', intentos: 0 })]);
      }
      expect(filas.correos_acceso).toHaveLength(2);
      expect(filas.eventos_auditoria).toHaveLength(4);
    });
  });

  it.each(['slug', 'correo pendiente', 'correo de cuenta'])('rechaza %s normalizado sin modificar registros previos', async (duplicado) => {
    await conBaseMigrada(async (db, segunda) => {
      const { datos } = await escenario(db);
      await altas(db).crearNegocio(datos);
      const antes = await estado(segunda);
      const intento = { ...datos, identificadorPublico: 'nuevo-t036', emailAdministrador: 'nuevo-t036@example.test' };
      if (duplicado === 'slug') intento.identificadorPublico = ' NEGOCIO-T036 ';
      if (duplicado === 'correo pendiente') intento.emailAdministrador = ' admin-T036@example.test ';
      // La cuenta existente del superadmin también ocupa el espacio global de correos.
      if (duplicado === 'correo de cuenta') intento.emailAdministrador = ' SUPER-T036@EXAMPLE.TEST ';
      await expect(altas(db).crearNegocio(intento)).rejects.toBeInstanceOf(ConflictException);
      expect(await estado(segunda)).toEqual(antes);
    });
  });

  it.each(['slug', 'correo'])('dos conexiones aceptan una sola alta con %s duplicado', async (duplicado) => {
    await conBaseMigrada(async (db, segunda) => {
      const { datos } = await escenario(db);
      const otro = duplicado === 'slug'
        ? { ...datos, identificadorPublico: 'NEGOCIO-T036', emailAdministrador: 'otro-t036@example.test' }
        : { ...datos, identificadorPublico: 'otro-t036', emailAdministrador: 'admin-t036@example.test' };
      const resultados = await Promise.allSettled([altas(db).crearNegocio(datos), altas(segunda).crearNegocio(otro)]);
      expect(resultados.filter((resultado) => resultado.status === 'fulfilled')).toHaveLength(1);
      const rechazo = resultados.find((resultado) => resultado.status === 'rejected') as PromiseRejectedResult;
      expect(rechazo.reason).toBeInstanceOf(ConflictException);
      const filas = await estado(db);
      for (const tabla of tablas.filter((tabla) => tabla !== 'eventos_auditoria')) expect(filas[tabla]).toHaveLength(1);
      expect(filas.eventos_auditoria).toHaveLength(2);
      expect(filas.altas_administrador[0]).toMatchObject({ estado: 'pendiente', usuario_creado_id: null });
    });
  });

  // Los triggers fallan después del INSERT real dentro de la base temporal migrada.
  // Incluyen las dos auditorías: la última ocurre después de guardar el envío.
  const fallos: Array<[string, Tabla, string | null]> = [
    ['negocio', 'negocios', null], ['licencia', 'licencias', null],
    ['invitación', 'altas_administrador', null], ['reserva', 'correos_acceso', null],
    ['código', 'codigos_acceso', null], ['envío', 'envios_correo', null],
    ['auditoría de código', 'eventos_auditoria', 'codigo_emitido'],
    ['auditoría de negocio', 'eventos_auditoria', 'negocio_creado'],
  ];
  it.each(fallos)('revierte el conjunto si falla %s y permite reintentar la misma identidad', async (_etapa, tabla, accion) => {
    await conBaseMigrada(async (db, segunda) => {
      const { datos } = await escenario(db);
      await altas(db).crearNegocio({ ...datos, identificadorPublico: 'previo-t036', emailAdministrador: 'previo-t036@example.test' });
      const antes = await estado(segunda);
      const falloSql = "SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Fallo inyectado T036'";
      const cuerpo = accion === null ? falloSql : `BEGIN IF NEW.accion = '${accion}' THEN ${falloSql}; END IF; END`;
      await db.query(`CREATE TRIGGER fallo_t036 AFTER INSERT ON ${tabla} FOR EACH ROW ${cuerpo}`);
      try {
        await expect(altas(db).crearNegocio(datos)).rejects.toThrow('Fallo inyectado T036');
        expect(await estado(segunda)).toEqual(antes);
      } finally {
        await db.query('DROP TRIGGER fallo_t036');
      }
      // Volver a usar slug y correo demuestra que tampoco quedó una reserva huérfana.
      const recuperado = await altas(db).crearNegocio(datos);
      expect(recuperado.estadoEnvio).toBe('pendiente');
      const despues = await estado(segunda);
      for (const tablaActual of tablas) {
        const incremento = tablaActual === 'usuarios' ? 0 : tablaActual === 'eventos_auditoria' ? 2 : 1;
        expect(despues[tablaActual]).toHaveLength(antes[tablaActual].length + incremento);
      }
    });
  });

  it('revierte el alta si falta la clave HMAC, sin generar entrega manual de respaldo', async () => {
    await conBaseMigrada(async (db, segunda) => {
      const { datos } = await escenario(db);
      const antes = await estado(segunda);
      await expect(altas(db, new DerivadorCodigo({}, 1)).crearNegocio(datos)).rejects.toBeInstanceOf(BadRequestException);
      expect(await estado(segunda)).toEqual(antes);
      expect((await altas(db).crearNegocio(datos)).estadoEnvio).toBe('pendiente');
    });
  });

  it.each(['rechazar', 'timeout'] as const)('conserva el negocio pendiente tras %s y reintenta sin extender el código', async (fallo) => {
    await conBaseMigrada(async (db, segunda) => {
      const { datos, reloj, actor } = await escenario(db);
      const transporte = new TransporteCorreoControlado([fallo, 'aceptar']);
      const procesador = new ProcesadorCorreoService(db, transporte, derivador, reloj);
      const resultado = await altas(db).crearNegocio(datos);
      expect(transporte.intentos).toHaveLength(0);
      const dominioAntes = await estado(segunda, false);
      const fallido = await procesador.procesarUno();
      expect(fallido).toMatchObject({ id: resultado.envioId, estado: 'fallido', intentos: 1, confirmadoEn: null,
        proximoIntentoEn: new Date(reloj.ahora().getTime() + 60000) });
      expect(await estado(segunda, false)).toEqual(dominioAntes);
      const consulta = await procesador.listar(resultado.negocioId, actor.id);
      expect(consulta[0]).toMatchObject({ estado: 'fallido', ultimoError: expect.any(String), confirmadoEn: null });
      // Solo el envío cambia; negocio/licencia/invitación/código/auditoría permanecen intactos.
      const envio = (await estado(segunda)).envios_correo[0];
      expect(envio).toMatchObject({ arrendamiento_id: null, arrendado_hasta: null, estado: 'fallido' });
      // Reconstruye el valor en memoria para comprobar ausencia del código, no solo del mensaje completo.
      const codigo = dominioAntes.codigos_acceso[0];
      const secreto = derivador.derivar({ emisionId: codigo.emision_id, nonce: codigo.nonce,
        claveVersion: codigo.clave_version, proposito: codigo.proposito, negocioId: codigo.negocio_id,
        destinatarioTipo: 'alta', destinatarioId: codigo.alta_administrador_id,
        destinatarioVersion: codigo.destinatario_version, correo: codigo.correo_destinatario });
      expect(transporte.intentos[0].texto).toContain(secreto);
      expect(JSON.stringify({ resultado, consulta, filas: await estado(segunda) })).not.toContain(secreto);
      expect(await procesador.procesarUno()).toBeNull();
      reloj.avanzar(60000);
      // Nueva instancia y otra conexión: el reintento se recupera desde la bandeja durable.
      const reiniciado = new ProcesadorCorreoService(segunda, transporte, derivador, reloj);
      expect(await reiniciado.procesarUno()).toMatchObject({ estado: 'enviado', intentos: 2 });
      expect(transporte.intentos[1].texto).toBe(transporte.intentos[0].texto);
      expect(await estado(db, false)).toEqual(dominioAntes);
      expect(await reiniciado.procesarUno()).toBeNull();
      expect(transporte.intentos).toHaveLength(2);
    });
  });
});
