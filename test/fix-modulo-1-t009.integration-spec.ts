import { conBaseMigrada } from './support/mariadb';
import { Personal } from '../src/profesionales/entities/personal.entity';
import { PersonalServicio } from '../src/profesionales/entities/personal-servicio.entity';
import { PersonalSucursal } from '../src/profesionales/entities/personal-sucursal.entity';
import { PersonalServicioSucursal } from '../src/profesionales/entities/personal-servicio-sucursal.entity';
import { Servicio } from '../src/servicios/entities/servicio.entity';

describe('FIX-T009: instalación nueva del modelo individual', () => {
  it('guarda y consulta los campos y relaciones con TypeORM en una base recién migrada', async () => {
    await conBaseMigrada(async (db) => {
      const negocios: number[] = [];
      const perfiles: number[] = [];
      for (const letra of ['a', 'b']) {
        const negocio = await db.query(`INSERT INTO negocios (nombre,slug,email_contacto)
          VALUES (?,?,?)`, [letra, `instalacion-fix-${letra}`, `${letra}@example.test`]);
        const negocioId = Number(negocio.insertId);
        negocios.push(negocioId);
        const usuario = await db.query(`INSERT INTO usuarios
          (negocio_id,nombre,email,password_hash,rol,activo,activado_en)
          VALUES (?,?,?,'hash','profesional',1,CURRENT_TIMESTAMP(6))`,
          [negocioId, letra, `prof-${letra}@example.test`]);
        perfiles.push(Number(usuario.insertId));
      }
      // La entidad de perfil conserva la identidad de usuarios y admite el valor heredado nulo.
      const repoPerfil = db.getRepository(Personal);
      await repoPerfil.save({ id: perfiles[0], negocioId: negocios[0], especialidad: 'Color' });
      await repoPerfil.save({ id: perfiles[1], negocioId: negocios[1], especialidad: null });
      expect((await repoPerfil.findOneByOrFail({ id: perfiles[0] })).especialidad).toBe('Color');
      expect((await repoPerfil.findOneByOrFail({ id: perfiles[1] })).especialidad).toBeNull();

      const sucursal = await db.query(`INSERT INTO sucursales
        (negocio_id,nombre,direccion,telefono,zona_horaria)
        VALUES (?,'Centro','Calle','6141234567','UTC')`, [negocios[0]]);
      const sucursalId = Number(sucursal.insertId);
      const repoServicio = db.getRepository(Servicio);
      const servicio = await repoServicio.save(repoServicio.create({ negocioId: negocios[0],
        nombre: 'Consulta', costo: '20.00', duracionMinutos: 30, activo: true,
        descripcion: 'Evaluación inicial', creadorPersonalId: perfiles[0] }));
      expect(await repoServicio.findOneByOrFail({ id: servicio.id })).toMatchObject({
        descripcion: 'Evaluación inicial', creadorPersonalId: perfiles[0],
      });

      // Ambas relaciones fuente existen antes de crear la combinación; sus estados son independientes.
      await db.getRepository(PersonalSucursal).save({ negocioId: negocios[0],
        personalId: perfiles[0], sucursalId, activo: false });
      await db.getRepository(PersonalServicio).save({ negocioId: negocios[0],
        personalId: perfiles[0], servicioId: servicio.id, activo: true });
      const repoOferta = db.getRepository(PersonalServicioSucursal);
      await repoOferta.save({ negocioId: negocios[0], personalId: perfiles[0],
        sucursalId, servicioId: servicio.id, activo: true });
      expect(await repoOferta.findOneByOrFail({ negocioId: negocios[0],
        personalId: perfiles[0], sucursalId, servicioId: servicio.id })).toMatchObject({ activo: true });
      expect((await db.getRepository(PersonalSucursal).findOneByOrFail({ negocioId: negocios[0],
        personalId: perfiles[0], sucursalId })).activo).toBe(false);
      await expect(db.query(`UPDATE servicios SET creador_personal_id=? WHERE id=?`,
        [perfiles[1], servicio.id])).rejects.toThrow();
      await expect(repoOferta.save({ negocioId: negocios[1], personalId: perfiles[1],
        sucursalId, servicioId: servicio.id, activo: true })).rejects.toThrow();
    });
  });
});
