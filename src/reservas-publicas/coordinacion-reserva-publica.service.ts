import { BadRequestException, ConflictException, Inject, Injectable,
  NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { RELOJ, type Reloj } from '../comun/reloj';
import { SesionReservaPublica } from './entities/sesion-reserva-publica.entity';
import { OperacionApartado } from './entities/operacion-apartado.entity';
import { IntentoReservaPublica } from './entities/intento-reserva-publica.entity';

const REINTENTABLES = new Set(['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT', 'ER_CHECKREAD']);

export interface RecursosReserva {
  negocioId: number;
  usuarioIds: number[];
  sucursalIds: number[];
  servicioIds: number[];
  personalIds: number[];
  citaIds?: number[];
  apartadoIds?: number[];
}

export type NuevaOperacion = Pick<OperacionApartado, 'generacion' | 'seleccionHash' |
  'personalId' | 'sucursalId' | 'servicioId' | 'fechaLocal' | 'horaInicio'>;

function transaccionActiva(manager: EntityManager): void {
  if (!manager.queryRunner?.isTransactionActive) {
    throw new Error('La coordinación pública requiere una transacción activa.');
  }
}

function idsOrdenados(ids: number[]): number[] {
  if (!Array.isArray(ids) || ids.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
    throw new BadRequestException('IDs de reserva inválidos.');
  }
  return [...new Set(ids)].sort((a, b) => a - b);
}

/** Infraestructura común para futuros escritores; ningún método concede un apartado. */
@Injectable()
export class CoordinacionReservaPublicaService {
  constructor(@InjectDataSource() private readonly db: DataSource,
    @Inject(RELOJ) private readonly reloj: Reloj) {}

  /** Cada intento abre una transacción nueva. Un deadlock revierte todo el intento;
   * la clave recibida se conserva y el agotamiento técnico nunca simula ocupación. */
  async transaccion<T>(claveEstable: string,
    ejecutar: (manager: EntityManager) => Promise<T>): Promise<T> {
    if (!claveEstable || typeof claveEstable !== 'string' || claveEstable.length > 64) {
      throw new BadRequestException('Clave de operación inválida.');
    }
    for (let intento = 0; intento < 3; intento += 1) {
      try { return await this.db.transaction('READ COMMITTED', ejecutar); }
      catch (error) {
        const datos = error as { code?: string; driverError?: { code?: string } } | null;
        const codigo = datos?.driverError?.code ?? datos?.code;
        if (!codigo || !REINTENTABLES.has(codigo)) throw error;
        if (intento === 2) {
          throw new ServiceUnavailableException('Operación temporalmente no disponible.');
        }
      }
    }
    throw new ServiceUnavailableException('Operación temporalmente no disponible.');
  }

  /** La fila de sesión precede siempre a la operación o al intento del navegador. */
  async bloquearSesion(manager: EntityManager, negocioId: number,
    titularHash: string): Promise<SesionReservaPublica> {
    transaccionActiva(manager);
    const sesion = await manager.getRepository(SesionReservaPublica)
      .createQueryBuilder('sesion').setLock('pessimistic_write')
      .where('sesion.negocioId = :negocioId AND sesion.titularHash = :titularHash',
        { negocioId, titularHash }).getOne();
    if (!sesion) throw new NotFoundException('Sesión pública no disponible.');
    return sesion;
  }

  /** La sesión ya bloqueada serializa la primera inserción y la repetición de clave. */
  async bloquearOCrearOperacion(manager: EntityManager, sesion: SesionReservaPublica,
    clave: string, datos: NuevaOperacion): Promise<OperacionApartado> {
    transaccionActiva(manager);
    // Incluso si el llamador recibió la sesión antes, se vuelve a tomar su
    // exclusión antes de buscar una clave que todavía no tenga fila.
    const bloqueada = await this.bloquearSesion(manager, sesion.negocioId,
      sesion.titularHash);
    if (bloqueada.id !== sesion.id) throw new NotFoundException('Sesión pública no disponible.');
    const repo = manager.getRepository(OperacionApartado);
    const existente = await repo.createQueryBuilder('operacion')
      .setLock('pessimistic_write')
      .where(`operacion.negocioId = :negocioId AND operacion.sesionId = :sesionId
        AND operacion.clave = :clave`,
      { negocioId: sesion.negocioId, sesionId: sesion.id, clave }).getOne();
    if (existente) {
      if (existente.seleccionHash !== datos.seleccionHash) {
        throw new ConflictException('Clave de operación incompatible.');
      }
      return existente;
    }
    return repo.save(repo.create({ ...datos, negocioId: sesion.negocioId,
      sesionId: sesion.id, clave, estado: 'preparada', apartadoId: null,
      causaPublica: null }));
  }

  /** El intento también nace bajo sesión; la unicidad durable protege el reintento. */
  async bloquearOCrearIntento(manager: EntityManager, sesion: SesionReservaPublica,
    clave: string, apartadoId: number): Promise<IntentoReservaPublica> {
    transaccionActiva(manager);
    const bloqueada = await this.bloquearSesion(manager, sesion.negocioId,
      sesion.titularHash);
    if (bloqueada.id !== sesion.id) throw new NotFoundException('Sesión pública no disponible.');
    const repo = manager.getRepository(IntentoReservaPublica);
    const existente = await repo.createQueryBuilder('intento').setLock('pessimistic_write')
      .where(`intento.negocioId = :negocioId AND intento.sesionId = :sesionId
        AND intento.clave = :clave`,
      { negocioId: sesion.negocioId, sesionId: sesion.id, clave }).getOne();
    if (existente) {
      if (existente.apartadoId !== apartadoId) {
        throw new ConflictException('Clave de intento incompatible.');
      }
      return existente;
    }
    return repo.save(repo.create({ negocioId: sesion.negocioId, sesionId: sesion.id,
      clave, apartadoId, estado: 'preparado', formularioHash: null,
      causaPublica: null, citaId: null }));
  }

  /** Usuarios, negocio, licencia, sucursales, servicios, perfiles y ocupaciones.
   * IDs ascendentes dentro de cada clase; el instante se captura tras la espera. */
  async bloquearRecursos(manager: EntityManager, recursos: RecursosReserva): Promise<Date> {
    transaccionActiva(manager);
    const negocioId = recursos.negocioId;
    if (!Number.isSafeInteger(negocioId) || negocioId <= 0) {
      throw new BadRequestException('Negocio de reserva inválido.');
    }
    const usuarios = idsOrdenados(recursos.usuarioIds);
    const sucursales = idsOrdenados(recursos.sucursalIds);
    const servicios = idsOrdenados(recursos.servicioIds);
    const perfiles = idsOrdenados(recursos.personalIds);
    const citas = idsOrdenados(recursos.citaIds ?? []);
    const apartados = idsOrdenados(recursos.apartadoIds ?? []);
    const bloquear = async (tabla: string, columna: string, id: number) => {
      const filas: { id: number }[] = await manager.query(
        `SELECT id FROM ${tabla} WHERE negocio_id=? AND ${columna}=? FOR UPDATE`,
        [negocioId, id]);
      if (filas.length !== 1) throw new NotFoundException('Recurso de reserva no disponible.');
    };
    for (const id of usuarios) await bloquear('usuarios', 'id', id);
    const negocio: { id: number }[] = await manager.query(
      'SELECT id FROM negocios WHERE id=? FOR UPDATE', [negocioId]);
    if (negocio.length !== 1) throw new NotFoundException('Negocio no disponible.');
    const licencia: { id: number }[] = await manager.query(
      'SELECT id FROM licencias WHERE negocio_id=? FOR UPDATE', [negocioId]);
    if (licencia.length !== 1) throw new NotFoundException('Licencia no disponible.');
    for (const id of sucursales) await bloquear('sucursales', 'id', id);
    for (const id of servicios) await bloquear('servicios', 'id', id);
    for (const id of perfiles) await bloquear('personal', 'id', id);
    for (const id of citas) await bloquear('citas', 'id', id);
    for (const id of apartados) await bloquear('bloqueos_temporales', 'id', id);
    return this.reloj.ahora();
  }
}
