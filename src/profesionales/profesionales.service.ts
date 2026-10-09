import { BadRequestException, ConflictException, ForbiddenException, Injectable,
  NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { randomUUID } from 'node:crypto';
import type { EntityManager } from 'typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { ReservaCorreoService } from '../altas/reserva-correo.service';
import { CorreoAcceso } from '../altas/entities/correo-acceso.entity';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { Sesion } from '../auth/entities/sesion.entity';
import { Rol } from '../auth/enums/rol.enum';
import { AutorizacionService, Permiso } from '../auth/services/autorizacion.service';
import { PoliticaContrasenasService } from '../auth/services/politica-contrasenas.service';
import { conflictoEliminacion, exigirEliminacionElegible } from '../comun/politica-eliminacion';
import { transaccionIdentidad } from '../comun/transaccion-identidad';
import { ExcepcionHorario } from '../horarios/entities/excepcion-horario.entity';
import { HorarioPersonal } from '../horarios/entities/horario-personal.entity';
import { Sucursal } from '../sucursales/entities/sucursal.entity';
import { Servicio } from '../servicios/entities/servicio.entity';
import { Usuario } from '../usuarios/entities/usuario.entity';
import { AsignarSucursalesDto, CrearProfesionalDto, EditarProfesionalDto,
  SeleccionarServiciosDto } from './dto/profesionales.dto';
import { Personal } from './entities/personal.entity';
import { PersonalSucursal } from './entities/personal-sucursal.entity';
import { PersonalServicio } from './entities/personal-servicio.entity';

export interface PerfilProfesional {
  id: number; negocioId: number; usuarioId: number;
  nombre: string; correo: string; activo: boolean; especialidad: string | null;
}

export interface OpcionServicioProfesional {
  id: number; nombre: string; costo: string; duracionMinutos: number;
  activo: boolean; seleccionado: boolean;
  descripcion: string | null; creadorPersonalId: number | null;
}

/** Cuenta, perfil, correo reservado y asignaciones comparten pertenencia transaccional. */
@Injectable()
export class ProfesionalesService {
  constructor(
    @InjectRepository(Personal) private readonly perfiles: Repository<Personal>,
    private readonly autorizacion: AutorizacionService,
    private readonly contrasenas: PoliticaContrasenasService,
    private readonly reservas: ReservaCorreoService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async crear(actorId: number, entrada: CrearProfesionalDto, ahora: Date): Promise<PerfilProfesional> {
    const datos = this.validar(CrearProfesionalDto, entrada);
    const correo = datos.correo.toLowerCase();
    const nombre = datos.nombre.replace(/\s+/g, ' ');
    const passwordHash = await this.contrasenas.generarHash(datos.password);
    try {
      return await transaccionIdentidad(this.perfiles.manager, async (manager) => {
        const actor = await this.actor(manager, actorId);
        const repoUsuario = manager.getRepository(Usuario);
        const usuario = await repoUsuario.save(repoUsuario.create({ negocioId: actor.negocioId!,
          nombre, email: correo, passwordHash, rol: Rol.PROFESIONAL, activo: true,
          creadoEn: new Date(ahora), activadoEn: new Date(ahora) }));
        // Reserva, cuenta, perfil y auditoría se confirman juntos o se revierten.
        await this.reservas.reservarUsuario(manager, { usuarioId: usuario.id,
          negocioId: actor.negocioId, correo });
        const repoPerfil = manager.getRepository(Personal);
        const perfil = await repoPerfil.save(repoPerfil.create({ id: usuario.id,
          negocioId: actor.negocioId! }));
        await this.registrar(manager, actor, perfil, 'profesional_creado', null,
          { nombre, correo, activo: true });
        return this.vista(perfil, usuario);
      });
    } catch (error) { return this.conflictoCorreo(error); }
  }

  async listar(actorId: number): Promise<PerfilProfesional[]> {
    const actor = await this.actor(this.perfiles.manager, actorId);
    const perfiles = await this.perfiles.find({ where: { negocioId: actor.negocioId! },
      relations: { usuario: true }, order: { id: 'ASC' } });
    return perfiles.map((perfil) => this.vista(perfil, perfil.usuario));
  }

  async consultar(actorId: number, id: number): Promise<PerfilProfesional> {
    const actor = await this.actor(this.perfiles.manager, actorId);
    const perfil = await this.perfiles.findOne({ where: { id, negocioId: actor.negocioId! },
      relations: { usuario: true } });
    if (!perfil) throw new NotFoundException('Profesional no disponible.');
    return this.vista(perfil, perfil.usuario);
  }

  async editar(actorId: number, id: number, entrada: EditarProfesionalDto,
    ahora: Date): Promise<PerfilProfesional> {
    const datos = this.validar(EditarProfesionalDto, entrada);
    if (datos.nombre === undefined && datos.correo === undefined && datos.password === undefined) {
      throw new BadRequestException('Indica un campo de Profesional.');
    }
    const hash = datos.password === undefined ? undefined : await this.contrasenas.generarHash(datos.password);
    try {
      return await transaccionIdentidad(this.perfiles.manager, async (manager) => {
        const actor = await this.actor(manager, actorId);
        const perfil = await this.bloquearPerfil(manager, actor.negocioId!, id);
        const usuario = await this.bloquearUsuario(manager, perfil);
        const antes = { nombre: usuario.nombre, correo: usuario.email };
        const correo = datos.correo?.toLowerCase();
        const cambioCorreo = correo !== undefined && correo !== usuario.email;
        const cambioNombre = datos.nombre !== undefined &&
          datos.nombre.replace(/\s+/g, ' ') !== usuario.nombre;
        if (cambioCorreo) {
          // La FK de reserva contiene el correo: se retira antes de modificar la cuenta.
          const reserva = await manager.getRepository(CorreoAcceso).findOneBy({
            usuarioId: usuario.id, correo: usuario.email });
          if (!reserva) throw new ConflictException('Reserva de correo no disponible.');
          await manager.getRepository(CorreoAcceso).delete(reserva.id);
          usuario.email = correo;
          usuario.correoVersion += 1;
        }
        if (cambioNombre) usuario.nombre = datos.nombre!.replace(/\s+/g, ' ');
        if (hash !== undefined) usuario.passwordHash = hash;
        if (cambioCorreo || cambioNombre || hash !== undefined) {
          await manager.getRepository(Usuario).save(usuario);
          if (cambioCorreo) await this.reservas.reservarUsuario(manager, {
            usuarioId: usuario.id, negocioId: actor.negocioId, correo: usuario.email });
          if (cambioCorreo || hash !== undefined) await this.revocarSesiones(manager, usuario.id, ahora);
          await this.registrar(manager, actor, perfil, 'profesional_editado', antes,
            { nombre: usuario.nombre, correo: usuario.email,
              accesoRenovado: hash !== undefined });
        }
        return this.vista(perfil, usuario);
      });
    } catch (error) { return this.conflictoCorreo(error); }
  }

  async cambiarEstado(actorId: number, id: number, activo: boolean, ahora: Date): Promise<void> {
    await transaccionIdentidad(this.perfiles.manager, async (manager) => {
      const actor = await this.actor(manager, actorId);
      const perfil = await this.bloquearPerfil(manager, actor.negocioId!, id);
      const usuario = await this.bloquearUsuario(manager, perfil);
      if (usuario.activo === activo) return;
      await manager.getRepository(Usuario).update(usuario.id, { activo });
      // Revocar en la misma transacción impide reusar sesiones al reactivar.
      if (!activo) await this.revocarSesiones(manager, usuario.id, ahora);
      await this.registrar(manager, actor, perfil,
        activo ? 'profesional_reactivado' : 'profesional_desactivado',
        { activo: usuario.activo }, { activo });
    });
  }

  async eliminar(actorId: number, id: number): Promise<void> {
    try {
      await transaccionIdentidad(this.perfiles.manager, async (manager) => {
        const actor = await this.actor(manager, actorId);
        const perfil = await this.bloquearPerfil(manager, actor.negocioId!, id);
        const usuario = await this.bloquearUsuario(manager, perfil);
        await exigirEliminacionElegible(manager, 'profesional', actor.negocioId!, id, usuario.id);
        // El alta se conserva; se libera únicamente su FK a la cuenta que se retira.
        await manager.query(`UPDATE eventos_auditoria SET usuario_id = NULL
          WHERE negocio_id = ? AND recurso_tipo = 'profesional' AND recurso_id = ?
            AND accion = 'profesional_creado' AND usuario_id = ?`,
        [actor.negocioId, id, usuario.id]);
        // La reserva técnica acompaña a la cuenta; no representa trabajo del Profesional.
        await manager.getRepository(CorreoAcceso).delete({ usuarioId: usuario.id });
        await manager.getRepository(Personal).delete({ id, negocioId: actor.negocioId! });
        await manager.getRepository(Usuario).delete({ id: usuario.id, negocioId: actor.negocioId! });
        await this.auditoria.registrar(manager, { operacionId: randomUUID(),
          actorUsuarioId: actor.id, negocioId: actor.negocioId, usuarioId: null,
          licenciaId: null, recursoTipo: 'profesional', recursoId: id,
          accion: 'profesional_eliminado',
          valoresAntes: { nombre: usuario.nombre, correo: usuario.email, activo: usuario.activo },
          valoresDespues: null });
      });
    } catch (error) { conflictoEliminacion(error); }
  }

  async listarSucursales(actorId: number, id: number): Promise<number[]> {
    const actor = await this.actor(this.perfiles.manager, actorId);
    await this.perfilPropio(this.perfiles.manager, actor.negocioId!, id);
    const relaciones = await this.perfiles.manager.getRepository(PersonalSucursal).find({
      where: { negocioId: actor.negocioId!, personalId: id }, order: { sucursalId: 'ASC' } });
    return relaciones.map((relacion) => relacion.sucursalId);
  }

  async asignarSucursales(actorId: number, id: number, entrada: AsignarSucursalesDto): Promise<number[]> {
    const datos = this.validar(AsignarSucursalesDto, entrada);
    return transaccionIdentidad(this.perfiles.manager, async (manager) => {
      const actor = await this.actor(manager, actorId);
      const perfil = await this.bloquearPerfil(manager, actor.negocioId!, id);
      const ids = [...datos.sucursalIds].sort((a, b) => a - b);
      if (ids.length) {
        const propias = await manager.getRepository(Sucursal).findBy({
          id: In(ids), negocioId: actor.negocioId! });
        if (propias.length !== ids.length) throw new NotFoundException('Sucursal no disponible.');
      }
      const repo = manager.getRepository(PersonalSucursal);
      const actuales = await repo.findBy({ negocioId: actor.negocioId!, personalId: id });
      const anteriores = actuales.map((r) => r.sucursalId).sort((a, b) => a - b);
      if (JSON.stringify(ids) === JSON.stringify(anteriores)) return ids;
      const retiradas = anteriores.filter((sucursalId) => !ids.includes(sucursalId));
      if (retiradas.length) {
        // El perfil ya está bloqueado: una semana o excepción concurrente no
        // puede confirmar entre la comprobación y el retiro de la asignación.
        const usadas = await Promise.all([
          manager.getRepository(HorarioPersonal).countBy({ negocioId: actor.negocioId!,
            personalId: id, sucursalId: In(retiradas) }),
          manager.getRepository(ExcepcionHorario).countBy({ negocioId: actor.negocioId!,
            personalId: id, sucursalId: In(retiradas) }),
        ]);
        if (usadas.some((total) => total > 0)) {
          throw new ConflictException('La sucursal conserva franjas o excepciones del Profesional.');
        }
      }
      // El bloqueo del perfil serializa reemplazos concurrentes del conjunto completo.
      await repo.delete({ negocioId: actor.negocioId!, personalId: id });
      if (ids.length) await repo.save(ids.map((sucursalId) => repo.create({
        negocioId: actor.negocioId!, personalId: id, sucursalId })));
      await this.registrar(manager, actor, perfil, 'profesional_sucursales_modificadas',
        { sucursalIds: anteriores }, { sucursalIds: ids });
      return ids;
    });
  }

  async listarServicios(actorId: number, id: number): Promise<OpcionServicioProfesional[]> {
    const manager = this.perfiles.manager;
    const actor = await this.actorServicios(manager, actorId);
    await this.perfilParaServicios(manager, actor, id);
    const [catalogo, relaciones] = await Promise.all([
      manager.getRepository(Servicio).find({ where: { negocioId: actor.negocioId! },
        order: { id: 'ASC' } }),
      manager.getRepository(PersonalServicio).findBy({ negocioId: actor.negocioId!,
        personalId: id }),
    ]);
    const seleccionados = new Set(relaciones.map((r) => r.servicioId));
    // Una selección histórica inactiva sigue visible, pero su estado global no cambia.
    return catalogo.filter((servicio) => servicio.activo || seleccionados.has(servicio.id))
      .map((servicio) => ({ id: servicio.id, nombre: servicio.nombre,
        costo: servicio.costo, duracionMinutos: servicio.duracionMinutos,
        activo: servicio.activo, seleccionado: seleccionados.has(servicio.id),
        descripcion: servicio.descripcion, creadorPersonalId: servicio.creadorPersonalId }));
  }

  async seleccionarServicios(actorId: number, id: number,
    entrada: SeleccionarServiciosDto): Promise<OpcionServicioProfesional[]> {
    const datos = this.validar(SeleccionarServiciosDto, entrada);
    await transaccionIdentidad(this.perfiles.manager, async (manager) => {
      const actor = await this.actorServicios(manager, actorId);
      const perfil = await this.perfilParaServicios(manager, actor, id, true);
      const repo = manager.getRepository(PersonalServicio);
      const actuales = await repo.findBy({ negocioId: actor.negocioId!, personalId: id });
      const antes = actuales.map((r) => r.servicioId).sort((a, b) => a - b);
      const ids = [...datos.servicioIds].sort((a, b) => a - b);
      if (JSON.stringify(ids) === JSON.stringify(antes)) return;
      const nuevos = ids.filter((servicioId) => !antes.includes(servicioId));
      if (ids.length) {
        // Bloquear los servicios evita admitir una selección nueva durante su desactivación.
        const servicios = await manager.getRepository(Servicio).createQueryBuilder('servicio')
          .setLock('pessimistic_read')
          .where('servicio.negocioId = :negocioId AND servicio.id IN (:...ids)',
            { negocioId: actor.negocioId, ids }).getMany();
        if (servicios.length !== ids.length) throw new NotFoundException('Servicio no disponible.');
        if (servicios.some((servicio) => nuevos.includes(servicio.id) && !servicio.activo)) {
          throw new ConflictException('No se puede seleccionar un servicio inactivo.');
        }
      }
      // El perfil bloqueado serializa reemplazos: solo se insertan y retiran relaciones.
      const quitados = antes.filter((servicioId) => !ids.includes(servicioId));
      if (quitados.length) await repo.delete({ negocioId: actor.negocioId!,
        personalId: id, servicioId: In(quitados) });
      if (nuevos.length) await repo.save(nuevos.map((servicioId) => repo.create({
        negocioId: actor.negocioId!, personalId: id, servicioId })));
      await this.registrar(manager, actor, perfil, 'profesional_servicios_modificados',
        { servicioIds: antes }, { servicioIds: ids });
    });
    return this.listarServicios(actorId, id);
  }

  async ofertaSucursal(actorId: number, sucursalId: number): Promise<Servicio[]> {
    const manager = this.perfiles.manager;
    const actor = await this.actor(manager, actorId);
    const sucursal = await manager.getRepository(Sucursal).findOneBy({
      id: sucursalId, negocioId: actor.negocioId! });
    if (!sucursal) throw new NotFoundException('Sucursal no disponible.');
    if (!sucursal.activo) return [];
    // La oferta se deriva de cuatro estados actuales; no se duplica en sucursales.
    return manager.getRepository(Servicio).createQueryBuilder('servicio')
      .distinct(true)
      .innerJoin(PersonalServicio, 'seleccion',
        'seleccion.servicioId = servicio.id AND seleccion.negocioId = servicio.negocioId')
      .innerJoin(Personal, 'perfil',
        'perfil.id = seleccion.personalId AND perfil.negocioId = servicio.negocioId')
      .innerJoin(Usuario, 'cuenta',
        'cuenta.id = perfil.id AND cuenta.negocioId = perfil.negocioId')
      .innerJoin(PersonalSucursal, 'asignacion',
        'asignacion.personalId = perfil.id AND asignacion.negocioId = perfil.negocioId')
      .where('servicio.negocioId = :negocioId AND servicio.activo = :activo AND cuenta.activo = :activo',
        { negocioId: actor.negocioId, activo: true })
      .andWhere('asignacion.sucursalId = :sucursalId', { sucursalId })
      .orderBy('servicio.id', 'ASC').getMany();
  }

  private validar<T extends object>(tipo: new () => T, valor: T): T {
    const datos = plainToInstance(tipo, valor);
    const errores = validateSync(datos, { whitelist: true, forbidNonWhitelisted: true });
    if (errores.length) throw new BadRequestException(errores.flatMap((error) =>
      Object.values(error.constraints ?? { campo: `${error.property} inválido` })));
    return datos;
  }

  private async actor(manager: EntityManager, id: number): Promise<Usuario> {
    const consulta = manager.getRepository(Usuario).createQueryBuilder('actor')
      .where('actor.id = :id', { id });
    if (manager.queryRunner?.isTransactionActive) consulta.setLock('pessimistic_read');
    const actor = await consulta.getOne();
    if (!actor || !actor.activo || actor.activadoEn === null || actor.negocioId === null) {
      throw new ForbiddenException('Cuenta no disponible.');
    }
    this.autorizacion.exigir(actor.rol, Permiso.GESTIONAR_PROFESIONALES);
    return actor;
  }

  private async actorServicios(manager: EntityManager, id: number): Promise<Usuario> {
    const consulta = manager.getRepository(Usuario).createQueryBuilder('actor')
      .where('actor.id = :id', { id });
    if (manager.queryRunner?.isTransactionActive) consulta.setLock('pessimistic_read');
    const actor = await consulta.getOne();
    if (!actor || !actor.activo || actor.activadoEn === null || actor.negocioId === null) {
      throw new ForbiddenException('Cuenta no disponible.');
    }
    this.autorizacion.exigir(actor.rol, Permiso.GESTIONAR_SERVICIOS_PROPIOS);
    return actor;
  }

  private async perfilParaServicios(manager: EntityManager, actor: Usuario,
    id: number, bloquear = false): Promise<Personal> {
    const consulta = manager.getRepository(Personal).createQueryBuilder('perfil')
      .where('perfil.id = :id AND perfil.negocioId = :negocioId',
        { id, negocioId: actor.negocioId });
    if (bloquear) consulta.setLock('pessimistic_write');
    const perfil = await consulta.getOne();
    if (!perfil) throw new NotFoundException('Profesional no disponible.');
    if (actor.rol === Rol.PROFESIONAL && perfil.id !== actor.id) {
      throw new ForbiddenException('Profesional no autorizado.');
    }
    return perfil;
  }

  private async perfilPropio(manager: EntityManager, negocioId: number, id: number): Promise<Personal> {
    const perfil = await manager.getRepository(Personal).findOneBy({ id, negocioId });
    if (!perfil) throw new NotFoundException('Profesional no disponible.');
    return perfil;
  }

  private async bloquearPerfil(manager: EntityManager, negocioId: number, id: number): Promise<Personal> {
    const perfil = await manager.getRepository(Personal).createQueryBuilder('perfil')
      .setLock('pessimistic_write')
      .where('perfil.id = :id AND perfil.negocioId = :negocioId', { id, negocioId }).getOne();
    if (!perfil) throw new NotFoundException('Profesional no disponible.');
    return perfil;
  }

  private async bloquearUsuario(manager: EntityManager, perfil: Personal): Promise<Usuario> {
    const usuario = await manager.getRepository(Usuario).createQueryBuilder('usuario')
      .setLock('pessimistic_write')
      .where('usuario.id = :id AND usuario.negocioId = :negocioId AND usuario.rol = :rol',
        { id: perfil.id, negocioId: perfil.negocioId, rol: Rol.PROFESIONAL }).getOne();
    if (!usuario) throw new ConflictException('Cuenta Profesional no disponible.');
    return usuario;
  }

  private revocarSesiones(manager: EntityManager, usuarioId: number, ahora: Date) {
    return manager.getRepository(Sesion).update({ usuarioId, revocadaEn: IsNull() },
      { revocadaEn: new Date(ahora) });
  }

  private vista(perfil: Personal, usuario: Usuario): PerfilProfesional {
    // La identidad sigue en Usuario; la proyección incorpora solo el dato propio del perfil.
    return { id: perfil.id, negocioId: perfil.negocioId, usuarioId: perfil.id,
      nombre: usuario.nombre!, correo: usuario.email, activo: usuario.activo,
      especialidad: perfil.especialidad };
  }

  private async registrar(manager: EntityManager, actor: Usuario, perfil: Personal,
    accion: string, antes: Record<string, unknown> | null,
    despues: Record<string, unknown>): Promise<void> {
    await this.auditoria.registrar(manager, { operacionId: randomUUID(),
      actorUsuarioId: actor.id, negocioId: actor.negocioId, usuarioId: perfil.id,
      licenciaId: null, recursoTipo: 'profesional', recursoId: perfil.id,
      accion, valoresAntes: antes, valoresDespues: despues });
  }

  private conflictoCorreo(error: unknown): never {
    const codigo = (error as { driverError?: { code?: string } }).driverError?.code
      ?? (error as { code?: string }).code;
    if (codigo === 'ER_DUP_ENTRY') throw new ConflictException('El correo ya está registrado.');
    throw error;
  }
}
