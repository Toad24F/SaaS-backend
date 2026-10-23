import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { DataSource, EntityManager } from 'typeorm';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { AutorizacionService, Permiso } from '../auth/services/autorizacion.service';
import { Usuario } from '../usuarios/entities/usuario.entity';
import { Negocio } from '../negocios/entities/negocio.entity';
import { transaccionIdentidad } from '../comun/transaccion-identidad';
import { ConfiguracionAgenda } from './entities/configuracion-agenda.entity';
import type { ContextoCalculoDisponibilidad } from './contexto-disponibilidad.service';
import { CONFIGURACION_INICIAL, validarConfiguracionAgenda,
  ValoresConfiguracionAgenda } from './configuracion-agenda.validador';

/** Gestiona reglas comerciales propias; no crea filas al consultar valores efectivos. */
@Injectable()
export class ConfiguracionAgendaService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly auditoria: AuditoriaService,
    private readonly autorizacion: AutorizacionService,
  ) {}

  async consultar(actorId: number): Promise<ValoresConfiguracionAgenda> {
    const actor = await this.actor(this.db.manager, actorId);
    const fila = await this.db.getRepository(ConfiguracionAgenda)
      .findOneBy({ negocioId: actor.negocioId! });
    return fila ? this.valores(fila) : { ...CONFIGURACION_INICIAL };
  }

  /** El motor usa el mismo gestor e instante que sus demás fuentes. */
  async consultarEnContexto(contexto: ContextoCalculoDisponibilidad):
    Promise<ValoresConfiguracionAgenda> {
    if (!contexto.manager.queryRunner?.isTransactionActive) {
      throw new Error('La lectura de configuración requiere una transacción activa.');
    }
    const fila = await contexto.manager.getRepository(ConfiguracionAgenda)
      .findOneBy({ negocioId: contexto.negocioId });
    return fila ? this.valores(fila) : { ...CONFIGURACION_INICIAL };
  }

  async guardar(actorId: number, entrada: unknown): Promise<ValoresConfiguracionAgenda> {
    const nuevos = validarConfiguracionAgenda(entrada);
    // READ COMMITTED permite observar la última configuración tras esperar la
    // barrera del negocio; el reemplazo y la auditoría siguen siendo atómicos.
    return transaccionIdentidad(this.db, async (manager) => {
      const actor = await this.actor(manager, actorId);
      // El negocio padre serializa también la primera escritura, cuando aún no hay fila.
      const negocio = await manager.getRepository(Negocio).createQueryBuilder('negocio')
        .setLock('pessimistic_write').where('negocio.id = :id', { id: actor.negocioId })
        .getOne();
      if (!negocio) throw new ForbiddenException('Negocio no disponible.');
      const repositorio = manager.getRepository(ConfiguracionAgenda);
      const actual = await repositorio.findOneBy({ negocioId: negocio.id });
      const anteriores = actual ? this.valores(actual) : { ...CONFIGURACION_INICIAL };
      // Un reemplazo idéntico al estado efectivo no crea fila ni evento artificial.
      if (this.iguales(anteriores, nuevos)) return anteriores;
      await repositorio.save(repositorio.create({ ...actual, negocioId: negocio.id, ...nuevos }));
      // El evento y los datos comparten commit; una falla de auditoría revierte la fila.
      await this.auditoria.registrar(manager, { operacionId: randomUUID(),
        actorUsuarioId: actor.id, negocioId: negocio.id, usuarioId: null,
        // La auditoría histórica restringe recurso_tipo; el negocio y la acción identifican esta regla.
        licenciaId: null, recursoTipo: null, recursoId: null,
        accion: 'configuracion_agenda_modificada', valoresAntes: { ...anteriores },
        valoresDespues: { ...nuevos } });
      return nuevos;
    }, 'READ COMMITTED');
  }

  private async actor(manager: EntityManager, id: number): Promise<Usuario> {
    const usuario = await manager.getRepository(Usuario).findOneBy({ id });
    if (!usuario || !usuario.activo || !usuario.activadoEn) {
      throw new ForbiddenException('Cuenta no disponible.');
    }
    // La matriz específica no concede esta escritura a recepción ni al Profesional.
    this.autorizacion.exigir(usuario.rol, Permiso.CONFIGURAR_AGENDA);
    if (usuario.negocioId === null) throw new ForbiddenException('Negocio no autorizado.');
    return usuario;
  }

  private valores(fila: ConfiguracionAgenda): ValoresConfiguracionAgenda {
    return { modo: fila.modo, intervaloMinutos: fila.intervaloMinutos as ValoresConfiguracionAgenda['intervaloMinutos'],
      anticipacionMinutos: fila.anticipacionMinutos, diasFuturos: fila.diasFuturos };
  }

  private iguales(a: ValoresConfiguracionAgenda, b: ValoresConfiguracionAgenda): boolean {
    return a.modo === b.modo && a.intervaloMinutos === b.intervaloMinutos &&
      a.anticipacionMinutos === b.anticipacionMinutos && a.diasFuturos === b.diasFuturos;
  }
}
