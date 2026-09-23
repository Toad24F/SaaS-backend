import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, IsNull, MoreThan, Repository } from 'typeorm';
import { Sesion } from '../entities/sesion.entity';

const DURACION_SESION_MS = 12 * 60 * 60 * 1000;

/** Administra sesiones persistidas de 12hrs, sin renovación deslizante. */
@Injectable()
export class SesionesService {
  constructor(
    @InjectRepository(Sesion)
    private readonly repositorio: Repository<Sesion>,
  ) { }

  crear(usuarioId: number, ahora: Date): Promise<Sesion> {
    const sesion = this.repositorio.create({
      usuarioId,
      creadaEn: new Date(ahora),
      expiraEn: new Date(ahora.getTime() + DURACION_SESION_MS),
      revocadaEn: null,
    });
    return this.repositorio.save(sesion);
  }

  /** Inserta la sesión con el mismo manager que bloqueó y revalidó la cuenta. */
  crearConManager(manager: EntityManager, usuarioId: number, ahora: Date): Promise<Sesion> {
    const repositorio = manager.getRepository(Sesion);
    return repositorio.save(repositorio.create({
      usuarioId,
      creadaEn: new Date(ahora),//establece la fecha de creación de la sesión
      expiraEn: new Date(ahora.getTime() + DURACION_SESION_MS),//establece la fecha de expiración de la sesión
      revocadaEn: null,
    }));
  }

  async esValida(sesionId: string, usuarioId: number, ahora: Date): Promise<boolean> {
    // La lectura no actualiza fechas: comprobar una sesión nunca extiende su vida.
    const sesion = await this.repositorio.findOneBy({
      id: sesionId,
      usuarioId,
      revocadaEn: IsNull(),
      expiraEn: MoreThan(ahora),
    });
    return sesion !== null;
  }

  async revocar(sesionId: string, usuarioId: number, ahora: Date): Promise<void> {
    await this.repositorio.update(
      { id: sesionId, usuarioId, revocadaEn: IsNull() },
      { revocadaEn: new Date(ahora) },
    );
  }

  async revocarTodas(usuarioId: number, ahora: Date): Promise<void> {
    await this.repositorio.update(
      { usuarioId, revocadaEn: IsNull() },
      { revocadaEn: new Date(ahora) },
    );
  }

  /** Variante transaccional para que contraseña y revocación confirmen juntas. */
  async revocarTodasConManager(
    manager: EntityManager,
    usuarioId: number,
    ahora: Date,
  ): Promise<void> {
    await manager.getRepository(Sesion).update(
      { usuarioId, revocadaEn: IsNull() },
      { revocadaEn: new Date(ahora) },
    );
  }
}
