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
import { transaccionIdentidad } from '../comun/transaccion-identidad';
import { Sucursal } from '../sucursales/entities/sucursal.entity';
import { Usuario } from '../usuarios/entities/usuario.entity';
import { AsignarSucursalesDto, CrearProfesionalDto, EditarProfesionalDto } from './dto/profesionales.dto';
import { Personal } from './entities/personal.entity';
import { PersonalSucursal } from './entities/personal-sucursal.entity';

export interface PerfilProfesional {
  id: number; negocioId: number; usuarioId: number;
  nombre: string; correo: string; activo: boolean;
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
        const perfil = await repoPerfil.save(repoPerfil.create({ negocioId: actor.negocioId!,
          usuarioId: usuario.id }));
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
      // El bloqueo del perfil serializa reemplazos concurrentes del conjunto completo.
      await repo.delete({ negocioId: actor.negocioId!, personalId: id });
      if (ids.length) await repo.save(ids.map((sucursalId) => repo.create({
        negocioId: actor.negocioId!, personalId: id, sucursalId })));
      await this.registrar(manager, actor, perfil, 'profesional_sucursales_modificadas',
        { sucursalIds: anteriores }, { sucursalIds: ids });
      return ids;
    });
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
        { id: perfil.usuarioId, negocioId: perfil.negocioId, rol: Rol.PROFESIONAL }).getOne();
    if (!usuario) throw new ConflictException('Cuenta Profesional no disponible.');
    return usuario;
  }

  private revocarSesiones(manager: EntityManager, usuarioId: number, ahora: Date) {
    return manager.getRepository(Sesion).update({ usuarioId, revocadaEn: IsNull() },
      { revocadaEn: new Date(ahora) });
  }

  private vista(perfil: Personal, usuario: Usuario): PerfilProfesional {
    return { id: perfil.id, negocioId: perfil.negocioId, usuarioId: perfil.usuarioId,
      nombre: usuario.nombre!, correo: usuario.email, activo: usuario.activo };
  }

  private async registrar(manager: EntityManager, actor: Usuario, perfil: Personal,
    accion: string, antes: Record<string, unknown> | null,
    despues: Record<string, unknown>): Promise<void> {
    await this.auditoria.registrar(manager, { operacionId: randomUUID(),
      actorUsuarioId: actor.id, negocioId: actor.negocioId, usuarioId: perfil.usuarioId,
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
