import { Rol } from '../src/auth/enums/rol.enum';
import { conBaseMigrada } from './support/mariadb';
import { crearDatosModulo5, observarEsperaModulo5 } from './support/preparacion-modulo-5';
import { RelojPrueba } from './support/reloj';
import type { DataSource } from 'typeorm';

const inicio = new Date('2026-11-20T18:00:00.000Z');

describe('M5-T003–T004: infraestructura de prueba', () => {
  it('siembra dos negocios aislados con los cuatro roles y profesionales propios', async () => {
    await conBaseMigrada(async (db) => {
      expect(db.options.database).toMatch(/^citas_m5_test_[a-f0-9]{32}$/);
      const { negocios, superadminId } = await crearDatosModulo5(db, new RelojPrueba(inicio));
      expect(negocios).toHaveLength(2);
      expect(negocios[0].id).not.toBe(negocios[1].id);
      expect(negocios[0].profesionalId).not.toBe(negocios[1].profesionalId);

      const [superadmin] = await db.query('SELECT rol, negocio_id FROM usuarios WHERE id=?', [superadminId]);
      expect(superadmin).toEqual({ rol: Rol.SUPERADMIN, negocio_id: null });
      for (const { id, administradorId, recepcionistaId, profesionalId, clientes } of negocios) {
        // Consultar filas persistidas demuestra pertenencia y evita validar solo la fixture devuelta.
        const usuarios = await db.query('SELECT id, rol, email FROM usuarios WHERE negocio_id=?', [id]);
        expect(usuarios).toHaveLength(3);
        expect(usuarios).toEqual(expect.arrayContaining([
          expect.objectContaining({ id: administradorId, rol: Rol.ADMIN_NEGOCIO }),
          expect.objectContaining({ id: recepcionistaId, rol: Rol.RECEPCIONISTA }),
          expect.objectContaining({ id: profesionalId, rol: Rol.PROFESIONAL }),
        ]));
        for (const usuario of usuarios) expect(usuario.email).toMatch(/@example\.test$/);
        expect(await db.query('SELECT id FROM personal WHERE negocio_id=?', [id])).toEqual([{ id: profesionalId }]);

        const fichas = await db.query('SELECT id, nombre_completo, telefono FROM clientes WHERE negocio_id=?', [id]);
        expect(fichas).toHaveLength(2);
        expect(fichas.map((ficha: { id: number }) => ficha.id)).toEqual(expect.arrayContaining(clientes));
        expect(fichas[0].nombre_completo).not.toBe(fichas[1].nombre_completo);
        expect(fichas.map((ficha: { telefono: string }) => ficha.telefono)).toEqual(['0000000001', '0000000001']);
      }
    }, 'citas_m5_test');
  });

  it('rechaza la base ajena al ejecutor antes de escribir', async () => {
    const cotidiana = { options: { database: 'citas_test_cotidiana' } } as DataSource;
    const simulada = { options: { database: `citas_m5_test_${'a'.repeat(32)}` } } as DataSource;
    const reloj = new RelojPrueba(inicio);
    await expect(crearDatosModulo5(cotidiana, reloj)).rejects.toThrow('base desechable');
    await expect(observarEsperaModulo5(simulada, cotidiana, 1, reloj, () => {}))
      .rejects.toThrow('base desechable');
  });

  it('avanza el reloj mientras una segunda conexión espera el bloqueo real', async () => {
    await conBaseMigrada(async (a, b) => {
      const reloj = new RelojPrueba(inicio);
      const { negocios: [negocio] } = await crearDatosModulo5(a, reloj);
      const limite = inicio.getTime() + 15 * 60_000;
      reloj.avanzar(limite - inicio.getTime() - 1);

      const resultado = await observarEsperaModulo5(a, b, negocio.profesionalId, reloj, () => {
        expect(reloj.ahora().getTime()).toBe(limite - 1);
        reloj.avanzar(1);
        expect(reloj.ahora().getTime()).toBe(limite);
        reloj.avanzar(1);
      });
      expect(resultado.conexiones[0]).not.toBe(resultado.conexiones[1]);
      expect(resultado.instanteAntes.getTime()).toBe(limite - 1);
      expect(resultado.instanteDespues.getTime()).toBe(limite + 1);
      expect(resultado.especialidad).toBe('Cambio confirmado de prueba');
    }, 'citas_m5_test');
  });
});
