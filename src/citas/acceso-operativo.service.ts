import { ForbiddenException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import type { FindOptionsWhere } from 'typeorm';
import { Rol } from '../auth/enums/rol.enum';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { AutorizacionService, Permiso } from '../auth/services/autorizacion.service';
import { Sesion } from '../auth/entities/sesion.entity';
import { Usuario } from '../usuarios/entities/usuario.entity';
import { Licencia } from '../licencias/entities/licencia.entity';
import { PoliticaAccesoLicenciaService } from '../licencias/services/politica-acceso-licencia.service';
import { Personal } from '../profesionales/entities/personal.entity';
import { Cita } from '../disponibilidad/entities/cita.entity';
import { Cliente } from '../disponibilidad/entities/cliente.entity';
import { RELOJ, type Reloj } from '../comun/reloj';
import { normalizarErrorOperativo } from './errores-operativos';

type IdentidadOperativa = Readonly<Pick<JwtPayload, 'sub' | 'sesionId'>>;
const PERMISOS_OPERATIVOS = new Set([Permiso.CONSULTAR_CITAS, Permiso.CONSULTAR_CLIENTES,
  Permiso.GESTIONAR_CLIENTES, Permiso.CREAR_CITA_MANUAL, Permiso.CAMBIAR_ESTADO_CITA, Permiso.CAMBIAR_HORARIO_CITA]);

export interface ContextoOperativo {
  readonly manager: EntityManager;
  readonly ahora: Date;
  readonly actorId: number;
  readonly negocioId: number;
  readonly rol: Rol;
  readonly personalId: number | null;
}

/** Resuelve autoridad de servidor por operación, separada del cálculo de disponibilidad. */
@Injectable()
export class AccesoOperativoService {
  private readonly contextos = new WeakSet<ContextoOperativo>();

  constructor(@InjectDataSource() private readonly db: DataSource,
    private readonly autorizacion: AutorizacionService,
    private readonly politicaLicencia: PoliticaAccesoLicenciaService,
    @Inject(RELOJ) private readonly reloj: Reloj) {}

  /** La operación y su autorización usan el mismo manager; un error nunca se vuelve lista vacía. */
  async ejecutar<T>(identidad: IdentidadOperativa, permiso: Permiso,
    operacion: (contexto: ContextoOperativo) => Promise<T>,
    aislamiento: 'READ COMMITTED' | 'REPEATABLE READ' = 'READ COMMITTED'): Promise<T> {
    try {
      // Las lecturas de varias consultas pueden pedir fotografía estable; los escritores conservan RC.
      return await this.db.transaction(aislamiento, async (manager) =>
        operacion(await this.resolverEnTransaccion(manager, identidad, permiso)));
    } catch (error) { throw normalizarErrorOperativo(error); }
  }

  /** Los futuros escritores deben llamarlo otra vez tras esperar sus bloqueos comunes. */
  async resolverEnTransaccion(manager: EntityManager, identidad: IdentidadOperativa,
    permiso: Permiso, instante?: Date): Promise<ContextoOperativo> {
    try {
      if (!manager.queryRunner?.isTransactionActive) throw new Error('Se requiere una transacción operativa activa.');
      if (!identidad || !Number.isSafeInteger(identidad.sub) || identidad.sub <= 0
        || typeof identidad.sesionId !== 'string' || !identidad.sesionId || identidad.sesionId.length > 36) {
        throw new UnauthorizedException();
      }
      if (!PERMISOS_OPERATIVOS.has(permiso)) throw new ForbiddenException();
      // Un escritor interno puede compartir el instante capturado tras sus bloqueos con ficha y motor.
      const ahora = instante ?? this.reloj.ahora();
      // Una sola lectura une sesión, cuenta, negocio y licencia actuales. No consulta claims
      // de rol/negocio del JWT, ni acepta un negocio del formulario como autoridad.
      const actor = await manager.getRepository(Usuario).createQueryBuilder('usuario')
        .innerJoin(Sesion, 'sesion', 'sesion.usuarioId=usuario.id AND sesion.id=:sesionId', { sesionId: identidad.sesionId })
        .leftJoinAndSelect('usuario.negocio', 'negocio')
        .leftJoinAndMapOne('usuario.licenciaOperativa', Licencia, 'licencia', 'licencia.negocioId=usuario.negocioId')
        .select(['usuario.id', 'usuario.negocioId', 'usuario.rol', 'usuario.activo', 'usuario.inhabilitadoEn',
          'usuario.activadoEn', 'usuario.nombre', 'negocio', 'licencia'])
        .where('usuario.id=:actorId', { actorId: identidad.sub })
        .andWhere('sesion.revocadaEn IS NULL AND sesion.creadaEn <= :ahora AND sesion.expiraEn > :ahora', { ahora })
        .getOne() as (Usuario & { licenciaOperativa?: Licencia | null }) | null;
      if (!actor || !actor.activo || actor.inhabilitadoEn !== null || !actor.activadoEn || !actor.nombre?.trim()) {
        throw new UnauthorizedException();
      }
      // La matriz cerrada deniega al Superadmin antes de consultar citas o clientes.
      this.autorizacion.exigir(actor.rol, permiso);
      const licencia = actor.licenciaOperativa;
      if (actor.negocioId === null || !actor.negocio || !licencia || !this.politicaLicencia.evaluarAccesoUsuario({
        cuentaActiva: actor.activo, cuentaActivada: actor.activadoEn !== null,
        negocioActivado: actor.negocio.activadoEn !== null, licencia, ahora,
      }).permitido) throw new UnauthorizedException();
      if (actor.rol === Rol.PROFESIONAL && !await manager.getRepository(Personal)
        .findOneBy({ id: actor.id, negocioId: actor.negocioId })) throw new ForbiddenException();
      const contexto = Object.freeze({ manager, ahora: new Date(ahora), actorId: actor.id,
        negocioId: actor.negocioId, rol: actor.rol, personalId: actor.rol === Rol.PROFESIONAL ? actor.id : null });
      this.contextos.add(contexto);
      return contexto;
    } catch (error) { throw normalizarErrorOperativo(error); }
  }

  /** Filtro obligatorio de servidor, al que los casos de uso añadirán sus criterios validados. */
  alcanceCitas(contexto: ContextoOperativo): Readonly<FindOptionsWhere<Cita>> {
    this.exigirContexto(contexto);
    this.autorizacion.exigir(contexto.rol, Permiso.CONSULTAR_CITAS);
    return Object.freeze({ negocioId: contexto.negocioId,
      ...(contexto.personalId !== null ? { personalId: contexto.personalId } : {}) });
  }

  alcanceClientes(contexto: ContextoOperativo): Readonly<FindOptionsWhere<Cliente>> {
    this.exigirContexto(contexto);
    this.autorizacion.exigir(contexto.rol, Permiso.CONSULTAR_CLIENTES);
    return Object.freeze({ negocioId: contexto.negocioId });
  }

  private exigirContexto(contexto: ContextoOperativo): void {
    // No admitir objetos enviados por un navegador ni reutilizar un contexto fuera de su transacción.
    if (!this.contextos.has(contexto) || !contexto.manager.queryRunner?.isTransactionActive) throw new ForbiddenException();
  }
}
