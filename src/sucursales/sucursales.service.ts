import { BadRequestException, ConflictException, ForbiddenException, Injectable,
  NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { randomUUID } from 'node:crypto';
import type { EntityManager } from 'typeorm';
import { Repository } from 'typeorm';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { AutorizacionService, Permiso } from '../auth/services/autorizacion.service';
import { conflictoEliminacion, exigirEliminacionElegible } from '../comun/politica-eliminacion';
import { transaccionIdentidad } from '../comun/transaccion-identidad';
import { CoordinacionHorarios } from '../horarios/coordinacion-horarios';
import { Negocio } from '../negocios/entities/negocio.entity';
import { validarLimiteSucursales } from '../negocios/validar-limite-sucursales';
import { Usuario } from '../usuarios/entities/usuario.entity';
import { CrearSucursalDto, EditarSucursalDto } from './dto/sucursal.dto';
import { Sucursal } from './entities/sucursal.entity';

type CamposSucursal = Pick<Sucursal, 'nombre' | 'direccion' | 'telefono' | 'zonaHoraria'
  | 'urlGoogleMaps' | 'notasLlegada'>;

/** Gestiona sucursales serializando el cupo sobre la fila del negocio. */
@Injectable()
export class SucursalesService {
  private readonly horarios = new CoordinacionHorarios();
  constructor(
    @InjectRepository(Sucursal) private readonly sucursales: Repository<Sucursal>,
    private readonly autorizacion: AutorizacionService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async crear(actorId: number, entrada: CrearSucursalDto): Promise<Sucursal> {
    const datos = this.validar(CrearSucursalDto, entrada);
    return transaccionIdentidad(this.sucursales.manager, async (manager) => {
      const actor = await this.actor(manager, actorId, Permiso.GESTIONAR_CATALOGO);
      const negocio = await this.bloquearNegocio(manager, actor.negocioId!);
      const cupo = await this.contarActivas(manager, negocio.id);
      if (cupo >= negocio.limiteSucursalesActivas) {
        throw new ConflictException('No hay cupo para otra sucursal activa.');
      }
      const repo = manager.getRepository(Sucursal);
      const sucursal = await repo.save(repo.create({ negocioId: negocio.id, nombre: datos.nombre,
        direccion: datos.direccion, telefono: datos.telefono, zonaHoraria: datos.zonaHoraria,
        urlGoogleMaps: datos.urlGoogleMaps ?? null, notasLlegada: datos.notasLlegada ?? null,
        activo: true }));
      await this.registrar(manager, actor.id, negocio.id, sucursal.id, 'sucursal_creada', null,
        this.campos(sucursal));
      return sucursal;
    });
  }

  async listar(actorId: number): Promise<Sucursal[]> {
    const actor = await this.actor(this.sucursales.manager, actorId, Permiso.GESTIONAR_CATALOGO);
    return this.sucursales.find({ where: { negocioId: actor.negocioId! }, order: { id: 'ASC' } });
  }

  async consultar(actorId: number, sucursalId: number): Promise<Sucursal> {
    const actor = await this.actor(this.sucursales.manager, actorId, Permiso.GESTIONAR_CATALOGO);
    const sucursal = await this.sucursales.findOneBy({ id: sucursalId, negocioId: actor.negocioId! });
    if (!sucursal) throw new NotFoundException('Sucursal no disponible.');
    return sucursal;
  }

  async editar(actorId: number, sucursalId: number, entrada: EditarSucursalDto,
    desde = new Date().toISOString().slice(0, 10)): Promise<Sucursal> {
    const datos = this.validar(EditarSucursalDto, entrada);
    if (!Object.values(datos).some((valor) => valor !== undefined)) {
      throw new BadRequestException('Indica un campo de sucursal.');
    }
    return transaccionIdentidad(this.sucursales.manager, async (manager) => {
      const actor = await this.actor(manager, actorId, Permiso.GESTIONAR_CATALOGO);
      await this.bloquearNegocio(manager, actor.negocioId!);
      const sucursal = await this.bloquearSucursal(manager, actor.negocioId!, sucursalId);
      const antes = this.campos(sucursal);
      for (const campo of ['nombre', 'direccion', 'telefono', 'zonaHoraria',
        'urlGoogleMaps', 'notasLlegada'] as const) {
        if (datos[campo] !== undefined) {
          (sucursal as unknown as Record<string, unknown>)[campo] = datos[campo] ?? null;
        }
      }
      const despues = this.campos(sucursal);
      if (JSON.stringify(antes) === JSON.stringify(despues)) return sucursal;
      if (antes.zonaHoraria !== despues.zonaHoraria && sucursal.activo) {
        // Negocio -> sucursal -> perfiles ascendentes: la semana usa el mismo perfil.
        const ids = await this.horarios.perfilesAsignados(manager, actor.negocioId!, sucursal.id);
        await this.horarios.bloquearPerfiles(manager, actor.negocioId!, ids);
        await this.horarios.validarPerfiles(manager, actor.negocioId!, ids, desde,
          { sucursalId, zonaHoraria: sucursal.zonaHoraria });
      }
      await manager.getRepository(Sucursal).save(sucursal);
      await this.registrar(manager, actor.id, actor.negocioId!, sucursal.id,
        'sucursal_editada', antes, despues);
      return sucursal;
    });
  }

  async desactivar(actorId: number, sucursalId: number): Promise<void> {
    await transaccionIdentidad(this.sucursales.manager, async (manager) => {
      const actor = await this.actor(manager, actorId, Permiso.GESTIONAR_CATALOGO);
      await this.bloquearNegocio(manager, actor.negocioId!);
      const sucursal = await this.bloquearSucursal(manager, actor.negocioId!, sucursalId);
      if (!sucursal.activo) return;
      // Conservar la fila mantiene sus datos y futuras relaciones; el cupo la excluye.
      sucursal.activo = false;
      await manager.getRepository(Sucursal).save(sucursal);
      await this.registrar(manager, actor.id, actor.negocioId!, sucursal.id,
        'sucursal_desactivada', { activo: true }, { activo: false });
    });
  }

  async eliminar(actorId: number, sucursalId: number): Promise<void> {
    try {
      await transaccionIdentidad(this.sucursales.manager, async (manager) => {
        const actor = await this.actor(manager, actorId, Permiso.GESTIONAR_CATALOGO);
        // Negocio y sucursal se bloquean en el mismo orden que las demás escrituras.
        await this.bloquearNegocio(manager, actor.negocioId!);
        const sucursal = await this.bloquearSucursal(manager, actor.negocioId!, sucursalId);
        await exigirEliminacionElegible(manager, 'sucursal', actor.negocioId!, sucursalId);
        await manager.getRepository(Sucursal).delete({ id: sucursalId, negocioId: actor.negocioId! });
        await this.registrar(manager, actor.id, actor.negocioId!, sucursalId,
          'sucursal_eliminada', this.campos(sucursal), null);
      });
    } catch (error) { conflictoEliminacion(error); }
  }

  async reactivar(actorId: number, sucursalId: number,
    desde = new Date().toISOString().slice(0, 10)): Promise<void> {
    await transaccionIdentidad(this.sucursales.manager, async (manager) => {
      const actor = await this.actor(manager, actorId, Permiso.GESTIONAR_CATALOGO);
      const negocio = await this.bloquearNegocio(manager, actor.negocioId!);
      const sucursal = await this.bloquearSucursal(manager, negocio.id, sucursalId);
      if (sucursal.activo) return;
      if (await this.contarActivas(manager, negocio.id) >= negocio.limiteSucursalesActivas) {
        throw new ConflictException('No hay cupo para reactivar la sucursal.');
      }
      const ids = await this.horarios.perfilesAsignados(manager, negocio.id, sucursal.id);
      await this.horarios.bloquearPerfiles(manager, negocio.id, ids);
      // Se valida con la sucursal candidata activa antes de modificar el estado.
      await this.horarios.validarPerfiles(manager, negocio.id, ids, desde,
        { sucursalId, activo: true });
      sucursal.activo = true;
      await manager.getRepository(Sucursal).save(sucursal);
      await this.registrar(manager, actor.id, negocio.id, sucursal.id,
        'sucursal_reactivada', { activo: false }, { activo: true });
    });
  }

  async consultarCupo(actorId: number) {
    return this.sucursales.manager.transaction(async (manager) => {
      const actor = await this.actor(manager, actorId, Permiso.GESTIONAR_CATALOGO);
      return this.cupoBloqueado(manager, actor.negocioId!);
    });
  }

  async consultarCupoNegocio(actorId: number, negocioId: number) {
    return this.sucursales.manager.transaction(async (manager) => {
      await this.actor(manager, actorId, Permiso.GESTIONAR_LIMITE_SUCURSALES);
      return this.cupoBloqueado(manager, negocioId);
    });
  }

  async cambiarLimite(actorId: number, negocioId: number, entrada: number) {
    const limite = validarLimiteSucursales(entrada);
    if (limite > 4294967295) throw new BadRequestException('El límite de sucursales está fuera de rango.');
    return transaccionIdentidad(this.sucursales.manager, async (manager) => {
      const actor = await this.actor(manager, actorId, Permiso.GESTIONAR_LIMITE_SUCURSALES);
      const negocio = await this.bloquearNegocio(manager, negocioId);
      const activas = await this.contarActivas(manager, negocio.id);
      if (limite < activas) {
        throw new ConflictException('Desactiva las sucursales excedentes antes de reducir el límite.');
      }
      const antes = negocio.limiteSucursalesActivas;
      if (antes !== limite) {
        negocio.limiteSucursalesActivas = limite;
        await manager.getRepository(Negocio).save(negocio);
        await this.registrar(manager, actor.id, negocio.id, null, 'limite_sucursales_modificado',
          { limiteSucursalesActivas: antes }, { limiteSucursalesActivas: limite });
      }
      return this.cupo(negocio, activas);
    });
  }

  private validar<T extends object>(tipo: new () => T, valor: T): T {
    const datos = plainToInstance(tipo, valor);
    const errores = validateSync(datos, { whitelist: true, forbidNonWhitelisted: true });
    if (errores.length) throw new BadRequestException(errores.flatMap((error) =>
      Object.values(error.constraints ?? { campo: `${error.property} inválido` })));
    return datos;
  }

  private async actor(manager: EntityManager, id: number, permiso: Permiso): Promise<Usuario> {
    const consulta = manager.getRepository(Usuario).createQueryBuilder('usuario')
      .where('usuario.id = :id', { id });
    // Las lecturas simples no tienen transacción; solo los comandos bloquean al actor.
    if (manager.queryRunner?.isTransactionActive) consulta.setLock('pessimistic_read');
    const usuario = await consulta.getOne();
    if (!usuario || !usuario.activo || usuario.activadoEn === null) {
      throw new ForbiddenException('Cuenta no disponible.');
    }
    this.autorizacion.exigir(usuario.rol, permiso);
    if (permiso === Permiso.GESTIONAR_CATALOGO && usuario.negocioId === null) {
      throw new ForbiddenException('Negocio no autorizado.');
    }
    return usuario;
  }

  private async bloquearNegocio(manager: EntityManager, id: number): Promise<Negocio> {
    const negocio = await manager.getRepository(Negocio).createQueryBuilder('negocio')
      .setLock('pessimistic_write').where('negocio.id = :id', { id }).getOne();
    if (!negocio) throw new NotFoundException('Negocio no disponible.');
    return negocio;
  }

  private async bloquearSucursal(manager: EntityManager, negocioId: number, id: number) {
    const sucursal = await manager.getRepository(Sucursal).createQueryBuilder('sucursal')
      .setLock('pessimistic_write')
      .where('sucursal.id = :id AND sucursal.negocioId = :negocioId', { id, negocioId }).getOne();
    if (!sucursal) throw new NotFoundException('Sucursal no disponible.');
    return sucursal;
  }

  private contarActivas(manager: EntityManager, negocioId: number): Promise<number> {
    return manager.getRepository(Sucursal).countBy({ negocioId, activo: true });
  }

  private cupo(negocio: Negocio, activas: number) {
    return { negocioId: negocio.id, limiteSucursalesActivas: negocio.limiteSucursalesActivas,
      sucursalesActivas: activas, disponibles: negocio.limiteSucursalesActivas - activas };
  }

  private async cupoBloqueado(manager: EntityManager, negocioId: number) {
    // La lectura compartida espera a cualquier alta/reducción que posea el bloqueo exclusivo.
    const negocio = await manager.getRepository(Negocio).createQueryBuilder('negocio')
      .setLock('pessimistic_read').where('negocio.id = :id', { id: negocioId }).getOne();
    if (!negocio) throw new NotFoundException('Negocio no disponible.');
    return this.cupo(negocio, await this.contarActivas(manager, negocio.id));
  }

  private campos(sucursal: Sucursal): CamposSucursal & { activo: boolean } {
    return { nombre: sucursal.nombre, direccion: sucursal.direccion,
      telefono: sucursal.telefono, zonaHoraria: sucursal.zonaHoraria,
      urlGoogleMaps: sucursal.urlGoogleMaps, notasLlegada: sucursal.notasLlegada,
      activo: sucursal.activo };
  }

  private async registrar(manager: EntityManager, actorId: number, negocioId: number,
    sucursalId: number | null, accion: string, antes: Record<string, unknown> | null,
    despues: Record<string, unknown> | null): Promise<void> {
    await this.auditoria.registrar(manager, { operacionId: randomUUID(), actorUsuarioId: actorId,
      negocioId, usuarioId: null, licenciaId: null, recursoTipo: sucursalId === null ? null : 'sucursal',
      recursoId: sucursalId, accion, valoresAntes: antes, valoresDespues: despues });
  }
}
