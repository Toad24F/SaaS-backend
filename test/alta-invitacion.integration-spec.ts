import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AltasService } from '../src/altas/altas.service';
import { AltaAdministrador } from '../src/altas/entities/alta-administrador.entity';
import { CorreoAcceso } from '../src/altas/entities/correo-acceso.entity';
import { ReservaCorreoService } from '../src/altas/reserva-correo.service';
import { AuditoriaService } from '../src/auditoria/auditoria.service';
import { EventoAuditoria } from '../src/auditoria/entities/evento-auditoria.entity';
import { AutorizacionService } from '../src/auth/services/autorizacion.service';
import { Rol } from '../src/auth/enums/rol.enum';
import { CodigosService } from '../src/codigos/codigos.service';
import { DerivadorCodigo } from '../src/codigos/derivador-codigo';
import { CodigoAcceso } from '../src/codigos/entities/codigo-acceso.entity';
import { BandejaCorreoService } from '../src/correos/bandeja-correo.service';
import { EnvioCorreo } from '../src/correos/entities/envio-correo.entity';
import { Licencia } from '../src/licencias/entities/licencia.entity';
import { Negocio } from '../src/negocios/entities/negocio.entity';
import { Usuario } from '../src/usuarios/entities/usuario.entity';
import { conBaseMigrada } from './support/mariadb';

// Clave aislada: la prueba no carga credenciales ni entrega correos reales.
const derivador = new DerivadorCodigo({ 1: 'clave-aislada-t035-1234567890123456789012' }, 1);
const ahora = new Date('2026-09-30T18:00:00Z');
const datos = { nombre: ' Clínica ', identificadorPublico: ' CLINICA ',
  emailAdministrador: ' ADMIN@EXAMPLE.TEST ', rfc: ' abc010101ab1 ', ahora };
function servicio(db: DataSource) {
  const auditoria = new AuditoriaService();
  return new AltasService(db.getRepository(Negocio), new AutorizacionService(),
    new CodigosService(auditoria, derivador), auditoria,
    new ReservaCorreoService(), new BandejaCorreoService());
}
async function actor(db: DataSource) {
  return db.getRepository(Usuario).save({ negocioId: null, nombre: 'Super',
    email: 'super@example.test', passwordHash: 'hash', rol: Rol.SUPERADMIN,
    // La activación y la creación comparten el reloj fijo de la prueba.
    activo: true, creadoEn: ahora, activadoEn: ahora });
}

describe('M1-T035: alta mediante invitación sin cuenta', () => {
  it.each([undefined, 3])('confirma todos los registros sin usuario ni código en respuesta, cupo=%s', async (limiteSucursales) => {
    await conBaseMigrada(async (db) => {
      const superadmin = await actor(db);
      const resultado = await servicio(db).crearNegocio({ ...datos, limiteSucursales, actorUsuarioId: superadmin.id });
      expect(resultado).toEqual({ negocioId: expect.any(Number), altaAdministradorId: expect.any(Number),
        licenciaId: expect.any(Number), envioId: expect.any(String), estadoEnvio: 'pendiente',
        expiraEn: new Date('2026-10-02T18:00:00Z') });
      const negocio = await db.getRepository(Negocio).findOneByOrFail({ id: resultado.negocioId });
      expect(negocio).toMatchObject({ nombre: 'Clínica', slug: 'clinica', rfc: 'ABC010101AB1',
        correoAdministrador: 'admin@example.test', limiteSucursalesActivas: limiteSucursales ?? 1, activadoEn: null });
      expect(await db.getRepository(Usuario).count()).toBe(1);
      expect(await db.getRepository(Licencia).findOneByOrFail({ id: resultado.licenciaId }))
        .toMatchObject({ negocioId: negocio.id, habilitadaEn: null, venceEn: null, suspendidaEn: null });
      expect(await db.getRepository(AltaAdministrador).findOneByOrFail({ id: resultado.altaAdministradorId }))
        .toMatchObject({ negocioId: negocio.id, correo: 'admin@example.test', correoVersion: 1,
          estado: 'pendiente', usuarioCreadoId: null, activadoEn: null });
      expect(await db.getRepository(CorreoAcceso).findOneByOrFail({ altaAdministradorId: resultado.altaAdministradorId }))
        .toMatchObject({ correo: 'admin@example.test', usuarioId: null });
      const codigo = await db.getRepository(CodigoAcceso).findOneByOrFail({ altaAdministradorId: resultado.altaAdministradorId });
      expect(codigo).toMatchObject({ negocioId: negocio.id, usuarioId: null, legadoFase1: false,
        correoDestinatario: 'admin@example.test', expiraEn: resultado.expiraEn });
      expect(await db.getRepository(EnvioCorreo).findOneByOrFail({ id: resultado.envioId }))
        .toMatchObject({ negocioId: negocio.id, codigoAccesoId: codigo.id, estado: 'pendiente', intentos: 0 });
      const eventos = await db.getRepository(EventoAuditoria).find({ where: { negocioId: negocio.id }, order: { id: 'ASC' } });
      expect(eventos.map(({ accion }) => accion)).toEqual(['codigo_emitido', 'negocio_creado']);
      expect(eventos.every((evento) => evento.usuarioId === null && evento.altaAdministradorId === resultado.altaAdministradorId)).toBe(true);
      const secreto = derivador.derivar({ emisionId: codigo.emisionId!, nonce: codigo.nonce!, claveVersion: codigo.claveVersion!,
        proposito: codigo.proposito, negocioId: negocio.id, destinatarioTipo: 'alta',
        destinatarioId: resultado.altaAdministradorId, destinatarioVersion: 1, correo: 'admin@example.test' });
      expect(JSON.stringify({ resultado, eventos, envios: await db.getRepository(EnvioCorreo).find() })).not.toContain(secreto);
    });
  });

  it.each([0, -1, 1.5, 4294967296])('rechaza cupo inválido %s sin escribir', async (limiteSucursales) => {
    await conBaseMigrada(async (db) => {
      const superadmin = await actor(db);
      await expect(servicio(db).crearNegocio({ ...datos, actorUsuarioId: superadmin.id, limiteSucursales }))
        .rejects.toBeInstanceOf(BadRequestException);
      expect(await db.getRepository(Negocio).count()).toBe(0);
    });
  });

  it('rechaza RFC ausente y actor inactivo sin crear negocio', async () => {
    await conBaseMigrada(async (db) => {
      const superadmin = await actor(db);
      await expect(servicio(db).crearNegocio({ ...datos, rfc: '', actorUsuarioId: superadmin.id }))
        .rejects.toBeInstanceOf(BadRequestException);
      await db.getRepository(Usuario).update(superadmin.id, { activo: false });
      await expect(servicio(db).crearNegocio({ ...datos, actorUsuarioId: superadmin.id }))
        .rejects.toBeInstanceOf(ForbiddenException);
      expect(await db.getRepository(Negocio).count()).toBe(0);
    });
  });
});
