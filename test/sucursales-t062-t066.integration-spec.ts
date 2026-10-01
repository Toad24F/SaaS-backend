import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuditoriaService } from '../src/auditoria/auditoria.service';
import { AutorizacionService } from '../src/auth/services/autorizacion.service';
import { Rol } from '../src/auth/enums/rol.enum';
import { Negocio } from '../src/negocios/entities/negocio.entity';
import { Sucursal } from '../src/sucursales/entities/sucursal.entity';
import { SucursalesService } from '../src/sucursales/sucursales.service';
import { Usuario } from '../src/usuarios/entities/usuario.entity';
import { conBaseMigrada } from './support/mariadb';

const entrada = { nombre: 'Centro', direccion: 'Calle Uno', telefono: '6141234567',
  zonaHoraria: 'America/Chihuahua' };

function servicio(db: DataSource) {
  // Cada instancia usa el manager de una conexión distinta; no se simula el bloqueo SQL.
  return new SucursalesService(db.getRepository(Sucursal), new AutorizacionService(),
    new AuditoriaService());
}

async function escenario(db: DataSource) {
  const ahora = new Date(Date.now() + 120000);
  const superadmin = await db.getRepository(Usuario).save({ negocioId: null, nombre: 'Super',
    email: 'super-sucursales@example.test', passwordHash: 'hash', rol: Rol.SUPERADMIN,
    activo: true, creadoEn: ahora, activadoEn: ahora });
  const negocios: Negocio[] = [];
  const administradores: Usuario[] = [];
  for (const letra of ['a', 'b']) {
    const negocio = await db.getRepository(Negocio).save({ nombre: letra, slug: `sucursal-${letra}`,
      emailContacto: `${letra}@example.test`, activadoEn: ahora,
      limiteSucursalesActivas: 1 });
    negocios.push(negocio);
    administradores.push(await db.getRepository(Usuario).save({ negocioId: negocio.id,
      nombre: `Admin ${letra}`, email: `admin-${letra}@example.test`, passwordHash: 'hash',
      rol: Rol.ADMIN_NEGOCIO, activo: true, creadoEn: ahora, activadoEn: ahora }));
  }
  const recepcion = await db.getRepository(Usuario).save({ negocioId: negocios[0].id,
    nombre: 'Recepción', email: 'recepcion-sucursal@example.test', passwordHash: 'hash',
    rol: Rol.RECEPCIONISTA, activo: true, creadoEn: ahora, activadoEn: ahora });
  return { superadmin, negocios, administradores, recepcion };
}

describe('M1-T062–T066: sucursales y cupo transaccional', () => {
  it('cuenta activas, conserva inactivas y audita solo cambios reales', async () => {
    await conBaseMigrada(async (db) => {
      const { administradores: [admin], negocios: [negocio], superadmin } = await escenario(db);
      const sucursales = servicio(db);
      const primera = await sucursales.crear(admin.id, entrada);
      await expect(sucursales.crear(admin.id, { ...entrada, nombre: 'Otra' }))
        .rejects.toBeInstanceOf(ConflictException);
      expect(await sucursales.consultarCupo(admin.id)).toMatchObject({
        negocioId: negocio.id, limiteSucursalesActivas: 1, sucursalesActivas: 1, disponibles: 0,
      });
      await sucursales.desactivar(admin.id, primera.id);
      await sucursales.desactivar(admin.id, primera.id);
      const segunda = await sucursales.crear(admin.id, { ...entrada, nombre: 'Norte' });
      await sucursales.editar(admin.id, primera.id, { notasLlegada: 'Entrada principal' });
      expect((await sucursales.consultar(admin.id, primera.id)).activo).toBe(false);
      expect((await sucursales.listar(admin.id)).map((s) => s.id)).toEqual([primera.id, segunda.id]);
      expect(await sucursales.consultarCupoNegocio(superadmin.id, negocio.id))
        .toMatchObject({ sucursalesActivas: 1, disponibles: 0 });
      const eventos = await db.query("SELECT accion FROM eventos_auditoria WHERE recurso_tipo = 'sucursal'");
      expect(eventos.filter((e: { accion: string }) => e.accion === 'sucursal_desactivada')).toHaveLength(1);
      expect(eventos.filter((e: { accion: string }) => e.accion === 'sucursal_creada')).toHaveLength(2);
    });
  });

  it('limita administración al negocio del actor y cupo al superadmin', async () => {
    await conBaseMigrada(async (db) => {
      const { superadmin, administradores: [a, b], recepcion, negocios: [uno] } = await escenario(db);
      const sucursales = servicio(db);
      const creada = await sucursales.crear(a.id, entrada);
      await expect(sucursales.consultar(b.id, creada.id)).rejects.toBeInstanceOf(NotFoundException);
      await expect(sucursales.editar(b.id, creada.id, { nombre: 'Ajena' })).rejects.toBeInstanceOf(NotFoundException);
      await expect(sucursales.desactivar(b.id, creada.id)).rejects.toBeInstanceOf(NotFoundException);
      await expect(sucursales.crear(recepcion.id, entrada)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(sucursales.cambiarLimite(a.id, uno.id, 2)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(sucursales.cambiarLimite(superadmin.id, uno.id, 0)).rejects.toBeDefined();
      await expect(sucursales.cambiarLimite(superadmin.id, uno.id, 1.5)).rejects.toBeDefined();
      await sucursales.cambiarLimite(superadmin.id, uno.id, 2);
      expect((await sucursales.consultarCupo(a.id)).limiteSucursalesActivas).toBe(2);
      await sucursales.crear(a.id, { ...entrada, nombre: 'Norte' });
      await expect(sucursales.cambiarLimite(superadmin.id, uno.id, 1))
        .rejects.toBeInstanceOf(ConflictException);
      expect((await sucursales.consultarCupo(a.id)).limiteSucursalesActivas).toBe(2);
    });
  });

  it('dos conexiones compiten por la última plaza sin sobrecupo ni doble auditoría', async () => {
    await conBaseMigrada(async (db, segunda) => {
      const { administradores: [admin], negocios: [negocio] } = await escenario(db);
      // Las dos transacciones leen el mismo cupo inicial y serializan en negocios.
      const resultados = await Promise.allSettled([
        servicio(db).crear(admin.id, entrada),
        servicio(segunda).crear(admin.id, { ...entrada, nombre: 'Norte' }),
      ]);
      expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(resultados.filter((r) => r.status === 'rejected')).toHaveLength(1);
      expect(await db.getRepository(Sucursal).countBy({ negocioId: negocio.id, activo: true })).toBe(1);
      expect((await db.query("SELECT accion FROM eventos_auditoria WHERE accion = 'sucursal_creada'"))).toHaveLength(1);
    });
  });

  it('alta y reducción simultáneas siempre dejan activas <= límite', async () => {
    await conBaseMigrada(async (db, segunda) => {
      const { administradores: [admin], negocios: [negocio], superadmin } = await escenario(db);
      const sucursales = servicio(db);
      await sucursales.cambiarLimite(superadmin.id, negocio.id, 2);
      await sucursales.crear(admin.id, entrada);
      // Solo uno de los comandos puede confirmar desde el estado 1/2.
      const resultados = await Promise.allSettled([
        sucursales.crear(admin.id, { ...entrada, nombre: 'Norte' }),
        servicio(segunda).cambiarLimite(superadmin.id, negocio.id, 1),
      ]);
      expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const cupo = await sucursales.consultarCupo(admin.id);
      expect(cupo.sucursalesActivas).toBeLessThanOrEqual(cupo.limiteSucursalesActivas);
      expect(cupo.sucursalesActivas).toBe(cupo.limiteSucursalesActivas);
    });
  });

  it('revierte alta y cupo si falla auditoría y evita eventos en operaciones repetidas', async () => {
    await conBaseMigrada(async (db) => {
      const { administradores: [admin], negocios: [negocio], superadmin } = await escenario(db);
      const auditoria = new AuditoriaService();
      const sucursales = new SucursalesService(db.getRepository(Sucursal),
        new AutorizacionService(), auditoria);
      const fallo = jest.spyOn(auditoria, 'registrar').mockRejectedValueOnce(new Error('Fallo controlado T062'));
      try { await expect(sucursales.crear(admin.id, entrada)).rejects.toThrow('Fallo controlado T062'); }
      finally { fallo.mockRestore(); }
      expect(await db.getRepository(Sucursal).count()).toBe(0);
      expect((await db.query("SELECT accion FROM eventos_auditoria WHERE accion = 'sucursal_creada'"))).toHaveLength(0);
      await sucursales.cambiarLimite(superadmin.id, negocio.id, 2);
      await sucursales.cambiarLimite(superadmin.id, negocio.id, 2);
      expect((await db.query("SELECT accion FROM eventos_auditoria WHERE accion = 'limite_sucursales_modificado'")))
        .toHaveLength(1);
    });
  });
});
