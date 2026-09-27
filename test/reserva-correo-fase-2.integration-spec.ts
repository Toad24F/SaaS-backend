import { ConflictException } from '@nestjs/common';
import { BarreraDos } from './support/carreras-modulo-1';
import { conBaseMigrada } from './support/mariadb';
import { ReservaCorreoService } from '../src/altas/reserva-correo.service';
import { AltaAdministrador } from '../src/altas/entities/alta-administrador.entity';
import { CorreoAcceso } from '../src/altas/entities/correo-acceso.entity';
import { Usuario } from '../src/usuarios/entities/usuario.entity';
import { UsuariosService } from '../src/usuarios/usuarios.service';
import { Rol } from '../src/auth/enums/rol.enum';

async function negocio(db: { query: (sql: string, parametros?: unknown[]) => Promise<any> }, slug: string) {
  const fila = await db.query(`INSERT INTO negocios (nombre, slug, email_contacto)
    VALUES (?, ?, ?)`, [slug, slug, `${slug}@example.test`]);
  return fila.insertId as number;
}

async function usuario(db: { query: (sql: string, parametros?: unknown[]) => Promise<any> },
  negocioId: number | null, correo: string, rol: Rol) {
  const fila = await db.query(`INSERT INTO usuarios
    (negocio_id, nombre, email, password_hash, rol, activado_en)
    VALUES (?, 'Cuenta', ?, 'hash', ?, UTC_TIMESTAMP(6))`, [negocioId, correo, rol]);
  return fila.insertId as number;
}

describe('M1-T017–T019: autoridad transaccional del correo', () => {
  const reservas = new ReservaCorreoService();

  it('reserva, transfiere y corrige una invitación en la transacción recibida', async () => {
    await conBaseMigrada(async (db) => {
      const negocioId = await negocio(db, 'uno');
      const alta = await db.query(`INSERT INTO altas_administrador (negocio_id, correo)
        VALUES (?, 'admin@example.test')`, [negocioId]);
      await db.transaction(async (manager) => {
        await reservas.reservarAlta(manager, {
          altaId: alta.insertId, negocioId, correo: ' ADMIN@EXAMPLE.TEST ',
        });
      });
      expect((await db.getRepository(CorreoAcceso).find())[0].correo).toBe('admin@example.test');
      await db.transaction(async (manager) => {
        await reservas.corregirAlta(manager, {
          altaId: alta.insertId, negocioId, nuevoCorreo: ' NUEVO@Example.test ',
        });
      });
      expect((await db.getRepository(AltaAdministrador).findOneByOrFail({ id: alta.insertId })).correo)
        .toBe('nuevo@example.test');
      const cuentaId = await usuario(db, negocioId, 'nuevo@example.test', Rol.ADMIN_NEGOCIO);
      const otroNegocio = await negocio(db, 'otro');
      const cuentaAjena = await usuario(db, otroNegocio, 'ajeno@example.test', Rol.RECEPCIONISTA);
      await expect(db.transaction((manager) => reservas.transferirAUsuario(manager, {
        altaId: alta.insertId, negocioId, usuarioId: cuentaAjena,
      }))).rejects.toBeInstanceOf(ConflictException);
      await db.transaction(async (manager) => {
        await reservas.transferirAUsuario(manager, { altaId: alta.insertId, negocioId, usuarioId: cuentaId });
      });
      expect((await db.getRepository(CorreoAcceso).find())[0]).toMatchObject({
        correo: 'nuevo@example.test', altaAdministradorId: null, usuarioId: cuentaId,
      });
    });
  });

  it('revierte corrección si el nuevo correo ya está reservado', async () => {
    await conBaseMigrada(async (db) => {
      const uno = await negocio(db, 'uno');
      const dos = await negocio(db, 'dos');
      const altaUno = await db.query(`INSERT INTO altas_administrador (negocio_id, correo)
        VALUES (?, 'uno@example.test')`, [uno]);
      const altaDos = await db.query(`INSERT INTO altas_administrador (negocio_id, correo)
        VALUES (?, 'dos@example.test')`, [dos]);
      await db.transaction(async (manager) => {
        await reservas.reservarAlta(manager, { altaId: altaUno.insertId, negocioId: uno, correo: 'uno@example.test' });
        await reservas.reservarAlta(manager, { altaId: altaDos.insertId, negocioId: dos, correo: 'dos@example.test' });
      });
      await expect(db.transaction((manager) => reservas.corregirAlta(manager, {
        altaId: altaUno.insertId, negocioId: uno, nuevoCorreo: ' DOS@EXAMPLE.TEST ',
      }))).rejects.toBeInstanceOf(ConflictException);
      expect((await db.getRepository(AltaAdministrador).findOneByOrFail({ id: altaUno.insertId })).correo)
        .toBe('uno@example.test');
      expect((await db.getRepository(CorreoAcceso).find()).map((fila) => fila.correo).sort())
        .toEqual(['dos@example.test', 'uno@example.test']);
    });
  });

  it('integra recepción y el superadmin provisionado en la misma reserva', async () => {
    await conBaseMigrada(async (db) => {
      const negocioId = await negocio(db, 'uno');
      const adminId = await usuario(db, negocioId, 'admin@example.test', Rol.ADMIN_NEGOCIO);
      // El aprovisionamiento inicial no tiene ruta HTTP: cuenta y reserva van juntas.
      await db.transaction(async (manager) => {
        const superadmin = await manager.query(`INSERT INTO usuarios
          (nombre, email, password_hash, rol, activado_en)
          VALUES ('Superadmin', 'super@example.test', 'hash', 'superadmin', UTC_TIMESTAMP(6))`);
        await reservas.reservarUsuario(manager, {
          usuarioId: superadmin.insertId, negocioId: null, correo: ' SUPER@EXAMPLE.TEST ',
        });
      });
      const creado = await new UsuariosService(db.getRepository(Usuario)).crearRecepcionista({
        actorUsuarioId: adminId, nombre: 'Recepción', email: 'recepcion@example.test',
        password: 'contraseña-segura', ahora: new Date(Date.now() + 1000),
      });
      expect((await db.getRepository(CorreoAcceso).findOneByOrFail({ usuarioId: creado.id })).correo)
        .toBe('recepcion@example.test');
      const alta = await db.query(`INSERT INTO altas_administrador (negocio_id, correo)
        VALUES (?, 'recepcion@example.test')`, [negocioId]);
      await expect(db.transaction((manager) => reservas.reservarAlta(manager, {
        altaId: alta.insertId, negocioId, correo: 'recepcion@example.test',
      }))).rejects.toBeInstanceOf(ConflictException);
    });
  });

  it('dos altas simultáneas con correo equivalente dejan una sola cuenta y reserva', async () => {
    await conBaseMigrada(async (primera, segunda) => {
      const uno = await negocio(primera, 'uno');
      const dos = await negocio(primera, 'dos');
      const barrera = new BarreraDos();
      const crear = (db: typeof primera, negocioId: number, correo: string) => db.transaction(async (manager) => {
        await barrera.esperar();
        const cuenta = await manager.getRepository(Usuario).save(manager.getRepository(Usuario).create({
          negocioId, nombre: 'Cuenta', email: correo, passwordHash: 'hash', rol: Rol.RECEPCIONISTA,
          activo: true, creadoEn: new Date(), activadoEn: new Date(Date.now() + 1000),
        }));
        await reservas.reservarUsuario(manager, { usuarioId: cuenta.id, negocioId, correo });
      });
      const resultados = await Promise.allSettled([
        crear(primera, uno, 'Igual@Example.test'), crear(segunda, dos, ' igual@example.TEST '),
      ]);
      expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(resultados.filter((r) => r.status === 'rejected')).toHaveLength(1);
      expect(await primera.getRepository(CorreoAcceso).count()).toBe(1);
      expect(await primera.getRepository(Usuario).count()).toBe(1);
    });
  });

  it('dos invitaciones simultáneas con correo equivalente dejan una sola alta', async () => {
    await conBaseMigrada(async (primera, segunda) => {
      const uno = await negocio(primera, 'uno');
      const dos = await negocio(primera, 'dos');
      const barrera = new BarreraDos();
      const crear = (db: typeof primera, negocioId: number, correo: string) => db.transaction(async (manager) => {
        await barrera.esperar();
        const alta = await manager.getRepository(AltaAdministrador).save(
          manager.getRepository(AltaAdministrador).create({ negocioId, correo: correo.trim().toLowerCase() }),
        );
        await reservas.reservarAlta(manager, { altaId: alta.id, negocioId, correo });
      });
      const resultados = await Promise.allSettled([
        crear(primera, uno, 'Doble@Example.test'), crear(segunda, dos, ' doble@example.TEST '),
      ]);
      expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(resultados.filter((r) => r.status === 'rejected')).toHaveLength(1);
      // El perdedor revierte también la invitación insertada antes de reservar.
      expect(await primera.getRepository(AltaAdministrador).count()).toBe(1);
      expect(await primera.getRepository(CorreoAcceso).count()).toBe(1);
    });
  });

  it('cuenta e invitación simultáneas aceptan un titular sin datos parciales', async () => {
    await conBaseMigrada(async (primera, segunda) => {
      const uno = await negocio(primera, 'uno');
      const dos = await negocio(primera, 'dos');
      const barrera = new BarreraDos();
      const invitacion = primera.transaction(async (manager) => {
        await barrera.esperar();
        const alta = await manager.getRepository(AltaAdministrador).save(
          manager.getRepository(AltaAdministrador).create({ negocioId: uno, correo: 'choque@example.test' }),
        );
        await reservas.reservarAlta(manager, { altaId: alta.id, negocioId: uno, correo: alta.correo });
      });
      const cuenta = segunda.transaction(async (manager) => {
        await barrera.esperar();
        const creada = await manager.getRepository(Usuario).save(manager.getRepository(Usuario).create({
          negocioId: dos, nombre: 'Cuenta', email: 'CHOQUE@example.test', passwordHash: 'hash',
          rol: Rol.RECEPCIONISTA, activo: true, creadoEn: new Date(), activadoEn: new Date(Date.now() + 1000),
        }));
        await reservas.reservarUsuario(manager, { usuarioId: creada.id, negocioId: dos, correo: creada.email });
      });
      const resultados = await Promise.allSettled([invitacion, cuenta]);
      expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(resultados.filter((r) => r.status === 'rejected')).toHaveLength(1);
      const filas = await primera.getRepository(CorreoAcceso).find();
      expect(filas).toHaveLength(1);
      expect((await primera.getRepository(AltaAdministrador).count()) +
        (await primera.getRepository(Usuario).count())).toBe(1);
    });
  });
});
