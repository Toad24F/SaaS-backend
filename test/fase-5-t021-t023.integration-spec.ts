import { Rol } from '../src/auth/enums/rol.enum';
import { AutorizacionService, Permiso } from '../src/auth/services/autorizacion.service';
import { Cita } from '../src/disponibilidad/entities/cita.entity';
import { Cliente } from '../src/disponibilidad/entities/cliente.entity';
import { Sesion } from '../src/auth/entities/sesion.entity';
import { Usuario } from '../src/usuarios/entities/usuario.entity';
import { Licencia } from '../src/licencias/entities/licencia.entity';
import { LicenciasService } from '../src/licencias/licencias.service';
import { CalendarioLicenciasService } from '../src/licencias/services/calendario-licencias.service';
import { PoliticaAccesoLicenciaService } from '../src/licencias/services/politica-acceso-licencia.service';
import { AuditoriaService } from '../src/auditoria/auditoria.service';
import { AccesoOperativoService } from '../src/citas/acceso-operativo.service';
import { conBaseOperativa } from './support/operacion-fase-5';
import { AHORA_OPERATIVO, crearAccesoOperativo, situarSesion } from './support/acceso-operativo';

const LEER = 'consultar_citas' as Permiso;
const ESCRIBIR = 'crear_cita_manual' as Permiso;
const DIA = 86_400_000;
const identidad = (u: { id: number; sesionId: string }) => ({ sub: u.id, sesionId: u.sesionId });
const servicio = (db: Parameters<typeof crearAccesoOperativo>[0], reloj: Awaited<ReturnType<typeof crearAccesoOperativo>>['reloj']) =>
  new AccesoOperativoService(db, new AutorizacionService(), new PoliticaAccesoLicenciaService(), reloj);

describe('M4-T021–T023: acceso operativo actual y aislado', () => {
  it('T021/T022 resuelve cada negocio y limita Profesional a citas/contacto/notas propios', async () => {
    await conBaseOperativa(async (db) => {
      const f = await crearAccesoOperativo(db);
      const acceso = servicio(db, f.reloj);
      for (const u of f.actores.filter((u) => u.rol !== Rol.SUPERADMIN)) {
        const tokenAntiguo = { ...identidad(u), rol: Rol.SUPERADMIN, negocioId: 999999 };
        const filas = await acceso.ejecutar(tokenAntiguo, LEER, async (ctx) => {
          expect(ctx.negocioId).toBe(u.negocioId);
          expect(ctx.rol).toBe(u.rol);
          return ctx.manager.getRepository(Cita).findBy(acceso.alcanceCitas(ctx));
        });
        expect(filas.every((c) => c.negocioId === u.negocioId)).toBe(true);
        if (u.rol === Rol.PROFESIONAL) {
          expect(filas.every((c) => c.personalId === u.id)).toBe(true);
          if (u.id === f.negocios[0].profesionales[0]) {
            expect(filas).toHaveLength(5);
            expect(filas[0]).toMatchObject({ nombreContacto: 'Paciente propio', telefonoContacto: '6141234567', motivoConsulta: 'Nota propia' });
            expect(JSON.stringify(filas)).not.toContain('Nota ajena');
          }
          await expect(acceso.ejecutar(identidad(u), ESCRIBIR, async () => { throw new Error('No debe ejecutarse'); }))
            .rejects.toMatchObject({ status: 403 });
          await expect(acceso.ejecutar(identidad(u), LEER, async (ctx) => ctx.manager.getRepository(Cliente).findBy(acceso.alcanceClientes(ctx))))
            .rejects.toMatchObject({ status: 403 });
        } else {
          expect(filas.length).toBeGreaterThanOrEqual(5);
          const clientes = await acceso.ejecutar(identidad(u), 'consultar_clientes' as Permiso,
            async (ctx) => ctx.manager.getRepository(Cliente).findBy(acceso.alcanceClientes(ctx)));
          expect(clientes.every((c) => c.negocioId === u.negocioId)).toBe(true);
          expect(clientes).toHaveLength(2);
          await expect(acceso.ejecutar(identidad(u), ESCRIBIR, async (ctx) => ctx.actorId)).resolves.toBe(u.id);
        }
      }
      await expect(acceso.ejecutar(identidad(f.superadmin), LEER, async () => 'no')).rejects.toMatchObject({ status: 403 });
    });
  });

  it('T021 relee rol y negocio después de cambiar la base, ignorando claims anteriores', async () => {
    await conBaseOperativa(async (db, segunda) => {
      const f = await crearAccesoOperativo(db);
      const acceso = servicio(db, f.reloj);
      const u = f.actores.find((u) => u.rol === Rol.PROFESIONAL)!;
      await expect(acceso.ejecutar(identidad(u), ESCRIBIR, async () => true)).rejects.toMatchObject({ status: 403 });
      await segunda.getRepository(Usuario).update({ id: u.id }, { rol: Rol.RECEPCIONISTA });
      await expect(acceso.ejecutar({ ...identidad(u), rol: Rol.PROFESIONAL } as never, ESCRIBIR, async (ctx) => ctx.rol)).resolves.toBe(Rol.RECEPCIONISTA);
      const recepcion = f.actores.find((u) => u.rol === Rol.RECEPCIONISTA)!;
      await segunda.getRepository(Usuario).update({ id: recepcion.id }, { negocioId: f.negocios[1].id });
      expect(await acceso.ejecutar({ ...identidad(recepcion), negocioId: f.negocios[0].id } as never, LEER, async (ctx) => ctx.negocioId))
        .toBe(f.negocios[1].id);
    });
  });

  it.each(['revocada', 'vencida', 'futura', 'cuenta_inactiva', 'cuenta_pendiente', 'negocio_pendiente', 'licencia_ausente'])
    ('T021 deniega %s aun con identidad anterior', async (caso) => {
      await conBaseOperativa(async (db) => {
        const f = await crearAccesoOperativo(db);
        const u = f.actores.find((u) => u.rol === Rol.ADMIN_NEGOCIO)!;
        const acceso = servicio(db, f.reloj);
        await expect(acceso.ejecutar(identidad(u), LEER, async () => true)).resolves.toBe(true);
        if (caso === 'revocada') await db.getRepository(Sesion).update({ id: u.sesionId }, { revocadaEn: f.reloj.ahora() });
        if (caso === 'vencida') f.reloj.avanzar(11 * 3_600_000);
        if (caso === 'futura') await situarSesion(db, u, new Date(f.reloj.ahora().getTime() + 2 * 3_600_000));
        if (caso === 'cuenta_inactiva') await db.getRepository(Usuario).update({ id: u.id }, { activo: false, inhabilitadoEn: f.reloj.ahora() });
        if (caso === 'cuenta_pendiente') await db.getRepository(Usuario).update({ id: u.id }, { nombre: null, passwordHash: null, activadoEn: null });
        if (caso === 'negocio_pendiente') await db.query('UPDATE negocios SET activado_en=NULL WHERE id=?', [u.negocioId]);
        if (caso === 'licencia_ausente') await db.getRepository(Licencia).delete({ negocioId: u.negocioId! });
        const callback = jest.fn(async () => true);
        await expect(acceso.ejecutar(identidad(u), LEER, callback)).rejects.toMatchObject({ status: 401 });
        expect(callback).not.toHaveBeenCalled();
      });
    });

  it.each([0, 1, undefined, 7, 30])('T023 aplica suspensión con plazo %s y sesión abierta en el límite exacto', async (plazo) => {
    await conBaseOperativa(async (db) => {
      const f = await crearAccesoOperativo(db);
      const u = f.actores.find((u) => u.rol === Rol.ADMIN_NEGOCIO)!;
      const acceso = servicio(db, f.reloj);
      const licencia = await db.getRepository(Licencia).findOneByOrFail({ negocioId: u.negocioId! });
      const licencias = new LicenciasService(db.getRepository(Licencia), new AutorizacionService(),
        new CalendarioLicenciasService(), new AuditoriaService());
      const limite = new Date(AHORA_OPERATIVO.getTime() + (plazo ?? 2) * DIA);
      await situarSesion(db, u, limite);
      // Con plazo cero la lectura anterior se observa antes de confirmar la suspensión inmediata.
      if (plazo === 0) {
        f.reloj.fijar(new Date(limite.getTime() - 1));
        await expect(acceso.ejecutar(identidad(u), LEER, async () => true)).resolves.toBe(true);
      }
      await licencias.suspender(f.superadmin.id, licencia.id, AHORA_OPERATIVO,
        `suspension_m4_${plazo ?? 'defecto'}_123456789`, plazo);
      if (plazo !== 0) {
        f.reloj.fijar(new Date(limite.getTime() - 1));
        await expect(acceso.ejecutar(identidad(u), LEER, async () => true)).resolves.toBe(true);
      }
      for (const diferencia of [0, 1]) {
        f.reloj.fijar(new Date(limite.getTime() + diferencia));
        await expect(acceso.ejecutar(identidad(u), LEER, async () => true)).rejects.toMatchObject({ status: 401 });
      }
      expect((await db.getRepository(Licencia).findOneByOrFail({ id: licencia.id })).plazoSuspensionDias).toBe(plazo ?? 2);
      expect((await db.getRepository(Sesion).findOneByOrFail({ id: u.sesionId })).revocadaEn).toBeNull();
    });
  });

  it.each([false, true])('T023 vence naturalmente antes del bloqueo programado=%s', async (programar) => {
    await conBaseOperativa(async (db) => {
      const f = await crearAccesoOperativo(db);
      const u = f.actores.find((u) => u.rol === Rol.RECEPCIONISTA)!;
      const limite = new Date(AHORA_OPERATIVO.getTime() + DIA);
      await db.getRepository(Licencia).update({ negocioId: u.negocioId! }, { venceEn: limite });
      if (programar) {
        const licencia = await db.getRepository(Licencia).findOneByOrFail({ negocioId: u.negocioId! });
        await new LicenciasService(db.getRepository(Licencia), new AutorizacionService(), new CalendarioLicenciasService(), new AuditoriaService())
          .suspender(f.superadmin.id, licencia.id, AHORA_OPERATIVO, 'suspension_natural_m4_123456789', 30);
      }
      await situarSesion(db, u, limite);
      const acceso = servicio(db, f.reloj);
      f.reloj.fijar(new Date(limite.getTime() - 1));
      await expect(acceso.ejecutar(identidad(u), LEER, async () => true)).resolves.toBe(true);
      for (const diferencia of [0, 1]) {
        f.reloj.fijar(new Date(limite.getTime() + diferencia));
        await expect(acceso.ejecutar(identidad(u), LEER, async () => true)).rejects.toMatchObject({ status: 401 });
      }
    });
  });

  it('T021 exige transacción activa y reautoriza con el mismo manager después de un cambio confirmado', async () => {
    await conBaseOperativa(async (db, segunda) => {
      const f = await crearAccesoOperativo(db);
      const u = f.actores.find((u) => u.rol === Rol.ADMIN_NEGOCIO)!;
      const acceso = servicio(db, f.reloj);
      await expect(acceso.resolverEnTransaccion(db.manager, identidad(u), LEER)).rejects.toThrow();
      let emitido!: Parameters<AccesoOperativoService['alcanceCitas']>[0];
      await db.transaction('READ COMMITTED', async (manager) => {
        emitido = await acceso.resolverEnTransaccion(manager, identidad(u), LEER);
        expect(emitido.manager).toBe(manager);
        await segunda.getRepository(Sesion).update({ id: u.sesionId }, { revocadaEn: f.reloj.ahora() });
        await expect(acceso.resolverEnTransaccion(manager, identidad(u), LEER)).rejects.toMatchObject({ status: 401 });
      });
      expect(() => acceso.alcanceCitas(emitido)).toThrow();
      expect(() => acceso.alcanceCitas({ ...emitido, rol: Rol.ADMIN_NEGOCIO } as never)).toThrow();
      await expect(acceso.ejecutar(identidad(u), Permiso.GESTIONAR_CATALOGO, async () => true)).rejects.toMatchObject({ status: 403 });
    });
  });
});
