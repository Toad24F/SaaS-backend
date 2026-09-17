import { BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { IsNull } from 'typeorm';
import { AuditoriaService } from '../src/auditoria/auditoria.service';
import { EventoAuditoria } from '../src/auditoria/entities/evento-auditoria.entity';
import { AuthService } from '../src/auth/auth.service';
import { AutorizacionService } from '../src/auth/services/autorizacion.service';
import { CredencialesService } from '../src/auth/services/credenciales.service';
import { PoliticaContrasenasService } from '../src/auth/services/politica-contrasenas.service';
import { SesionesService } from '../src/auth/services/sesiones.service';
import { Sesion } from '../src/auth/entities/sesion.entity';
import { CodigoAcceso, PropositoCodigoAcceso } from '../src/codigos/entities/codigo-acceso.entity';
import { CodigosService } from '../src/codigos/codigos.service';
import { Licencia } from '../src/licencias/entities/licencia.entity';
import { CalendarioLicenciasService } from '../src/licencias/services/calendario-licencias.service';
import { PoliticaAccesoLicenciaService } from '../src/licencias/services/politica-acceso-licencia.service';
import { Negocio } from '../src/negocios/entities/negocio.entity';
import { Usuario } from '../src/usuarios/entities/usuario.entity';
import { UsuariosService } from '../src/usuarios/usuarios.service';
import { conBaseMigrada } from './support/mariadb';
import { crearActivo, crearPendiente, crearSuperadmin, fechaSegura, PASSWORD_T51_T60, servicios } from './support/escenarios-t51-t60';

function siguiente(ahora: Date, ms = 1000) { return new Date(ahora.getTime() + ms); }

describe('T52–T57 — concurrencia y rollback con dos conexiones MariaDB', () => {
  it('T52 consume una activación concurrente exactamente una vez', async () => {
    await conBaseMigrada(async (primera, segunda) => {
      const ahora = fechaSegura();
      const actor = await crearSuperadmin(primera, ahora);
      const alta = await crearPendiente(primera, actor.id, ahora);
      const activar = (db: typeof primera) => servicios(db).activaciones.activarAdministrador({
        codigo: alta.codigo, nombre: 'Administrador', password: PASSWORD_T51_T60,
        ahora: siguiente(ahora),
      });
      // Dos pools compiten por la misma cuenta y el mismo código de un solo uso.
      const resultados = await Promise.allSettled([activar(primera), activar(segunda)]);
      expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(resultados.filter((r) => r.status === 'rejected')).toHaveLength(1);
      expect((await primera.getRepository(CodigoAcceso).findOneByOrFail({ usuarioId: alta.administradorId })).consumidoEn)
        .toEqual(siguiente(ahora));
      expect((await primera.getRepository(Usuario).findOneByOrFail({ id: alta.administradorId })).activadoEn)
        .toEqual(siguiente(ahora));
      expect((await primera.getRepository(Negocio).findOneByOrFail({ id: alta.negocioId })).activadoEn)
        .toEqual(siguiente(ahora));
      expect((await primera.getRepository(Licencia).findOneByOrFail({ id: alta.licenciaId })).habilitadaEn)
        .toEqual(siguiente(ahora));
      expect(await primera.getRepository(EventoAuditoria).countBy({
        usuarioId: alta.administradorId, accion: 'administrador_activado',
      })).toBe(1);
      expect(await primera.getRepository(Usuario).countBy({ negocioId: alta.negocioId })).toBe(1);
    });
  });

  it('T53 reemplazo primero invalida el código inicial; activación primero impide reemisión', async () => {
    await conBaseMigrada(async (primera, segunda) => {
      const ahora = fechaSegura();
      const actor = await crearSuperadmin(primera, ahora);
      const reemplazoPrimero = await crearPendiente(primera, actor.id, ahora);
      const nuevo = await servicios(segunda).altas.reemitirCodigoInicial({
        actorUsuarioId: actor.id, negocioId: reemplazoPrimero.negocioId, ahora: siguiente(ahora),
      });
      await expect(servicios(primera).activaciones.activarAdministrador({
        codigo: reemplazoPrimero.codigo, nombre: 'No activa', password: PASSWORD_T51_T60,
        ahora: siguiente(ahora, 2000),
      })).rejects.toBeInstanceOf(BadRequestException);
      expect((await primera.getRepository(Licencia).findOneByOrFail({ id: reemplazoPrimero.licenciaId })).habilitadaEn)
        .toBeNull();
      await servicios(primera).activaciones.activarAdministrador({
        codigo: nuevo.codigo, nombre: 'Sí activa', password: PASSWORD_T51_T60,
        ahora: siguiente(ahora, 2000),
      });

      const activacionPrimero = await crearPendiente(primera, actor.id, ahora);
      await servicios(primera).activaciones.activarAdministrador({
        codigo: activacionPrimero.codigo, nombre: 'Primero', password: PASSWORD_T51_T60,
        ahora: siguiente(ahora),
      });
      await expect(servicios(segunda).altas.reemitirCodigoInicial({
        actorUsuarioId: actor.id, negocioId: activacionPrimero.negocioId, ahora: siguiente(ahora, 2000),
      })).rejects.toBeInstanceOf(ConflictException);
      expect(await primera.getRepository(CodigoAcceso).countBy({
        usuarioId: activacionPrimero.administradorId,
      })).toBe(1);
    });
  });

  it('T53 recuperación reemplazada no puede consumir el código anterior', async () => {
    await conBaseMigrada(async (primera, segunda) => {
      const ahora = fechaSegura();
      const actor = await crearSuperadmin(primera, ahora);
      const tenant = await crearActivo(primera, actor.id, ahora);
      const anterior = await servicios(primera).credenciales.autorizarRecuperacion({
        actorUsuarioId: actor.id, administradorId: tenant.administradorId, ahora: siguiente(ahora, 2000),
      });
      const nuevo = await servicios(segunda).credenciales.autorizarRecuperacion({
        actorUsuarioId: actor.id, administradorId: tenant.administradorId, ahora: siguiente(ahora, 3000),
      });
      await expect(servicios(primera).credenciales.recuperarContrasena({
        codigo: anterior.codigo, nuevaPassword: 'password-nueva-t53', ahora: siguiente(ahora, 4000),
      })).rejects.toBeInstanceOf(BadRequestException);
      await servicios(segunda).credenciales.recuperarContrasena({
        codigo: nuevo.codigo, nuevaPassword: 'password-nueva-t53', ahora: siguiente(ahora, 4000),
      });
      const usuario = await primera.getRepository(Usuario).findOneByOrFail({ id: tenant.administradorId });
      await expect(new PoliticaContrasenasService().comparar('password-nueva-t53', usuario.passwordHash!))
        .resolves.toBe(true);
      expect(await primera.getRepository(CodigoAcceso).countBy({
        usuarioId: usuario.id, proposito: PropositoCodigoAcceso.RECUPERACION,
      })).toBe(2);
    });
  });

  it('T53 reemplazo y consumo inicial simultáneos equivalen a uno de dos órdenes seriales', async () => {
    await conBaseMigrada(async (primera, segunda) => {
      const ahora = fechaSegura();
      const actor = await crearSuperadmin(primera, ahora);
      const pendiente = await crearPendiente(primera, actor.id, ahora);
      const resultado = await Promise.allSettled([
        servicios(primera).activaciones.activarAdministrador({
          codigo: pendiente.codigo, nombre: 'Concurrente', password: PASSWORD_T51_T60,
          ahora: siguiente(ahora),
        }),
        servicios(segunda).altas.reemitirCodigoInicial({
          actorUsuarioId: actor.id, negocioId: pendiente.negocioId, ahora: siguiente(ahora),
        }),
      ]);
      expect(resultado.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const codigos = await primera.getRepository(CodigoAcceso).find({
        where: { usuarioId: pendiente.administradorId }, order: { id: 'ASC' },
      });
      const codigo = codigos[0];
      const admin = await primera.getRepository(Usuario).findOneByOrFail({ id: pendiente.administradorId });
      if (resultado[0].status === 'fulfilled') {
        expect(admin.activadoEn).not.toBeNull();
        expect(codigo.consumidoEn).not.toBeNull();
        expect(await primera.getRepository(CodigoAcceso).countBy({ usuarioId: admin.id })).toBe(1);
      } else {
        expect(admin.activadoEn).toBeNull();
        expect(codigo.invalidadoEn).not.toBeNull();
        expect(await primera.getRepository(CodigoAcceso).countBy({ usuarioId: admin.id })).toBe(2);
      }
    });
  });

  it('T53 reemplazo y consumo de recuperación simultáneos no aceptan un código invalidado', async () => {
    await conBaseMigrada(async (primera, segunda) => {
      const ahora = fechaSegura();
      const actor = await crearSuperadmin(primera, ahora);
      const tenant = await crearActivo(primera, actor.id, ahora);
      const inicial = await servicios(primera).credenciales.autorizarRecuperacion({
        actorUsuarioId: actor.id, administradorId: tenant.administradorId, ahora: siguiente(ahora, 2000),
      });
      const resultados = await Promise.allSettled([
        servicios(primera).credenciales.recuperarContrasena({
          codigo: inicial.codigo, nuevaPassword: 'password-recuperada-t53',
          ahora: siguiente(ahora, 3000),
        }),
        servicios(segunda).credenciales.autorizarRecuperacion({
          actorUsuarioId: actor.id, administradorId: tenant.administradorId,
          ahora: siguiente(ahora, 3000),
        }),
      ]);
      expect(resultados[1].status).toBe('fulfilled');
      const codigos = await primera.getRepository(CodigoAcceso).find({
        where: { usuarioId: tenant.administradorId, proposito: PropositoCodigoAcceso.RECUPERACION },
        order: { id: 'ASC' },
      });
      expect(codigos).toHaveLength(2);
      expect(codigos[0].consumidoEn === null).not.toBe(codigos[0].invalidadoEn === null);
      const usuario = await primera.getRepository(Usuario).findOneByOrFail({ id: tenant.administradorId });
      const usaNueva = await new PoliticaContrasenasService().comparar('password-recuperada-t53', usuario.passwordHash!);
      expect(usaNueva).toBe(resultados[0].status === 'fulfilled');
      await expect(servicios(segunda).credenciales.recuperarContrasena({
        codigo: inicial.codigo, nuevaPassword: 'password-otra-t53', ahora: siguiente(ahora, 4000),
      })).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  it('T54 un login iniciado con clave antigua no deja sesión válida tras cambiarla', async () => {
    await conBaseMigrada(async (primera, segunda) => {
      const ahora = fechaSegura();
      const actor = await crearSuperadmin(primera, ahora);
      const tenant = await crearActivo(primera, actor.id, ahora);
      const instante = siguiente(ahora, 3000);
      const politica = new PoliticaContrasenasService();
      const compararOriginal = politica.comparar.bind(politica);
      let liberar!: () => void;
      let aviso!: () => void;
      const retenido = new Promise<void>((resolver) => { liberar = resolver; });
      const llegoAComparacion = new Promise<void>((resolver) => { aviso = resolver; });
      jest.spyOn(politica, 'comparar').mockImplementation(async (clave, hash) => {
        const resultado = await compararOriginal(clave, hash);
        aviso();
        await retenido;
        return resultado;
      });
      const login = new AuthService(
        new UsuariosService(primera.getRepository(Usuario)),
        new JwtService({ secret: 'secreto-test-t54' }), politica,
        new SesionesService(primera.getRepository(Sesion)), primera.getRepository(Licencia),
        new PoliticaAccesoLicenciaService(), { ahora: () => instante },
      );
      // Pausa después de comparar el hash antiguo para forzar el intercalado peligroso.
      const intento = login.login({ email: tenant.administrador.email, password: PASSWORD_T51_T60 });
      await llegoAComparacion;
      await servicios(segunda).credenciales.cambiarContrasena({
        usuarioId: tenant.administradorId, passwordActual: PASSWORD_T51_T60,
        nuevaPassword: 'password-nueva-t54', ahora: instante,
      });
      liberar();
      const resultado = await Promise.allSettled([intento]);
      if (resultado[0].status === 'rejected') {
        expect(resultado[0].reason).toBeInstanceOf(UnauthorizedException);
      }
      expect(await primera.getRepository(Sesion).countBy({
        usuarioId: tenant.administradorId, revocadaEn: IsNull(),
      })).toBe(0);
    });
  });

  it('T54 recuperación concurrente también impide una sesión con clave anterior', async () => {
    await conBaseMigrada(async (primera, segunda) => {
      const ahora = fechaSegura();
      const actor = await crearSuperadmin(primera, ahora);
      const tenant = await crearActivo(primera, actor.id, ahora);
      const recuperacion = await servicios(segunda).credenciales.autorizarRecuperacion({
        actorUsuarioId: actor.id, administradorId: tenant.administradorId,
        ahora: siguiente(ahora, 2000),
      });
      const instante = siguiente(ahora, 3000);
      const politica = new PoliticaContrasenasService();
      const compararOriginal = politica.comparar.bind(politica);
      let liberar!: () => void;
      let aviso!: () => void;
      const retenido = new Promise<void>((resolver) => { liberar = resolver; });
      const comparado = new Promise<void>((resolver) => { aviso = resolver; });
      jest.spyOn(politica, 'comparar').mockImplementation(async (clave, hash) => {
        const resultado = await compararOriginal(clave, hash);
        aviso();
        await retenido;
        return resultado;
      });
      const login = new AuthService(new UsuariosService(primera.getRepository(Usuario)),
        new JwtService({ secret: 'secreto-test-t54' }), politica,
        new SesionesService(primera.getRepository(Sesion)), primera.getRepository(Licencia),
        new PoliticaAccesoLicenciaService(), { ahora: () => instante });
      const intento = login.login({ email: tenant.administrador.email, password: PASSWORD_T51_T60 });
      await comparado;
      await servicios(segunda).credenciales.recuperarContrasena({
        codigo: recuperacion.codigo, nuevaPassword: 'password-recuperada-t54', ahora: instante,
      });
      liberar();
      await expect(intento).rejects.toBeInstanceOf(UnauthorizedException);
      expect(await primera.getRepository(Sesion).countBy({
        usuarioId: tenant.administradorId, revocadaEn: IsNull(),
      })).toBe(0);
    });
  });

  it('T55 doble suspensión/reactivación conserva una pausa y un evento por transición', async () => {
    await conBaseMigrada(async (primera, segunda) => {
      const ahora = fechaSegura();
      const actor = await crearSuperadmin(primera, ahora);
      const tenant = await crearActivo(primera, actor.id, ahora);
      const pausa = siguiente(ahora, 5000);
      const retorno = siguiente(ahora, 100_000);
      await Promise.all([
        servicios(primera).licencias.suspender(actor.id, tenant.licenciaId, pausa),
        servicios(segunda).licencias.suspender(actor.id, tenant.licenciaId, siguiente(pausa, 1000)),
      ]);
      const suspendidaEn = (await primera.getRepository(Licencia).findOneByOrFail({ id: tenant.licenciaId })).suspendidaEn;
      expect([pausa.getTime(), siguiente(pausa, 1000).getTime()]).toContain(suspendidaEn!.getTime());
      await Promise.all([
        servicios(primera).licencias.reactivar(actor.id, tenant.licenciaId, retorno),
        servicios(segunda).licencias.reactivar(actor.id, tenant.licenciaId, siguiente(retorno, 1000)),
      ]);
      const reactivacion = (await primera.getRepository(EventoAuditoria).findOneByOrFail({
        licenciaId: tenant.licenciaId, accion: 'licencia_reactivada',
      })).valoresDespues;
      const vencimiento = (await primera.getRepository(Licencia).findOneByOrFail({ id: tenant.licenciaId })).venceEn;
      expect(vencimiento).toEqual(new Date(reactivacion!.venceEn as string));
      expect([retorno.getTime(), siguiente(retorno, 1000).getTime()]).toContain(
        vencimiento!.getTime() - tenant.licencia.venceEn!.getTime() + suspendidaEn!.getTime(),
      );
      expect(await primera.getRepository(EventoAuditoria).countBy({
        licenciaId: tenant.licenciaId, accion: 'licencia_suspendida',
      })).toBe(1);
      expect(await primera.getRepository(EventoAuditoria).countBy({
        licenciaId: tenant.licenciaId, accion: 'licencia_reactivada',
      })).toBe(1);
    });
  });

  it('T56 dos renovaciones concurrentes acumulan dos años sin perder auditoría', async () => {
    await conBaseMigrada(async (primera, segunda) => {
      const ahora = fechaSegura();
      const actor = await crearSuperadmin(primera, ahora);
      const tenant = await crearActivo(primera, actor.id, ahora);
      await Promise.all([
        servicios(primera).licencias.renovar(actor.id, tenant.licenciaId, siguiente(ahora, 3000)),
        servicios(segunda).licencias.renovar(actor.id, tenant.licenciaId, siguiente(ahora, 3000)),
      ]);
      const calendario = new CalendarioLicenciasService();
      expect((await primera.getRepository(Licencia).findOneByOrFail({ id: tenant.licenciaId })).venceEn)
        .toEqual(calendario.sumarAnios(calendario.sumarAnios(tenant.licencia.venceEn!)));
      expect(await primera.getRepository(EventoAuditoria).countBy({
        licenciaId: tenant.licenciaId, accion: 'licencia_renovada',
      })).toBe(2);
    });
  });

  it('T56 renovación cruzada con suspensión/reactivación conserva un resultado serial', async () => {
    await conBaseMigrada(async (primera, segunda) => {
      const ahora = fechaSegura();
      const actor = await crearSuperadmin(primera, ahora);
      const tenant = await crearActivo(primera, actor.id, ahora);
      const pausa = siguiente(ahora, 4000);
      const reactivacion = siguiente(ahora, 100_000);
      const calendario = new CalendarioLicenciasService();
      await Promise.all([
        servicios(primera).licencias.suspender(actor.id, tenant.licenciaId, pausa),
        servicios(segunda).licencias.renovar(actor.id, tenant.licenciaId, pausa),
      ]);
      const suspendida = await primera.getRepository(Licencia).findOneByOrFail({ id: tenant.licenciaId });
      expect(suspendida).toMatchObject({ suspendidaEn: pausa,
        venceEn: calendario.sumarAnios(tenant.licencia.venceEn!) });
      await Promise.all([
        servicios(primera).licencias.reactivar(actor.id, tenant.licenciaId, reactivacion),
        servicios(segunda).licencias.renovar(actor.id, tenant.licenciaId, reactivacion),
      ]);
      const actual = await primera.getRepository(Licencia).findOneByOrFail({ id: tenant.licenciaId });
      const duracion = reactivacion.getTime() - pausa.getTime();
      const primeroRenovar = new Date(calendario.sumarAnios(suspendida.venceEn!).getTime() + duracion);
      const primeroReactivar = calendario.sumarAnios(new Date(suspendida.venceEn!.getTime() + duracion));
      expect([primeroRenovar.getTime(), primeroReactivar.getTime()]).toContain(actual.venceEn!.getTime());
      expect(actual.suspendidaEn).toBeNull();
      expect(await primera.getRepository(EventoAuditoria).countBy({
        licenciaId: tenant.licenciaId, accion: 'licencia_renovada',
      })).toBe(2);
      expect(await primera.getRepository(EventoAuditoria).countBy({
        licenciaId: tenant.licenciaId, accion: 'licencia_suspendida',
      })).toBe(1);
      expect(await primera.getRepository(EventoAuditoria).countBy({
        licenciaId: tenant.licenciaId, accion: 'licencia_reactivada',
      })).toBe(1);
    });
  });

  it('T57 fallo de auditoría revierte alta, activación, recuperación y licencia', async () => {
    await conBaseMigrada(async (primera) => {
      const ahora = fechaSegura();
      const actor = await crearSuperadmin(primera, ahora);
      const auditoria = new AuditoriaService();
      const fallo = () => jest.spyOn(auditoria, 'registrar').mockRejectedValueOnce(new Error('Fallo controlado T57'));
      const antes = { negocios: await primera.getRepository(Negocio).count(),
        usuarios: await primera.getRepository(Usuario).count(), licencias: await primera.getRepository(Licencia).count(),
        codigos: await primera.getRepository(CodigoAcceso).count(), eventos: await primera.getRepository(EventoAuditoria).count() };
      let espia = fallo();
      try {
        await expect(servicios(primera, auditoria).altas.crearNegocio({
          actorUsuarioId: actor.id, nombre: 'Rollback', identificadorPublico: 'rollback-t57',
          emailAdministrador: 'rollback-t57@example.test', ahora,
        })).rejects.toThrow('Fallo controlado T57');
      } finally { espia.mockRestore(); }
      expect({ negocios: await primera.getRepository(Negocio).count(),
        usuarios: await primera.getRepository(Usuario).count(), licencias: await primera.getRepository(Licencia).count(),
        codigos: await primera.getRepository(CodigoAcceso).count(), eventos: await primera.getRepository(EventoAuditoria).count() })
        .toEqual(antes);

      const pendiente = await crearPendiente(primera, actor.id, ahora);
      const previo = await primera.getRepository(CodigoAcceso).findOneByOrFail({ usuarioId: pendiente.administradorId });
      espia = jest.spyOn(auditoria, 'registrar').mockImplementation(async (_manager, datos) => {
        if (datos.accion === 'administrador_activado') throw new Error('Fallo controlado T57');
        return new AuditoriaService().registrar(_manager, datos);
      });
      try {
        await expect(servicios(primera, auditoria).activaciones.activarAdministrador({
          codigo: pendiente.codigo, nombre: 'Rollback', password: PASSWORD_T51_T60,
          ahora: siguiente(ahora),
        })).rejects.toThrow('Fallo controlado T57');
      } finally { espia.mockRestore(); }
      expect((await primera.getRepository(CodigoAcceso).findOneByOrFail({ id: previo.id })).consumidoEn).toBeNull();
      expect((await primera.getRepository(Usuario).findOneByOrFail({ id: pendiente.administradorId })).activadoEn).toBeNull();
      expect((await primera.getRepository(Licencia).findOneByOrFail({ id: pendiente.licenciaId })).habilitadaEn).toBeNull();

      await servicios(primera).activaciones.activarAdministrador({
        codigo: pendiente.codigo, nombre: 'Activo', password: PASSWORD_T51_T60,
        ahora: siguiente(ahora),
      });
      const licenciaAntes = await primera.getRepository(Licencia).findOneByOrFail({ id: pendiente.licenciaId });
      espia = fallo();
      try {
        await expect(servicios(primera, auditoria).licencias.suspender(
          actor.id, pendiente.licenciaId, siguiente(ahora, 2000),
        )).rejects.toThrow('Fallo controlado T57');
      } finally { espia.mockRestore(); }
      expect(await primera.getRepository(Licencia).findOneByOrFail({ id: pendiente.licenciaId }))
        .toMatchObject({ suspendidaEn: null, venceEn: licenciaAntes.venceEn });

      await servicios(primera).licencias.suspender(actor.id, pendiente.licenciaId, siguiente(ahora, 2000));
      const licenciaPausada = await primera.getRepository(Licencia).findOneByOrFail({ id: pendiente.licenciaId });
      espia = fallo();
      try {
        await expect(servicios(primera, auditoria).licencias.reactivar(
          actor.id, pendiente.licenciaId, siguiente(ahora, 3000),
        )).rejects.toThrow('Fallo controlado T57');
      } finally { espia.mockRestore(); }
      expect(await primera.getRepository(Licencia).findOneByOrFail({ id: pendiente.licenciaId }))
        .toMatchObject({ suspendidaEn: licenciaPausada.suspendidaEn, venceEn: licenciaPausada.venceEn });
      espia = fallo();
      try {
        await expect(servicios(primera, auditoria).licencias.renovar(
          actor.id, pendiente.licenciaId, siguiente(ahora, 3000),
        )).rejects.toThrow('Fallo controlado T57');
      } finally { espia.mockRestore(); }
      expect(await primera.getRepository(Licencia).findOneByOrFail({ id: pendiente.licenciaId }))
        .toMatchObject({ suspendidaEn: licenciaPausada.suspendidaEn, venceEn: licenciaPausada.venceEn });

      const recuperacion = await servicios(primera).credenciales.autorizarRecuperacion({
        actorUsuarioId: actor.id, administradorId: pendiente.administradorId,
        ahora: siguiente(ahora, 4000),
      });
      const usuarioAntes = await primera.getRepository(Usuario).findOneByOrFail({ id: pendiente.administradorId });
      const codigoRecuperacion = await primera.getRepository(CodigoAcceso).findOneByOrFail({
        usuarioId: pendiente.administradorId, proposito: PropositoCodigoAcceso.RECUPERACION,
      });
      const sesiones = servicios(primera).sesiones;
      const revocar = jest.spyOn(sesiones, 'revocarTodasConManager')
        .mockRejectedValueOnce(new Error('Fallo controlado T57'));
      try {
        // Inyectar el fallo tras actualizar el hash demuestra rollback del consumo.
        const credenciales = new CredencialesService(primera.getRepository(Usuario),
          new CodigosService(auditoria), new AutorizacionService(),
          new PoliticaContrasenasService(), sesiones, auditoria);
        await expect(credenciales.recuperarContrasena({
          codigo: recuperacion.codigo, nuevaPassword: 'password-nueva-t57',
          ahora: siguiente(ahora, 5000),
        })).rejects.toThrow('Fallo controlado T57');
      } finally { revocar.mockRestore(); }
      expect((await primera.getRepository(Usuario).findOneByOrFail({ id: pendiente.administradorId })).passwordHash)
        .toBe(usuarioAntes.passwordHash);
      expect((await primera.getRepository(CodigoAcceso).findOneByOrFail({ id: codigoRecuperacion.id })).consumidoEn)
        .toBeNull();

      const sesionesCambio = servicios(primera).sesiones;
      const falloCambio = jest.spyOn(sesionesCambio, 'revocarTodasConManager')
        .mockRejectedValueOnce(new Error('Fallo controlado T57'));
      try {
        const credenciales = new CredencialesService(primera.getRepository(Usuario),
          new CodigosService(auditoria), new AutorizacionService(),
          new PoliticaContrasenasService(), sesionesCambio, auditoria);
        await expect(credenciales.cambiarContrasena({
          usuarioId: pendiente.administradorId, passwordActual: PASSWORD_T51_T60,
          nuevaPassword: 'password-cambiada-t57', ahora: siguiente(ahora, 6000),
        })).rejects.toThrow('Fallo controlado T57');
      } finally { falloCambio.mockRestore(); }
      expect((await primera.getRepository(Usuario).findOneByOrFail({ id: pendiente.administradorId })).passwordHash)
        .toBe(usuarioAntes.passwordHash);
    });
  });
});
