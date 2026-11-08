import { randomUUID } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { Rol } from '../src/auth/enums/rol.enum';
import { AutorizacionService } from '../src/auth/services/autorizacion.service';
import { PoliticaContrasenasService } from '../src/auth/services/politica-contrasenas.service';
import { AuditoriaService } from '../src/auditoria/auditoria.service';
import { ReservaCorreoService } from '../src/altas/reserva-correo.service';
import { CorreoAcceso } from '../src/altas/entities/correo-acceso.entity';
import { Negocio } from '../src/negocios/entities/negocio.entity';
import { Personal } from '../src/profesionales/entities/personal.entity';
import { ProfesionalesService } from '../src/profesionales/profesionales.service';
import { CuposUsuariosService } from '../src/usuarios/cupos-usuarios.service';
import { Usuario } from '../src/usuarios/entities/usuario.entity';
import { UsuariosService } from '../src/usuarios/usuarios.service';
import { conBaseMigrada } from './support/mariadb';

const profesionales = (db: DataSource) => new ProfesionalesService(db.getRepository(Personal),
  new AutorizacionService(), new PoliticaContrasenasService(),
  new ReservaCorreoService(), new AuditoriaService());
const recepcionistas = (db: DataSource) => new UsuariosService(db.getRepository(Usuario),
  new PoliticaContrasenasService(), new AuditoriaService(), new ReservaCorreoService());
const nombre = () => `Persona ${randomUUID()}`;
const correo = () => `${randomUUID()}@example.test`;

async function escenario(db: DataSource) {
  const ahora = new Date(Date.now() + 60_000);
  const negocio = await db.getRepository(Negocio).save({ nombre: 'Carrera de cupos',
    slug: `carrera-cupos-${randomUUID()}`, emailContacto: correo(), activadoEn: ahora });
  const admin = await db.getRepository(Usuario).save({ negocioId: negocio.id,
    nombre: nombre(), email: correo(), passwordHash: 'hash', rol: Rol.ADMIN_NEGOCIO,
    activo: true, creadoEn: ahora, activadoEn: ahora });
  const superadmin = await db.getRepository(Usuario).save({ negocioId: null,
    nombre: nombre(), email: correo(), passwordHash: 'hash', rol: Rol.SUPERADMIN,
    activo: true, creadoEn: ahora, activadoEn: ahora });
  return { ahora, negocio, admin, superadmin };
}

const altaProfesional = (db: DataSource, actorId: number, ahora: Date) =>
  profesionales(db).crear(actorId, { nombre: nombre(), correo: correo(),
    password: 'Clave-profesional-123', especialidad: 'General' }, ahora);
const altaRecepcionista = (db: DataSource, actorId: number, ahora: Date) =>
  recepcionistas(db).crearRecepcionista({ actorUsuarioId: actorId, nombre: nombre(),
    email: correo(), password: 'Clave-recepcion-123', ahora });

async function competir<T, U>(primera: () => Promise<T>, segunda: () => Promise<U>) {
  let soltar!: () => void;
  let avisar!: () => void;
  const retenida = new Promise<void>((resolver) => { soltar = resolver; });
  const enAuditoria = new Promise<void>((resolver) => { avisar = resolver; });
  const espia = jest.spyOn(AuditoriaService.prototype, 'registrar');
  const original = espia.getMockImplementation();
  // La primera operación ya escribió su estado y retiene la barrera hasta el acuse.
  espia.mockImplementationOnce(async function (manager, datos) {
    avisar();
    await retenida;
    return original!.call(this, manager, datos);
  });
  const uno = primera();
  try {
    await enAuditoria;
    const dos = segunda();
    // Ambas promesas están activas antes de permitir el primer commit.
    await new Promise((resolver) => setTimeout(resolver, 50));
    soltar();
    return await Promise.allSettled([uno, dos]);
  } finally { soltar(); espia.mockRestore(); }
}

describe('ALA-T058–T060: carreras reales por la barrera de negocio', () => {
  it.each(['alta', 'reactivacion'] as const)(
    'solo un Profesional obtiene el último lugar empezando por %s', async (orden) => {
      await conBaseMigrada(async (db, otra) => {
        const f = await escenario(db);
        await new CuposUsuariosService(db).cambiarLimites(f.superadmin.id, f.negocio.id,
          { profesionales: 1, recepcionistas: 3 });
        const previo = await altaProfesional(db, f.admin.id, f.ahora);
        await profesionales(db).cambiarEstado(f.admin.id, previo.id, false, f.ahora);
        const alta = () => altaProfesional(db, f.admin.id, f.ahora);
        const reactivacion = () => profesionales(otra)
          .cambiarEstado(f.admin.id, previo.id, true, f.ahora);
        const resultados = orden === 'alta'
          ? await competir(alta, reactivacion) : await competir(reactivacion, alta);
        expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
        expect(resultados.find((r) => r.status === 'rejected'))
          .toMatchObject({ reason: expect.any(ConflictException) });
        const cupo = await new CuposUsuariosService(db).consultar(f.negocio.id);
        expect(cupo.profesionales).toMatchObject({ limite: 1, activos: 1, disponibles: 0 });
        expect(await db.getRepository(Personal).count({ where: { negocioId: f.negocio.id } }))
          .toBe(orden === 'alta' ? 2 : 1);
      });
    });

  it('dos altas de Recepción compiten por el último lugar sin reserva huérfana', async () => {
    await conBaseMigrada(async (db, otra) => {
      const f = await escenario(db);
      await new CuposUsuariosService(db).cambiarLimites(f.superadmin.id, f.negocio.id,
        { profesionales: 5, recepcionistas: 1 });
      const resultados = await competir(
        () => altaRecepcionista(db, f.admin.id, f.ahora),
        () => altaRecepcionista(otra, f.admin.id, f.ahora));
      expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(resultados.find((r) => r.status === 'rejected'))
        .toMatchObject({ reason: expect.any(ConflictException) });
      expect((await new CuposUsuariosService(db).consultar(f.negocio.id)).recepcionistas)
        .toMatchObject({ limite: 1, activos: 1, disponibles: 0 });
      expect(await db.getRepository(Usuario).count({ where: {
        negocioId: f.negocio.id, rol: Rol.RECEPCIONISTA } })).toBe(1);
      expect(await db.getRepository(CorreoAcceso).count()).toBe(1);
    });
  });

  it.each(['reducir', 'alta'] as const)(
    'reducción contra alta empezando por %s conserva el límite y las cuentas activas', async (orden) => {
      await conBaseMigrada(async (db, otra) => {
        const f = await escenario(db);
        await new CuposUsuariosService(db).cambiarLimites(f.superadmin.id, f.negocio.id,
          { profesionales: 2, recepcionistas: 3 });
        await altaProfesional(db, f.admin.id, f.ahora);
        const reducir = () => new CuposUsuariosService(otra)
          .cambiarLimites(f.superadmin.id, f.negocio.id,
            { profesionales: 1, recepcionistas: 3 });
        const alta = () => altaProfesional(db, f.admin.id, f.ahora);
        const resultados = orden === 'reducir'
          ? await competir(reducir, alta) : await competir(alta, reducir);
        expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
        expect(resultados.find((r) => r.status === 'rejected'))
          .toMatchObject({ reason: expect.any(ConflictException) });
        const cupo = await new CuposUsuariosService(db).consultar(f.negocio.id);
        expect(cupo.profesionales).toMatchObject(orden === 'reducir'
          ? { limite: 1, activos: 1 } : { limite: 2, activos: 2 });
        expect(cupo.profesionales.activos).toBeLessThanOrEqual(cupo.profesionales.limite);
        // El rechazado no apaga la cuenta que ya estaba activa.
        expect(await db.getRepository(Usuario).count({ where: {
          negocioId: f.negocio.id, rol: Rol.PROFESIONAL, activo: true } }))
          .toBe(cupo.profesionales.activos);
      });
    });
});
