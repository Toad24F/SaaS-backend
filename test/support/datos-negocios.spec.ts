import * as bcrypt from 'bcrypt';
import { Rol } from '../../src/auth/enums/rol.enum';
import {
  crearDosNegocios,
  crearEscenariosLicencia,
  PASSWORD_PRUEBA,
} from './datos-negocios';
import { RelojPrueba } from './reloj';

describe('Datos reutilizables de negocios (T06 y T69)', () => {
  const fecha = '2026-09-10T12:00:00.000Z';

  it('genera negocios y usuarios con identificadores, correos y slugs diferentes', async () => {
    const reloj = new RelojPrueba(new Date(fecha));
    const escenarios = [...await crearDosNegocios(reloj), ...await crearDosNegocios(reloj)];
    const usuarios = escenarios.flatMap(({ administrador, recepcionista }) => [administrador, recepcionista]);
    const negocios = escenarios.map(({ negocio }) => negocio);
    expect(new Set([...negocios, ...usuarios].map(({ id }) => id)).size).toBe(12);
    expect(new Set(usuarios.map(({ email }) => email)).size).toBe(8);
    expect(new Set(negocios.map(({ slug }) => slug)).size).toBe(4);
    for (const { negocio, administrador, recepcionista } of escenarios) {
      expect(administrador.rol).toBe(Rol.ADMIN_NEGOCIO);
      expect(recepcionista.rol).toBe(Rol.RECEPCIONISTA);
      for (const usuario of [administrador, recepcionista]) {
        expect(usuario.negocioId).toBe(negocio.id);
        expect(usuario.negocio).toBe(negocio);
        expect(usuario.creadoEn.toISOString()).toBe(fecha);
        expect(usuario.email).toBe(usuario.email.toLowerCase());
      }
      expect(negocio.creadoEn.toISOString()).toBe(fecha);
    }
    expect(await bcrypt.compare(PASSWORD_PRUEBA, usuarios[0].passwordHash)).toBe(true);
  });

  it('incluye cuentas activadas y pendientes junto con licencia anual', async () => {
    const reloj = new RelojPrueba(new Date(fecha));
    const [datos] = await crearDosNegocios(reloj);

    expect(datos.negocio.activadoEn?.toISOString()).toBe(fecha);
    expect(datos.administrador.activadoEn?.toISOString()).toBe(fecha);
    expect(datos.recepcionistaPendiente).toMatchObject({
      nombre: null,
      passwordHash: null,
      activadoEn: null,
      activo: true,
      negocioId: datos.negocio.id,
    });
    expect(datos.licencia).toMatchObject({
      negocio: datos.negocio,
      negocioId: datos.negocio.id,
      habilitadaEn: expect.any(Date),
      venceEn: expect.any(Date),
      suspendidaEn: null,
    });
  });

  it('genera licencias pendiente, vigente, vencida y suspendida sin compartir objetos', async () => {
    const reloj = new RelojPrueba(new Date(fecha));
    const escenarios = await crearEscenariosLicencia(reloj);

    expect(escenarios.pendiente.licencia).toMatchObject({
      habilitadaEn: null,
      venceEn: null,
      suspendidaEn: null,
    });
    expect(escenarios.vigente.licencia.venceEn!.getTime()).toBeGreaterThan(
      reloj.ahora().getTime(),
    );
    expect(escenarios.vencida.licencia.venceEn!.getTime()).toBeLessThanOrEqual(
      reloj.ahora().getTime(),
    );
    expect(escenarios.suspendida.licencia.suspendidaEn).toBeInstanceOf(Date);
    expect(new Set(Object.values(escenarios).map(({ licencia }) => licencia)).size)
      .toBe(4);
  });

  it('mantiene independientes los objetos y fechas de cada escenario', async () => {
    const reloj = new RelojPrueba(new Date(fecha));
    const [primero, segundo] = await crearDosNegocios(reloj);
    primero.negocio.nombre = 'Modificado';
    primero.administrador.activo = false;
    primero.recepcionistaPendiente.email = 'modificado@example.test';
    primero.licencia.venceEn!.setUTCFullYear(2035);
    primero.administrador.creadoEn.setUTCFullYear(2030);
    reloj.avanzar(1000);
    expect(segundo.negocio.nombre).not.toBe('Modificado');
    expect(segundo.administrador.activo).toBe(true);
    expect(segundo.recepcionistaPendiente.email).not.toBe('modificado@example.test');
    expect(segundo.licencia.venceEn!.getUTCFullYear()).not.toBe(2035);
    expect(primero.negocio.creadoEn.toISOString()).toBe(fecha);
    expect(primero.recepcionista.creadoEn.toISOString()).toBe(fecha);
    expect(segundo.administrador.creadoEn.toISOString()).toBe(fecha);
  });
});
