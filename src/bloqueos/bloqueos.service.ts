import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import type { EntityManager } from 'typeorm';
import { Rol } from '../auth/enums/rol.enum';
import { AutorizacionService, Permiso } from '../auth/services/autorizacion.service';
import { transaccionIdentidad } from '../comun/transaccion-identidad';
import { Personal } from '../profesionales/entities/personal.entity';
import { PersonalSucursal } from '../profesionales/entities/personal-sucursal.entity';
import { Sucursal } from '../sucursales/entities/sucursal.entity';
import { Usuario } from '../usuarios/entities/usuario.entity';
import { BloqueoHorario } from './entities/bloqueo-horario.entity';
import { intervaloBloqueo } from './calculo-bloqueos';
import { DatosBloqueo, validarBloqueo } from './validar-bloqueo';

/** Persiste cada restricción por separado; la atención calcula su unión al consultar. */
@Injectable()
export class BloqueosService {
  constructor(@InjectRepository(BloqueoHorario)
    private readonly bloqueos: Repository<BloqueoHorario>,
    private readonly autorizacion: AutorizacionService) {}

  async crear(actorId: number, entrada: DatosBloqueo): Promise<BloqueoHorario> {
    const datos = validarBloqueo(entrada);
    return transaccionIdentidad(this.bloqueos.manager, async (manager) => {
      const actor = await this.actor(manager, actorId);
      await this.exigirAlcance(manager, actor, datos);
      const repo = manager.getRepository(BloqueoHorario);
      return repo.save(repo.create({ ...datos, negocioId: actor.negocioId!,
        creadorUsuarioId: actor.id }));
    });
  }

  async editar(actorId: number, id: number,
    cambio: Partial<DatosBloqueo>): Promise<BloqueoHorario> {
    return transaccionIdentidad(this.bloqueos.manager, async (manager) => {
      const actor = await this.actor(manager, actorId);
      const repo = manager.getRepository(BloqueoHorario);
      const actual = await repo.createQueryBuilder('b').setLock('pessimistic_write')
        .where('b.id = :id AND b.negocioId = :negocioId',
          { id, negocioId: actor.negocioId }).getOne();
      if (!actual) throw new NotFoundException('Bloqueo no disponible.');
      await this.fechasCiviles(manager, actor.negocioId!, [actual]);
      // Autoriza el estado previo y el candidato para impedir escalar el alcance al editar.
      await this.exigirAlcance(manager, actor, this.datos(actual));
      // class-transformer puede crear propiedades undefined: solo las presentes cambian.
      const definidos = Object.fromEntries(Object.entries(cambio)
        .filter(([, valor]) => valor !== undefined)) as Partial<DatosBloqueo>;
      if (!Object.keys(definidos).length) {
        throw new BadRequestException('Indica un campo de bloqueo.');
      }
      const datos = validarBloqueo({ ...this.datos(actual), ...definidos });
      await this.exigirAlcance(manager, actor, datos);
      Object.assign(actual, datos);
      return repo.save(actual);
    });
  }

  async listar(actorId: number, filtro: { personalId?: number; sucursalId?: number } = {})
    : Promise<BloqueoHorario[]> {
    const manager = this.bloqueos.manager;
    const actor = await this.actor(manager, actorId);
    if (filtro.personalId !== undefined) {
      const perfilFiltrado = await manager.getRepository(Personal).findOneBy({
        id: filtro.personalId, negocioId: actor.negocioId! });
      if (!perfilFiltrado) throw new NotFoundException('Profesional no disponible.');
      this.autorizacion.exigirSobreRecurso(actor, Permiso.GESTIONAR_BLOQUEOS,
        { negocioId: actor.negocioId!, usuarioId: perfilFiltrado.usuarioId });
    }
    if (filtro.sucursalId !== undefined && !await manager.getRepository(Sucursal).findOneBy({
      id: filtro.sucursalId, negocioId: actor.negocioId! })) {
      throw new NotFoundException('Sucursal no disponible.');
    }
    if (filtro.sucursalId !== undefined && actor.rol === Rol.PROFESIONAL) {
      const perfilFiltro = await manager.getRepository(Personal).findOneBy({
        negocioId: actor.negocioId!, usuarioId: actor.id });
      if (!perfilFiltro || !await manager.getRepository(PersonalSucursal).findOneBy({
        negocioId: actor.negocioId!, personalId: perfilFiltro.id,
        sucursalId: filtro.sucursalId })) {
        throw new NotFoundException('Sucursal no asignada al Profesional.');
      }
    }
    if (actor.rol === Rol.ADMIN_NEGOCIO) {
      const filas = await this.bloqueos.find({ where: { negocioId: actor.negocioId! },
        order: { id: 'ASC' } });
      await this.fechasCiviles(manager, actor.negocioId!, filas);
      return this.filtrar(filas, filtro);
    }
    const perfil = await manager.getRepository(Personal).findOneBy({
      negocioId: actor.negocioId!, usuarioId: actor.id });
    if (!perfil) throw new ForbiddenException('Profesional sin perfil.');
    const asignaciones = await manager.getRepository(PersonalSucursal).findBy({
      negocioId: actor.negocioId!, personalId: perfil.id });
    const sedes = asignaciones.map((x) => x.sucursalId);
    const consulta = this.bloqueos.createQueryBuilder('b')
      .where('b.negocioId = :negocioId', { negocioId: actor.negocioId })
      .andWhere('(b.personalId = :personalId OR b.personalId IS NULL)',
        { personalId: perfil.id });
    if (sedes.length) consulta.andWhere('(b.sucursalId IS NULL OR b.sucursalId IN (:...sedes))',
      { sedes });
    else consulta.andWhere('b.sucursalId IS NULL');
    const filas = await consulta.orderBy('b.id', 'ASC').getMany();
    await this.fechasCiviles(manager, actor.negocioId!, filas);
    return this.filtrar(filas, filtro);
  }

  async eliminar(actorId: number, id: number): Promise<void> {
    await transaccionIdentidad(this.bloqueos.manager, async (manager) => {
      const actor = await this.actor(manager, actorId);
      const repo = manager.getRepository(BloqueoHorario);
      const actual = await repo.createQueryBuilder('b').setLock('pessimistic_write')
        .where('b.id = :id AND b.negocioId = :negocioId',
          { id, negocioId: actor.negocioId }).getOne();
      if (!actual) throw new NotFoundException('Bloqueo no disponible.');
      await this.exigirAlcance(manager, actor, this.datos(actual));
      // El borrado usa exclusivamente la PK autorizada: los bloques solapados permanecen.
      await repo.delete({ id: actual.id, negocioId: actor.negocioId! });
    });
  }

  private async actor(manager: EntityManager, actorId: number): Promise<Usuario> {
    const consulta = manager.getRepository(Usuario).createQueryBuilder('actor')
      .where('actor.id = :actorId', { actorId });
    if (manager.queryRunner?.isTransactionActive) consulta.setLock('pessimistic_read');
    const actor = await consulta.getOne();
    // Un permiso de rol no reactiva una cuenta deshabilitada o no activada.
    if (!actor || !actor.activo || actor.activadoEn === null) {
      throw new ForbiddenException('Cuenta no disponible.');
    }
    this.autorizacion.exigir(actor.rol, Permiso.GESTIONAR_BLOQUEOS);
    if (actor.negocioId === null) throw new ForbiddenException('Negocio no disponible.');
    return actor;
  }

  private async exigirAlcance(manager: EntityManager, actor: Usuario,
    datos: DatosBloqueo): Promise<void> {
    const negocioId = actor.negocioId!;
    let perfil: Personal | null = null;
    if (datos.personalId !== null) {
      perfil = await manager.getRepository(Personal).findOneBy({ id: datos.personalId, negocioId });
      if (!perfil) throw new NotFoundException('Profesional no disponible.');
    }
    // El creador no concede privilegios: la propiedad se decide por el perfil afectado.
    this.autorizacion.exigirSobreRecurso(actor, Permiso.GESTIONAR_BLOQUEOS, {
      negocioId, alcanceEquipo: datos.personalId === null, usuarioId: perfil?.usuarioId });
    if (datos.sucursalId !== null) {
      if (!await manager.getRepository(Sucursal).findOneBy({ id: datos.sucursalId, negocioId })) {
        throw new NotFoundException('Sucursal no disponible.');
      }
      if (perfil && !await manager.getRepository(PersonalSucursal).findOneBy({
        negocioId, personalId: perfil.id, sucursalId: datos.sucursalId })) {
        throw new NotFoundException('Sucursal no asignada al Profesional.');
      }
    }
    // El alcance no se copia a destinatarios: se consulta la asignación vigente.
    const ids = datos.sucursalId !== null ? [datos.sucursalId] : perfil ?
      (await manager.getRepository(PersonalSucursal).findBy({ negocioId,
        personalId: perfil.id })).map((fila) => fila.sucursalId) :
      (await manager.getRepository(Sucursal).findBy({ negocioId })).map((fila) => fila.id);
    if (datos.inicioMinutos !== null && ids.length) {
      const sedes = await manager.getRepository(Sucursal).findBy({ negocioId, id: In(ids) });
      // Valida ambos extremos en cada huso; una hora ambigua revierte toda la operación.
      for (const sede of sedes) intervaloBloqueo(datos, sede.zonaHoraria);
    }
  }

  private datos(fila: BloqueoHorario): DatosBloqueo {
    return { personalId: fila.personalId ?? null, sucursalId: fila.sucursalId ?? null,
      tipo: fila.tipo, motivo: fila.motivo, fechaInicio: fila.fechaInicio,
      fechaFin: fila.fechaFin, inicioMinutos: fila.inicioMinutos ?? null,
      finMinutos: fila.finMinutos ?? null };
  }

  private filtrar(filas: BloqueoHorario[], filtro: { personalId?: number; sucursalId?: number }) {
    // Null en un bloque significa equipo o todas las sedes, también bajo filtro.
    return filas.filter((fila) => (filtro.personalId === undefined ||
      fila.personalId === null || fila.personalId === filtro.personalId) &&
      (filtro.sucursalId === undefined || fila.sucursalId === null ||
        fila.sucursalId === filtro.sucursalId));
  }

  private async fechasCiviles(manager: EntityManager, negocioId: number,
    filas: BloqueoHorario[]): Promise<void> {
    if (!filas.length) return;
    // mysql2 en esta configuración hidrata DATE con un día de desfase; el SQL conserva
    // la fecha civil original y evita editar el día equivocado al guardar de nuevo.
    const fechas: { id: number; inicio: string; fin: string }[] = await manager.query(
      `SELECT id, DATE_FORMAT(fecha_inicio, '%Y-%m-%d') inicio,
        DATE_FORMAT(fecha_fin, '%Y-%m-%d') fin FROM bloqueos_horario
        WHERE negocio_id = ? AND id IN (${filas.map(() => '?').join(',')})`,
      [negocioId, ...filas.map((fila) => fila.id)]);
    const porId = new Map(fechas.map((fila) => [fila.id, fila]));
    for (const fila of filas) {
      const fechasFila = porId.get(fila.id);
      if (fechasFila) { fila.fechaInicio = fechasFila.inicio; fila.fechaFin = fechasFila.fin; }
    }
  }
}
