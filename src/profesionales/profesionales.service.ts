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
import { validarRecurrencias } from '../horarios/calendario';
import { Sucursal } from '../sucursales/entities/sucursal.entity';
import { Servicio } from '../servicios/entities/servicio.entity';
import { Usuario } from '../usuarios/entities/usuario.entity';
import { AsignarSucursalesDto, CrearProfesionalDto, EditarProfesionalDto,
  SeleccionarServiciosDto } from './dto/profesionales.dto';
import { Personal } from './entities/personal.entity';
import { PersonalSucursal } from './entities/personal-sucursal.entity';
import { PersonalServicio } from './entities/personal-servicio.entity';
import { PersonalServicioSucursal } from './entities/personal-servicio-sucursal.entity';

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
          negocioId: actor.negocioId!, especialidad: datos.especialidad }));
        await this.registrar(manager, actor, perfil, 'profesional_creado', null,
          { nombre, correo, especialidad: datos.especialidad, activo: true });
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
    if (datos.nombre === undefined && datos.correo === undefined &&
      datos.password === undefined && datos.especialidad === undefined) {
      throw new BadRequestException('Indica un campo de Profesional.');
    }
    const hash = datos.password === undefined ? undefined : await this.contrasenas.generarHash(datos.password);
    try {
      return await transaccionIdentidad(this.perfiles.manager, async (manager) => {
        const actor = await this.actor(manager, actorId);
        const perfil = await this.bloquearPerfil(manager, actor.negocioId!, id);
        const usuario = await this.bloquearUsuario(manager, perfil);
        // Un perfil histórico sigue consultable, pero su siguiente edición completa el dato.
        if (!perfil.especialidad?.trim() && datos.especialidad === undefined) {
          throw new BadRequestException('La especialidad es obligatoria para editar este Profesional.');
        }
        const antes = { nombre: usuario.nombre, correo: usuario.email,
          especialidad: perfil.especialidad };
        const correo = datos.correo?.toLowerCase();
        const cambioCorreo = correo !== undefined && correo !== usuario.email;
        const cambioNombre = datos.nombre !== undefined &&
          datos.nombre.replace(/\s+/g, ' ') !== usuario.nombre;
        const cambioEspecialidad = datos.especialidad !== undefined &&
          datos.especialidad !== perfil.especialidad;
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
        if (cambioEspecialidad) {
          perfil.especialidad = datos.especialidad!;
          await manager.getRepository(Personal).save(perfil);
        }
        if (cambioCorreo || cambioNombre || hash !== undefined) {
          await manager.getRepository(Usuario).save(usuario);
          if (cambioCorreo) await this.reservas.reservarUsuario(manager, {
            usuarioId: usuario.id, negocioId: actor.negocioId, correo: usuario.email });
          if (cambioCorreo || hash !== undefined) await this.revocarSesiones(manager, usuario.id, ahora);
        }
        if (cambioCorreo || cambioNombre || hash !== undefined || cambioEspecialidad) {
          await this.registrar(manager, actor, perfil, 'profesional_editado', antes,
            { nombre: usuario.nombre, correo: usuario.email,
              especialidad: perfil.especialidad,
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
      // La diferencia conserva las asignaciones vigentes y sus preferencias por sucursal.
      const agregadas = ids.filter((sucursalId) => !anteriores.includes(sucursalId));
      if (retiradas.length) {
        await manager.getRepository(PersonalServicioSucursal).delete({
          negocioId: actor.negocioId!, personalId: id, sucursalId: In(retiradas) });
        await repo.delete({ negocioId: actor.negocioId!, personalId: id,
          sucursalId: In(retiradas) });
      }
      if (agregadas.length) {
        await repo.save(agregadas.map((sucursalId) => repo.create({
          negocioId: actor.negocioId!, personalId: id, sucursalId })));
        // Una sucursal recién asignada parte de los servicios generales activos.
        const selecciones = await manager.getRepository(PersonalServicio).findBy({
          negocioId: actor.negocioId!, personalId: id, activo: true });
        const repoOferta = manager.getRepository(PersonalServicioSucursal);
        await repoOferta.save(agregadas.flatMap((sucursalId) => selecciones.map((seleccion) =>
          repoOferta.create({ negocioId: actor.negocioId!, personalId: id, sucursalId,
            servicioId: seleccion.servicioId }))));
      }
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
    const historicos = new Set(relaciones.map((r) => r.servicioId));
    const seleccionados = new Set(relaciones.filter((r) => r.activo).map((r) => r.servicioId));
    // Una selección histórica inactiva sigue visible, pero su estado global no cambia.
    return catalogo.filter((servicio) => servicio.activo || historicos.has(servicio.id))
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
      const antes = actuales.filter((r) => r.activo).map((r) => r.servicioId)
        .sort((a, b) => a - b);
      const ids = [...datos.servicioIds].sort((a, b) => a - b);
      if (JSON.stringify(ids) === JSON.stringify(antes)) return;
      const nuevos = ids.filter((servicioId) => !actuales.some((r) =>
        r.servicioId === servicioId));
      const recuperados = ids.filter((servicioId) => actuales.some((r) =>
        r.servicioId === servicioId && !r.activo));
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
      // Desmarcar mantiene selección y preferencias; reactivar recupera sus estados previos.
      const quitados = antes.filter((servicioId) => !ids.includes(servicioId));
      if (quitados.length) await repo.update({ negocioId: actor.negocioId!,
        personalId: id, servicioId: In(quitados) }, { activo: false });
      if (recuperados.length) await repo.update({ negocioId: actor.negocioId!,
        personalId: id, servicioId: In(recuperados) }, { activo: true });
      if (nuevos.length) await repo.save(nuevos.map((servicioId) => repo.create({
        negocioId: actor.negocioId!, personalId: id, servicioId })));
      if (nuevos.length) {
        // Solo las selecciones inéditas reciben combinaciones iniciales; las recuperadas
        // conservan incluso los estados individuales desactivados con anterioridad.
        const sucursales = await manager.getRepository(PersonalSucursal).findBy({
          negocioId: actor.negocioId!, personalId: id });
        const repoOferta = manager.getRepository(PersonalServicioSucursal);
        await repoOferta.save(nuevos.flatMap((servicioId) => sucursales.map((asignacion) =>
          repoOferta.create({ negocioId: actor.negocioId!, personalId: id,
            sucursalId: asignacion.sucursalId, servicioId }))));
      }
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
    // La oferta exige selección, asignación y preferencia individual activas.
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
      .innerJoin(PersonalServicioSucursal, 'oferta',
        'oferta.negocioId = seleccion.negocioId AND oferta.personalId = seleccion.personalId'
        + ' AND oferta.servicioId = seleccion.servicioId'
        + ' AND oferta.sucursalId = asignacion.sucursalId')
      .where('servicio.negocioId = :negocioId AND servicio.activo = :activo AND cuenta.activo = :activo',
        { negocioId: actor.negocioId, activo: true })
      .andWhere('seleccion.activo = :activo AND asignacion.activo = :activo'
        + ' AND oferta.activo = :activo AND asignacion.sucursalId = :sucursalId', { sucursalId })
      .orderBy('servicio.id', 'ASC').getMany();
  }

  async consultarOferta(actorId: number, id: number) {
    return this.perfiles.manager.transaction('REPEATABLE READ', async (manager) => {
      const actor = await this.actorServicios(manager, actorId);
      await this.perfilParaServicios(manager, actor, id);
      const negocioId = actor.negocioId!;
      const cuenta = await manager.getRepository(Usuario).findOneBy({
        id, negocioId, rol: Rol.PROFESIONAL });
      if (!cuenta) throw new NotFoundException('Profesional no disponible.');
      const asignaciones = await manager.getRepository(PersonalSucursal).find({
        where: { negocioId, personalId: id }, order: { sucursalId: 'ASC' } });
      const sucursalIds = asignaciones.map((fila) => fila.sucursalId);
      const sucursales = sucursalIds.length ? await manager.getRepository(Sucursal).findBy({
        negocioId, id: In(sucursalIds) }) : [];
      const sucursalPorId = new Map(sucursales.map((fila) => [fila.id, fila]));
      const catalogo = await manager.getRepository(Servicio).find({
        where: { negocioId }, order: { id: 'ASC' } });
      const selecciones = await manager.getRepository(PersonalServicio).findBy({
        negocioId, personalId: id });
      const combinaciones = await manager.getRepository(PersonalServicioSucursal).findBy({
        negocioId, personalId: id });
      const seleccionPorServicio = new Map(selecciones.map((fila) => [fila.servicioId, fila]));
      const combinacionPorClave = new Map(combinaciones.map((fila) =>
        [`${fila.sucursalId}:${fila.servicioId}`, fila]));

      // La respuesta conserva estados fuente y deriva el resultado de cada par;
      // consultar no cambia preferencias ni graba una bandera de oferta efectiva.
      return { personalId: id, cuentaActiva: cuenta.activo,
        sucursales: asignaciones.map((asignacion) => {
          const sucursal = sucursalPorId.get(asignacion.sucursalId)!;
          return { id: sucursal.id, nombre: sucursal.nombre,
            sucursalActiva: sucursal.activo, atencionActiva: asignacion.activo,
            servicios: catalogo.map((servicio) => {
              const seleccionGeneralActiva = seleccionPorServicio.get(servicio.id)?.activo ?? false;
              const seleccionSucursalActiva = combinacionPorClave
                .get(`${sucursal.id}:${servicio.id}`)?.activo ?? false;
              const motivosExclusion: string[] = [];
              if (!cuenta.activo) motivosExclusion.push('cuenta_inactiva');
              if (!sucursal.activo) motivosExclusion.push('sucursal_inactiva');
              if (!servicio.activo) motivosExclusion.push('servicio_inactivo');
              if (!seleccionGeneralActiva) motivosExclusion.push('servicio_no_seleccionado');
              if (!asignacion.activo) motivosExclusion.push('atencion_inactiva');
              if (!seleccionSucursalActiva) {
                motivosExclusion.push('servicio_no_ofrecido_en_sucursal');
              }
              return { id: servicio.id, nombre: servicio.nombre,
                servicioActivo: servicio.activo, seleccionGeneralActiva,
                seleccionSucursalActiva, ofrecido: motivosExclusion.length === 0,
                motivosExclusion };
            }) };
        }) };
    });
  }

  async consultarAtencionSucursal(actorId: number, id: number, sucursalId: number) {
    const manager = this.perfiles.manager;
    const actor = await this.actorServicios(manager, actorId);
    await this.perfilParaServicios(manager, actor, id);
    const asignacion = await this.exigirAsignacion(manager, actor.negocioId!, id, sucursalId);
    return { sucursalId, activo: asignacion.activo };
  }

  async cambiarAtencionSucursal(actorId: number, id: number, sucursalId: number,
    activo: boolean, desde: string) {
    if (typeof activo !== 'boolean') throw new BadRequestException('activo: debe ser booleano.');
    return transaccionIdentidad(this.perfiles.manager, async (manager) => {
      const actor = await this.actorServicios(manager, actorId);
      // Horarios y excepciones bloquean esta misma fila; la validación no puede quedar obsoleta.
      const perfil = await this.perfilParaServicios(manager, actor, id, true);
      const asignacion = await this.exigirAsignacion(manager, actor.negocioId!, id, sucursalId);
      if (asignacion.activo === activo) return { sucursalId, activo };
      if (activo) await this.validarReactivacion(manager, actor.negocioId!, id,
        sucursalId, desde);
      await manager.getRepository(PersonalSucursal).update({ negocioId: actor.negocioId!,
        personalId: id, sucursalId }, { activo });
      await this.registrar(manager, actor, perfil, 'profesional_atencion_sucursal_modificada',
        { sucursalId, activo: asignacion.activo }, { sucursalId, activo });
      return { sucursalId, activo };
    });
  }

  async listarServiciosSucursal(actorId: number, id: number, sucursalId: number) {
    const manager = this.perfiles.manager;
    const actor = await this.actorServicios(manager, actorId);
    await this.perfilParaServicios(manager, actor, id);
    await this.exigirAsignacion(manager, actor.negocioId!, id, sucursalId);
    const [selecciones, ofertas] = await Promise.all([
      manager.getRepository(PersonalServicio).findBy({ negocioId: actor.negocioId!,
        personalId: id, activo: true }),
      manager.getRepository(PersonalServicioSucursal).findBy({ negocioId: actor.negocioId!,
        personalId: id, sucursalId, activo: true }),
    ]);
    const generales = new Set(selecciones.map((fila) => fila.servicioId));
    return { sucursalId, servicioIds: ofertas.map((fila) => fila.servicioId)
      .filter((servicioId) => generales.has(servicioId)).sort((a, b) => a - b) };
  }

  async seleccionarServiciosSucursal(actorId: number, id: number, sucursalId: number,
    entrada: SeleccionarServiciosDto) {
    const datos = this.validar(SeleccionarServiciosDto, entrada);
    await transaccionIdentidad(this.perfiles.manager, async (manager) => {
      const actor = await this.actorServicios(manager, actorId);
      const perfil = await this.perfilParaServicios(manager, actor, id, true);
      await this.exigirAsignacion(manager, actor.negocioId!, id, sucursalId);
      const ids = [...datos.servicioIds].sort((a, b) => a - b);
      if (ids.length) {
        const propios = await manager.getRepository(Servicio).findBy({
          negocioId: actor.negocioId!, id: In(ids) });
        if (propios.length !== ids.length) throw new NotFoundException('Servicio no disponible.');
        const generales = await manager.getRepository(PersonalServicio).findBy({
          negocioId: actor.negocioId!, personalId: id, servicioId: In(ids), activo: true });
        if (generales.length !== ids.length) {
          throw new ConflictException('El servicio no está seleccionado por el Profesional.');
        }
      }
      const repo = manager.getRepository(PersonalServicioSucursal);
      const actuales = await repo.findBy({ negocioId: actor.negocioId!, personalId: id,
        sucursalId });
      const antes = actuales.filter((fila) => fila.activo).map((fila) => fila.servicioId)
        .sort((a, b) => a - b);
      if (JSON.stringify(antes) === JSON.stringify(ids)) return;
      // El reemplazo modifica solo esta sucursal; las filas apagadas conservan preferencia.
      const retirar = antes.filter((servicioId) => !ids.includes(servicioId));
      const recuperar = actuales.filter((fila) => !fila.activo && ids.includes(fila.servicioId))
        .map((fila) => fila.servicioId);
      const nuevas = ids.filter((servicioId) => !actuales.some((fila) =>
        fila.servicioId === servicioId));
      if (retirar.length) await repo.update({ negocioId: actor.negocioId!, personalId: id,
        sucursalId, servicioId: In(retirar) }, { activo: false });
      if (recuperar.length) await repo.update({ negocioId: actor.negocioId!, personalId: id,
        sucursalId, servicioId: In(recuperar) }, { activo: true });
      if (nuevas.length) await repo.save(nuevas.map((servicioId) => repo.create({
        negocioId: actor.negocioId!, personalId: id, sucursalId, servicioId })));
      await this.registrar(manager, actor, perfil, 'profesional_servicios_sucursal_modificados',
        { sucursalId, servicioIds: antes }, { sucursalId, servicioIds: ids });
    });
    return this.listarServiciosSucursal(actorId, id, sucursalId);
  }

  private async exigirAsignacion(manager: EntityManager, negocioId: number,
    personalId: number, sucursalId: number): Promise<PersonalSucursal> {
    const asignacion = await manager.getRepository(PersonalSucursal).findOneBy({
      negocioId, personalId, sucursalId });
    if (!asignacion) throw new NotFoundException('Sucursal no asignada.');
    return asignacion;
  }

  private async validarReactivacion(manager: EntityManager, negocioId: number,
    personalId: number, sucursalId: number, desde: string): Promise<void> {
    const [semana, excepciones, asignaciones] = await Promise.all([
      manager.getRepository(HorarioPersonal).findBy({ negocioId, personalId }),
      manager.getRepository(ExcepcionHorario).find({ where: { negocioId, personalId },
        relations: { franjas: true } }),
      manager.getRepository(PersonalSucursal).findBy({ negocioId, personalId }),
    ]);
    const ids = asignaciones.map((fila) => fila.sucursalId);
    const atendidas = new Set(asignaciones.filter((fila) => fila.activo ||
      fila.sucursalId === sucursalId).map((fila) => fila.sucursalId));
    const sucursales = ids.length ? await manager.getRepository(Sucursal).findBy({
      negocioId, id: In(ids) }) : [];
    const zonas = new Map(sucursales.map((fila) => [fila.id, fila.zonaHoraria]));
    // DATE_FORMAT conserva el día civil SQL; el driver puede desplazar DATE al
    // convertirlo a Date en el huso local y falsear el día de una excepción.
    const fechas: { id: number; fecha_local: string }[] = excepciones.length
      ? await manager.query(`SELECT id, DATE_FORMAT(fecha_local, '%Y-%m-%d') fecha_local
        FROM excepciones_horario WHERE negocio_id = ? AND personal_id = ?`,
      [negocioId, personalId]) : [];
    const fechaPorId = new Map(fechas.map((fila) => [Number(fila.id), fila.fecha_local]));
    // Se comparan las sucursales atendidas y la candidata; otras pausadas no
    // bloquean una reactivación por conflictos que aún no forman parte de la oferta.
    const conflicto = validarRecurrencias(semana.filter((fila) => fila.sucursalId === null ||
      atendidas.has(fila.sucursalId)), excepciones.filter((fila) =>
      atendidas.has(fila.sucursalId)).map((fila) => ({
      sucursalId: fila.sucursalId, fechaLocal: fechaPorId.get(fila.id)!,
      franjas: fila.franjas.map((franja) => ({ inicioMinutos: franja.inicioMinutos,
        finMinutos: franja.finMinutos })),
    })), zonas, desde);
    if (conflicto) throw new ConflictException(
      `filas ${conflicto.filas.join(' y ')}, inicioMinutos: empalme de horarios.`);
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
