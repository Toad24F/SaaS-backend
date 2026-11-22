import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { conBaseMigrada } from './support/mariadb';
import { BloqueosService } from '../src/bloqueos/bloqueos.service';
import { BloqueoHorario } from '../src/bloqueos/entities/bloqueo-horario.entity';
import { AutorizacionService } from '../src/auth/services/autorizacion.service';
import { Rol } from '../src/auth/enums/rol.enum';
import { Negocio } from '../src/negocios/entities/negocio.entity';
import { Usuario } from '../src/usuarios/entities/usuario.entity';
import { RelojPrueba } from './support/reloj';
import { BloqueosAplicablesService } from '../src/disponibilidad/bloqueos-aplicables.service';

const datos = { tipo: 'vacaciones', motivo: 'Descanso anual',
  fechaInicio: '2026-10-10', fechaFin: '2026-10-12',
  inicioMinutos: null, finMinutos: null };

function servicio(db: DataSource) {
  return new BloqueosService(db.getRepository(BloqueoHorario), new AutorizacionService());
}

// Dos negocios, cada uno con dos perfiles y una sede asignada, exponen cruces de IDs.
async function preparar(db: DataSource) {
  const ahora = new Date('2026-10-01T12:00:00Z');
  const resultado = [];
  for (const n of [1, 2]) {
    const negocio = await db.getRepository(Negocio).save({ nombre: `Negocio ${n}`,
      slug: `bloqueos-${n}`, emailContacto: `bloqueos${n}@example.test`,
      creadoEn: ahora, activadoEn: ahora, limiteSucursalesActivas: 2 });
    const usuarios = [];
    for (const [indice, rol] of [Rol.ADMIN_NEGOCIO, Rol.PROFESIONAL,
      Rol.PROFESIONAL, Rol.RECEPCIONISTA].entries()) {
      usuarios.push(await db.getRepository(Usuario).save({ negocioId: negocio.id,
        nombre: `Persona ${indice}`, email: `b${n}u${indice}@example.test`,
        passwordHash: 'hash', rol, activo: true, creadoEn: ahora, activadoEn: ahora }));
    }
    const perfiles = [];
    for (const usuario of usuarios.slice(1, 3)) {
      await db.query('INSERT INTO personal (id,negocio_id) VALUES (?,?)',
        [usuario.id, negocio.id]);
      perfiles.push(usuario.id);
    }
    const sede = await db.query(`INSERT INTO sucursales
      (negocio_id,nombre,direccion,telefono,zona_horaria,activo)
      VALUES (?,'Centro','Calle Uno','6141234567','America/Chihuahua',1)`, [negocio.id]);
    const sucursalId = Number(sede.insertId);
    for (const personalId of perfiles) await db.query(`INSERT INTO personal_sucursales
      (negocio_id,personal_id,sucursal_id) VALUES (?,?,?)`,
    [negocio.id, personalId, sucursalId]);
    resultado.push({ negocioId: negocio.id, adminId: usuarios[0].id,
      proId: usuarios[1].id, otroProId: usuarios[2].id, recepcionId: usuarios[3].id,
      personalId: perfiles[0], otroPersonalId: perfiles[1], sucursalId });
  }
  return resultado;
}

describe('T101–T105 bloqueos de horario', () => {
  it('persiste alcance, creador y dos bloqueos solapados sin compartir IDs ajenos', async () => {
    await conBaseMigrada(async (db) => {
      const [a, b] = await preparar(db);
      const api = servicio(db);
      const primero = await api.crear(a.adminId, { ...datos,
        personalId: a.personalId, sucursalId: a.sucursalId });
      const segundo = await api.crear(a.proId, { ...datos,
        personalId: a.personalId, sucursalId: null, motivo: 'Capacitación' });
      expect(primero.id).not.toBe(segundo.id);
      expect(primero.creadorUsuarioId).toBe(a.adminId);
      expect((await api.listar(a.adminId))[0]).toMatchObject({
        fechaInicio: '2026-10-10', fechaFin: '2026-10-12' });
      expect((await api.listar(a.proId)).map((x) => x.id)).toEqual([primero.id, segundo.id]);
      await expect(api.crear(a.adminId, { ...datos, personalId: b.personalId,
        sucursalId: a.sucursalId })).rejects.toBeInstanceOf(NotFoundException);
      await expect(api.crear(a.adminId, { ...datos, personalId: a.personalId,
        sucursalId: b.sucursalId })).rejects.toBeInstanceOf(NotFoundException);
      await expect(db.query(`INSERT INTO bloqueos_horario (negocio_id,personal_id,
        sucursal_id,creador_usuario_id,tipo,motivo,fecha_inicio,fecha_fin)
        VALUES (?,?,?,?,?,?,?,?)`, [a.negocioId, b.personalId, a.sucursalId,
        a.adminId, 'vacaciones', 'Ajeno', '2026-10-10', '2026-10-11']))
        .rejects.toThrow();
    });
  });

  it('aplica matriz: Profesional gestiona su individual aunque lo creó admin', async () => {
    await conBaseMigrada(async (db) => {
      const [a, b] = await preparar(db);
      const api = servicio(db);
      const propio = await api.crear(a.adminId, { ...datos,
        personalId: a.personalId, sucursalId: a.sucursalId });
      const equipo = await api.crear(a.adminId, { ...datos,
        personalId: null, sucursalId: a.sucursalId });
      const ajeno = await api.crear(a.adminId, { ...datos,
        personalId: a.otroPersonalId, sucursalId: a.sucursalId });
      expect((await api.listar(a.proId)).map((x) => x.id)).toEqual([propio.id, equipo.id]);
      await api.editar(a.proId, propio.id, { motivo: 'Nuevo descanso' });
      expect((await api.listar(a.proId))[0]).toMatchObject({
        motivo: 'Nuevo descanso', fechaInicio: '2026-10-10', fechaFin: '2026-10-12' });
      await expect(api.editar(a.proId, propio.id, { personalId: null }))
        .rejects.toBeInstanceOf(ForbiddenException);
      await expect(api.editar(a.proId, propio.id, { personalId: a.otroPersonalId }))
        .rejects.toBeInstanceOf(ForbiddenException);
      await expect(api.editar(a.proId, equipo.id, { motivo: 'Cambio' }))
        .rejects.toBeInstanceOf(ForbiddenException);
      await expect(api.eliminar(a.proId, equipo.id)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(api.eliminar(a.proId, ajeno.id)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(api.crear(a.proId, { ...datos, personalId: null,
        sucursalId: a.sucursalId })).rejects.toBeInstanceOf(ForbiddenException);
      await expect(api.listar(a.recepcionId)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(api.eliminar(b.adminId, propio.id)).rejects.toBeInstanceOf(NotFoundException);
      await api.eliminar(a.proId, propio.id);
      expect((await api.listar(a.adminId)).map((x) => x.id)).toEqual([equipo.id, ajeno.id]);
      await db.query('UPDATE usuarios SET activo = 0 WHERE id = ?', [a.proId]);
      await expect(api.listar(a.proId)).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  it('rechaza edición de alcance inválido y conserva la fila anterior', async () => {
    await conBaseMigrada(async (db) => {
      const [a, b] = await preparar(db);
      const api = servicio(db);
      const bloqueo = await api.crear(a.adminId, { ...datos,
        personalId: a.personalId, sucursalId: a.sucursalId });
      await expect(api.editar(a.adminId, bloqueo.id,
        { personalId: b.personalId, motivo: 'Inválido' }))
        .rejects.toBeInstanceOf(NotFoundException);
      await expect(api.editar(a.adminId, bloqueo.id,
        { fechaFin: '2026-10-09', motivo: 'Inválido' }))
        .rejects.toBeInstanceOf(BadRequestException);
      expect((await api.listar(a.adminId))[0]).toMatchObject({
        motivo: datos.motivo, fechaInicio: '2026-10-10', fechaFin: '2026-10-12' });
      await api.editar(a.adminId, bloqueo.id, { personalId: null,
        sucursalId: null, motivo: 'Cierre colectivo' });
      expect((await api.listar(a.otroProId)).map((x) => x.id)).toEqual([bloqueo.id]);
    });
  });
});

describe('M5-T040–T042: listado paginado independiente del motor', () => {
  it('clasifica un colectivo una vez en dos zonas y conserva totales entre páginas', async () => {
    await conBaseMigrada(async db => {
      const [a] = await preparar(db);
      const sede = await db.query(`INSERT INTO sucursales
        (negocio_id,nombre,direccion,telefono,zona_horaria,activo)
        VALUES (?,'Pacífico','Calle Dos','6141234567','America/Tijuana',1)`, [a.negocioId]);
      await db.query('INSERT INTO personal_sucursales (negocio_id,personal_id,sucursal_id) VALUES (?,?,?)',
        [a.negocioId, a.personalId, Number(sede.insertId)]);
      const api = new BloqueosService(db.getRepository(BloqueoHorario), new AutorizacionService(),
        new RelojPrueba(new Date('2026-10-11T06:30:00Z')));
      const colectivo = await api.crear(a.adminId, { ...datos, personalId: null, sucursalId: null,
        fechaInicio: '2026-10-10', fechaFin: '2026-10-10', motivo: 'Colectivo' });
      await api.crear(a.adminId, { ...datos, personalId: a.personalId, sucursalId: a.sucursalId,
        fechaInicio: '2026-10-09', fechaFin: '2026-10-09', motivo: 'Anterior' });
      await api.crear(a.adminId, { ...datos, personalId: a.personalId, sucursalId: Number(sede.insertId),
        fechaInicio: '2026-10-12', fechaFin: '2026-10-12', motivo: 'Próximo' });
      const primera = await api.listarPagina(a.adminId, { limite: 1, pagina: 1 });
      expect(primera).toMatchObject({ total: 2, pagina: 1, limite: 1 });
      expect(primera.bloqueos).toHaveLength(1);
      const segunda = await api.listarPagina(a.adminId, { limite: 1, pagina: 2 });
      expect(segunda.total).toBe(2);
      expect([...primera.bloqueos, ...segunda.bloqueos].filter(x => x.id === colectivo.id)).toHaveLength(1);
      expect((await api.listarPagina(a.adminId, { limite: 1, pagina: 3 })))
        .toMatchObject({ bloqueos: [], total: 2 });
      expect((await api.listarPagina(a.adminId, { vigencia: 'anteriores' })).total).toBe(1);
      expect((await api.listarPagina(a.adminId, { vigencia: 'todos' })).total).toBe(3);
      expect((await api.listarPagina(a.adminId, { vigencia: 'todos', motivo: 'Colectivo',
        tipo: 'vacaciones', desde: '2026-10-10', hasta: '2026-10-10' })).bloqueos)
        .toMatchObject([{ id: colectivo.id, vigencia: 'vigente' }]);
      expect((await api.listarPagina(a.proId, { vigencia: 'todos' })).total).toBe(3);
      // El motor consulta todos los aplicables en su transacción y no recibe página ni vigencia.
      const motor = () => db.transaction(manager => new BloqueosAplicablesService().consultar({
        manager, negocioId: a.negocioId, personalId: a.personalId,
        ahora: new Date('2026-10-11T06:30:00Z'),
      }, a.sucursalId, '2026-10-10', '2026-10-10', 'America/Chihuahua'));
      const antes = await motor();
      await api.listarPagina(a.adminId, { pagina: 3, limite: 1, vigencia: 'todos' });
      expect(await motor()).toEqual(antes);
      expect(antes.map(bloqueo => bloqueo.id)).toEqual([colectivo.id]);
    });
  });
});
