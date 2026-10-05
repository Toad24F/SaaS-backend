import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
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
import { Usuario } from '../usuarios/entities/usuario.entity';
import { CrearServicioDto, EditarServicioDto } from './dto/servicio.dto';
import { Servicio } from './entities/servicio.entity';

/** Opera el catálogo global con negocio derivado del actor y auditoría transaccional. */
@Injectable()
export class ServiciosService {
  constructor(
    @InjectRepository(Servicio) private readonly servicios: Repository<Servicio>,
    private readonly autorizacion: AutorizacionService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async crear(actorId: number, entrada: CrearServicioDto): Promise<Servicio> {
    const datos = this.validar(CrearServicioDto, entrada);
    return transaccionIdentidad(this.servicios.manager, async (manager) => {
      const actor = await this.actor(manager, actorId);
      const repo = manager.getRepository(Servicio);
      const servicio = await repo.save(repo.create({ negocioId: actor.negocioId!,
        nombre: datos.nombre, costo: this.costo(datos.costo),
        duracionMinutos: datos.duracionMinutos, activo: true }));
      await this.registrar(manager, actor, servicio, 'servicio_creado', null, this.campos(servicio));
      return servicio;
    });
  }

  async listar(actorId: number): Promise<Servicio[]> {
    const actor = await this.actor(this.servicios.manager, actorId);
    return this.servicios.find({ where: { negocioId: actor.negocioId! }, order: { id: 'ASC' } });
  }

  async consultar(actorId: number, id: number): Promise<Servicio> {
    const actor = await this.actor(this.servicios.manager, actorId);
    const servicio = await this.servicios.findOneBy({ id, negocioId: actor.negocioId! });
    if (!servicio) throw new NotFoundException('Servicio no disponible.');
    return servicio;
  }

  async editar(actorId: number, id: number, entrada: EditarServicioDto): Promise<Servicio> {
    const datos = this.validar(EditarServicioDto, entrada);
    if (datos.nombre === undefined && datos.costo === undefined &&
      datos.duracionMinutos === undefined) {
      throw new BadRequestException('Indica un campo de servicio.');
    }
    return transaccionIdentidad(this.servicios.manager, async (manager) => {
      const actor = await this.actor(manager, actorId);
      const servicio = await this.bloquear(manager, actor.negocioId!, id);
      const antes = this.campos(servicio);
      if (datos.nombre !== undefined) servicio.nombre = datos.nombre;
      if (datos.costo !== undefined) servicio.costo = this.costo(datos.costo);
      if (datos.duracionMinutos !== undefined) servicio.duracionMinutos = datos.duracionMinutos;
      const despues = this.campos(servicio);
      if (JSON.stringify(antes) !== JSON.stringify(despues)) {
        await manager.getRepository(Servicio).save(servicio);
        await this.registrar(manager, actor, servicio, 'servicio_editado', antes, despues);
      }
      return servicio;
    });
  }

  async cambiarEstado(actorId: number, id: number, activo: boolean): Promise<void> {
    await transaccionIdentidad(this.servicios.manager, async (manager) => {
      const actor = await this.actor(manager, actorId);
      const servicio = await this.bloquear(manager, actor.negocioId!, id);
      if (servicio.activo === activo) return;
      // Conserva la fila y sus futuras selecciones; solo cambia la oferta global.
      const antes = this.campos(servicio);
      servicio.activo = activo;
      await manager.getRepository(Servicio).save(servicio);
      await this.registrar(manager, actor, servicio,
        activo ? 'servicio_reactivado' : 'servicio_desactivado', antes, this.campos(servicio));
    });
  }

  async eliminar(actorId: number, id: number): Promise<void> {
    try {
      await transaccionIdentidad(this.servicios.manager, async (manager) => {
        const actor = await this.actor(manager, actorId);
        const servicio = await this.bloquear(manager, actor.negocioId!, id);
        // La selección y cualquier evento posterior al alta convierten la baja en conflicto.
        await exigirEliminacionElegible(manager, 'servicio', actor.negocioId!, id);
        await manager.getRepository(Servicio).delete({ id, negocioId: actor.negocioId! });
        await this.registrar(manager, actor, servicio, 'servicio_eliminado',
          this.campos(servicio), null);
      });
    } catch (error) { conflictoEliminacion(error); }
  }

  private validar<T extends object>(tipo: new () => T, valor: T): T {
    const datos = plainToInstance(tipo, valor);
    const errores = validateSync(datos, { whitelist: true, forbidNonWhitelisted: true });
    if (errores.length) throw new BadRequestException(errores.flatMap((error) =>
      Object.values(error.constraints ?? { campo: `${error.property} inválido` })));
    return datos;
  }

  private costo(valor: string): string {
    const [entero, fraccion = ''] = valor.split('.');
    return `${entero}.${fraccion.padEnd(2, '0')}`;
  }

  private async actor(manager: EntityManager, id: number): Promise<Usuario> {
    const consulta = manager.getRepository(Usuario).createQueryBuilder('usuario')
      .where('usuario.id = :id', { id });
    if (manager.queryRunner?.isTransactionActive) consulta.setLock('pessimistic_read');
    const usuario = await consulta.getOne();
    if (!usuario || !usuario.activo || usuario.activadoEn === null) {
      throw new ForbiddenException('Cuenta no disponible.');
    }
    this.autorizacion.exigir(usuario.rol, Permiso.GESTIONAR_CATALOGO);
    if (usuario.negocioId === null) throw new ForbiddenException('Negocio no autorizado.');
    return usuario;
  }

  private async bloquear(manager: EntityManager, negocioId: number, id: number) {
    // ID y tenant forman una sola condición; una fila ajena nunca puede modificarse.
    const servicio = await manager.getRepository(Servicio).createQueryBuilder('servicio')
      .setLock('pessimistic_write')
      .where('servicio.id = :id AND servicio.negocioId = :negocioId', { id, negocioId }).getOne();
    if (!servicio) throw new NotFoundException('Servicio no disponible.');
    return servicio;
  }

  private campos(servicio: Servicio) {
    return { nombre: servicio.nombre, costo: servicio.costo,
      duracionMinutos: servicio.duracionMinutos, activo: servicio.activo };
  }

  private async registrar(manager: EntityManager, actor: Usuario, servicio: Servicio,
    accion: string, antes: Record<string, unknown> | null,
    despues: Record<string, unknown> | null): Promise<void> {
    await this.auditoria.registrar(manager, { operacionId: randomUUID(),
      actorUsuarioId: actor.id, negocioId: actor.negocioId, usuarioId: null,
      licenciaId: null, recursoTipo: 'servicio', recursoId: servicio.id,
      accion, valoresAntes: antes, valoresDespues: despues });
  }
}
