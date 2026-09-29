import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { conBaseMigrada } from './support/mariadb';
import { prepararInvitacion, reconstruirCodigo, estadoIdentidad, derivadorPrueba, passwordPrueba } from './support/invitaciones-fase-2';
import { ProcesadorCorreoService } from '../src/correos/procesador-correo.service';
import { TransporteCorreoControlado } from '../src/correos/transporte-correo-controlado';
import { RelojPrueba } from './support/reloj';

describe('M1-T040: recuperación entregada por correo', () => {
  it('encola 30 minutos sin devolver código y permite recuperar conservando suspensión e inactividad', async () => {
    await conBaseMigrada(async (db) => {
      const ctx = await prepararInvitacion(db);
      await ctx.activaciones.activarAdministrador(ctx.activar);
      const [admin] = await db.query("SELECT id FROM usuarios WHERE rol = 'admin_negocio'");
      await db.query('UPDATE usuarios SET activo = 0 WHERE id = ?', [admin.id]);
      await db.query('UPDATE licencias SET suspendida_en = ?', [ctx.activar.ahora]);
      const antes = await estadoIdentidad(db);
      const resultado = await ctx.credenciales.autorizarRecuperacion({ actorUsuarioId: ctx.actor.id,
        administradorId: admin.id, ahora: ctx.activar.ahora });
      expect(resultado).toMatchObject({ estadoEnvio: 'pendiente', expiraEn: new Date(ctx.activar.ahora.getTime() + 1800000) });
      expect(resultado).not.toHaveProperty('codigo');
      const codigo = await reconstruirCodigo(db);
      const smtp = new TransporteCorreoControlado();
      const procesador = new ProcesadorCorreoService(db, smtp, derivadorPrueba, new RelojPrueba(ctx.activar.ahora));
      expect((await procesador.procesarUno())!.estado).toBe('descartado'); // Activación ya consumida.
      expect((await procesador.procesarUno())!.estado).toBe('enviado');
      expect(smtp.intentos[0].texto).toContain(codigo);
      await ctx.credenciales.recuperarContrasena({ codigo, nuevaPassword: passwordPrueba + '-nueva', ahora: ctx.activar.ahora });
      const despues = await estadoIdentidad(db);
      expect(despues.licencias).toEqual(antes.licencias);
      expect(despues.usuarios.find((u: { id: number }) => u.id === admin.id).activo).toBe(0);
      expect(JSON.stringify({ resultado, envios: despues.envios_correo, audit: despues.eventos_auditoria })).not.toContain(codigo);
    });
  });
  it('reemplaza el código y trabajo anterior; el vencimiento exacto se rechaza sin consumo', async () => {
    await conBaseMigrada(async (db) => {
      const ctx = await prepararInvitacion(db);
      await ctx.activaciones.activarAdministrador(ctx.activar);
      const [admin] = await db.query("SELECT id FROM usuarios WHERE rol = 'admin_negocio'");
      const datos = { actorUsuarioId: ctx.actor.id, administradorId: admin.id, ahora: ctx.activar.ahora };
      await ctx.credenciales.autorizarRecuperacion(datos);
      const anterior = await reconstruirCodigo(db);
      const ultimo = await ctx.credenciales.autorizarRecuperacion({ ...datos, ahora: new Date(datos.ahora.getTime() + 1000) });
      expect(ultimo).not.toHaveProperty('codigo');
      await expect(ctx.credenciales.recuperarContrasena({ codigo: anterior, nuevaPassword: passwordPrueba, ahora: datos.ahora }))
        .rejects.toBeInstanceOf(BadRequestException);
      const antes = await estadoIdentidad(db);
      await expect(ctx.credenciales.recuperarContrasena({ codigo: await reconstruirCodigo(db), nuevaPassword: passwordPrueba,
        ahora: ultimo.expiraEn })).rejects.toBeInstanceOf(BadRequestException);
      expect(await estadoIdentidad(db)).toEqual(antes);
      expect(antes.envios_correo[1].estado).toBe('descartado');
    });
  });
  it.each(['recepcionista', 'profesional'])('no emite para %s y revalida al actor inactivo', async (rol) => {
    await conBaseMigrada(async (db) => {
      const ctx = await prepararInvitacion(db);
      await ctx.activaciones.activarAdministrador(ctx.activar);
      const [admin] = await db.query("SELECT id FROM usuarios WHERE rol = 'admin_negocio'");
      await db.query('UPDATE usuarios SET rol = ? WHERE id = ?', [rol, admin.id]);
      const datos = { actorUsuarioId: ctx.actor.id, administradorId: admin.id, ahora: ctx.activar.ahora };
      const antes = await estadoIdentidad(db);
      await expect(ctx.credenciales.autorizarRecuperacion(datos)).rejects.toBeInstanceOf(ForbiddenException);
      expect(await estadoIdentidad(db)).toEqual(antes);
      await db.query("UPDATE usuarios SET rol = 'admin_negocio' WHERE id = ?", [admin.id]);
      await db.query('UPDATE usuarios SET activo = 0 WHERE id = ?', [ctx.actor.id]);
      await expect(ctx.credenciales.autorizarRecuperacion(datos)).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
