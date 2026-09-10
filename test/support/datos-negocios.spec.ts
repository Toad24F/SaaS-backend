import * as bcrypt from 'bcrypt';
import { Rol } from '../../src/auth/enums/rol.enum';
import { crearDosNegocios, PASSWORD_PRUEBA } from './datos-negocios';
import { RelojPrueba } from './reloj';

describe('Datos reutilizables de dos negocios (T06)', () => {
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

  it('mantiene independientes los objetos y fechas de cada escenario', async () => {
    const reloj = new RelojPrueba(new Date(fecha));
    const [primero, segundo] = await crearDosNegocios(reloj);
    primero.negocio.nombre = 'Modificado';
    primero.administrador.activo = false;
    primero.administrador.creadoEn.setUTCFullYear(2030);
    reloj.avanzar(1000);
    expect(segundo.negocio.nombre).not.toBe('Modificado');
    expect(segundo.administrador.activo).toBe(true);
    expect(primero.negocio.creadoEn.toISOString()).toBe(fecha);
    expect(primero.recepcionista.creadoEn.toISOString()).toBe(fecha);
    expect(segundo.administrador.creadoEn.toISOString()).toBe(fecha);
  });
});
