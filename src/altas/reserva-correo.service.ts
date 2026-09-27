import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { AltaAdministrador, EstadoAltaAdministrador } from './entities/alta-administrador.entity';
import { CorreoAcceso } from './entities/correo-acceso.entity';
import { Negocio } from '../negocios/entities/negocio.entity';
import { Usuario } from '../usuarios/entities/usuario.entity';

interface TitularAlta { altaId: number; negocioId: number; correo: string }
interface TitularUsuario { usuarioId: number; negocioId: number | null; correo: string }

function normalizarCorreo(correo: string): string {// Normaliza y valida el correo; lanza BadRequestException si no es válido.
  if (typeof correo !== 'string') throw new BadRequestException('El correo debe ser texto.');
  const normalizado = correo.trim().toLowerCase();
  if (!normalizado || normalizado.length > 150) {
    throw new BadRequestException('El correo no es válido.');
  }
  return normalizado;
}

function convertirConflicto(error: unknown): never {// Convierte un error de escritura en conflicto a ConflictException, o lo relanza.
  const codigo = (error as { driverError?: { code?: string } }).driverError?.code
    ?? (error as { code?: string }).code;
  if (codigo === 'ER_DUP_ENTRY' || codigo === 'ER_LOCK_DEADLOCK') {
    throw new ConflictException('El correo ya está reservado.');
  }
  throw error;
}

// Autoridad única del correo; todas las escrituras usan el manager transaccional recibido. 
@Injectable()
export class ReservaCorreoService {
  async reservarAlta(manager: EntityManager, datos: TitularAlta): Promise<CorreoAcceso> {
    const correo = normalizarCorreo(datos.correo);
    const alta = await manager.getRepository(AltaAdministrador).findOneBy({
      id: datos.altaId, negocioId: datos.negocioId,
    });
    if (!alta || alta.estado !== EstadoAltaAdministrador.PENDIENTE) {// La reserva solo puede hacerse sobre un alta pendiente.
      throw new NotFoundException('Alta pendiente no disponible.');
    }
    if (alta.correo !== correo) throw new BadRequestException('El correo no corresponde al alta.');
    // Protege también frente a cuentas históricas aún sin fila de reserva.
    if (await manager.getRepository(Usuario).findOneBy({ email: correo })) {
      throw new ConflictException('El correo ya está registrado.');
    }
    try {
      return await manager.getRepository(CorreoAcceso).save(// Crea la reserva de correo para el alta pendiente.
        manager.getRepository(CorreoAcceso).create({ correo, altaAdministradorId: alta.id, usuarioId: null }),
      );
    } catch (error) {
      return convertirConflicto(error);
    }
  }

  async reservarUsuario(manager: EntityManager, datos: TitularUsuario): Promise<CorreoAcceso> {// Bloquea la fila de usuario para evitar que se modifique el correo mientras se reserva.
    const correo = normalizarCorreo(datos.correo);
    const usuario = await manager.getRepository(Usuario).findOneBy({ id: datos.usuarioId });
    if (!usuario || usuario.negocioId !== datos.negocioId) {
      throw new NotFoundException('Usuario no disponible.');
    }
    if (usuario.email !== correo) throw new BadRequestException('El correo no corresponde al usuario.');
    // Una invitación pendiente histórica tampoco puede competir con la cuenta.
    if (await manager.getRepository(AltaAdministrador).findOneBy({
      correo, estado: EstadoAltaAdministrador.PENDIENTE,
    })) {
      throw new ConflictException('El correo ya está reservado.');
    }
    try {
      return await manager.getRepository(CorreoAcceso).save(// Crea la reserva de correo para el usuario existente.
        manager.getRepository(CorreoAcceso).create({ correo, altaAdministradorId: null, usuarioId: usuario.id }),
      );
    } catch (error) {
      return convertirConflicto(error);
    }
  }

  async transferirAUsuario(manager: EntityManager, datos: {// Transfiere la reserva de correo de un alta pendiente a un usuario existente, validando titular y pertenencia.
    altaId: number; negocioId: number; usuarioId: number;
  }): Promise<void> {
    // Se bloquea primero la reserva, luego se comprueba titular y pertenencia.
    const reserva = await manager.getRepository(CorreoAcceso).createQueryBuilder('reserva')
      .setLock('pessimistic_write')
      .where('reserva.altaAdministradorId = :altaId', { altaId: datos.altaId }).getOne();
    if (!reserva) throw new NotFoundException('Reserva no disponible.');// La reserva debe existir y estar bloqueada para poder transferirla.
    const alta = await manager.getRepository(AltaAdministrador).findOneBy({
      id: datos.altaId, negocioId: datos.negocioId,
    });
    const usuario = await manager.getRepository(Usuario).findOneBy({ id: datos.usuarioId });// El usuario debe existir y pertenecer al negocio.
    if (!alta || !usuario || usuario.negocioId !== datos.negocioId ||// La reserva debe corresponder al alta y al usuario.
      alta.correo !== reserva.correo || usuario.email !== reserva.correo) {
      throw new ConflictException('El titular no corresponde al negocio y correo del alta.');
    }
    try {// La transferencia se hace en una sola escritura, que falla si la reserva ya fue transferida.
      await manager.getRepository(CorreoAcceso).update(reserva.id, {
        altaAdministradorId: null, usuarioId: usuario.id,
      });
    } catch (error) {
      convertirConflicto(error);
    }
  }

  async corregirAlta(manager: EntityManager, datos: {// Corrige el correo de un alta pendiente y su reserva, validando titular y pertenencia.
    altaId: number; negocioId: number; nuevoCorreo: string;
  }): Promise<void> {
    const nuevoCorreo = normalizarCorreo(datos.nuevoCorreo);// Normaliza y valida el nuevo correo; lanza BadRequestException si no es válido.
    const reserva = await manager.getRepository(CorreoAcceso).createQueryBuilder('reserva')//bloquea la reserva para evitar que se modifique mientras se corrige el alta.
      .setLock('pessimistic_write')
      .where('reserva.altaAdministradorId = :altaId', { altaId: datos.altaId }).getOne();
    const alta = await manager.getRepository(AltaAdministrador).findOneBy({
      id: datos.altaId, negocioId: datos.negocioId,
    });
    if (!reserva || !alta || alta.estado !== EstadoAltaAdministrador.PENDIENTE ||// La reserva debe existir y corresponder al alta pendiente.
      reserva.correo !== alta.correo) {
      throw new NotFoundException('Alta pendiente no disponible.');
    }
    if (nuevoCorreo === alta.correo) return;
    // Borra la antigua FK antes de modificar el correo del alta; el caller confirma
    // o revierte conjuntamente ambas escrituras y la nueva reserva.
    await manager.getRepository(CorreoAcceso).delete(reserva.id);
    await manager.getRepository(AltaAdministrador).update(alta.id, {
      correo: nuevoCorreo, correoVersion: alta.correoVersion + 1,
    });
    await manager.getRepository(Negocio).update(datos.negocioId, { correoAdministrador: nuevoCorreo });
    await this.reservarAlta(manager, { altaId: alta.id, negocioId: datos.negocioId, correo: nuevoCorreo });
  }
}
