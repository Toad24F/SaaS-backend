import { Rol } from '../../src/auth/enums/rol.enum';
import { RelojPrueba } from './reloj';
import { crearEscenarioModuloUno } from './modulo-1';

describe('M1-T006: fixtures de fase 2', () => {
  it('separa dos negocios, cuatro roles y una invitación sin usuario', () => {
    const reloj = new RelojPrueba(new Date('2026-09-25T12:00:00.000Z'));
    const datos = crearEscenarioModuloUno(reloj);
    expect(datos.superadmin).toMatchObject({ rol: Rol.SUPERADMIN, negocioId: null });
    expect(datos.activo.usuarios.map((usuario) => usuario.rol)).toEqual([
      Rol.ADMIN_NEGOCIO, Rol.RECEPCIONISTA, Rol.PROFESIONAL,
    ]);
    expect(datos.pendiente.invitacion).toMatchObject({
      negocioId: datos.pendiente.negocio.id,
      correo: expect.stringContaining('@example.test'),
      creadaEn: new Date('2026-09-25T12:00:00.000Z'),
    });
    expect(datos.pendiente.usuarios).toEqual([]);
    const ids = [datos.activo.negocio.id, datos.pendiente.negocio.id,
      ...datos.activo.usuarios.map((usuario) => usuario.id),
      ...datos.activo.recursos.map((recurso) => recurso.id),
      ...datos.pendiente.recursos.map((recurso) => recurso.id)];
    expect(new Set(ids).size).toBe(ids.length);
    for (const recurso of datos.activo.recursos) {
      expect(recurso.negocioId).toBe(datos.activo.negocio.id);
    }
    for (const recurso of datos.pendiente.recursos) {
      expect(recurso.negocioId).toBe(datos.pendiente.negocio.id);
    }
  });

  it('usa el reloj y entrega objetos independientes entre invocaciones', () => {
    const reloj = new RelojPrueba(new Date('2026-09-25T12:00:00.000Z'));
    const primero = crearEscenarioModuloUno(reloj);
    reloj.avanzar(60_000);
    const segundo = crearEscenarioModuloUno(reloj);
    expect(segundo.pendiente.invitacion.creadaEn.getTime() -
      primero.pendiente.invitacion.creadaEn.getTime()).toBe(60_000);
    primero.activo.recursos[0].nombre = 'Editado';
    expect(segundo.activo.recursos[0].nombre).not.toBe('Editado');
  });
});
