import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { transaccionIdentidad } from '../comun/transaccion-identidad';
import { Personal } from '../profesionales/entities/personal.entity';
import { PersonalSucursal } from '../profesionales/entities/personal-sucursal.entity';
import { Sucursal } from '../sucursales/entities/sucursal.entity';
import { validarFechaLocal, validarRecurrencias } from './calendario';
import { ExcepcionHorario } from './entities/excepcion-horario.entity';
import { FranjaExcepcionHorario } from './entities/franja-excepcion-horario.entity';
import { HorarioPersonal } from './entities/horario-personal.entity';
import { DatosFranja, validarFranja } from './validar-franja';

export interface EntradaSemana extends DatosFranja { id?: number }
export interface FilaSemana extends DatosFranja { id: number }
export interface EntradaExcepcion {
  id?: number;
  orden: number;
  inicioMinutos: number;
  finMinutos: number;
  descansoInicioMinutos?: number | null;
  descansoFinMinutos?: number | null;
}
export interface VistaExcepcion {
  id: number;
  sucursalId: number;
  fechaLocal: string;
  franjas: (EntradaExcepcion & { id: number })[];
}

/** Gestiona el conjunto semanal por negocio y perfil, bajo un único bloqueo de fila. */
@Injectable()
export class HorariosService {
  constructor(@InjectRepository(HorarioPersonal)
    private readonly franjas: Repository<HorarioPersonal>) {}

  async consultarSemana(negocioId: number, personalId: number): Promise<FilaSemana[]> {
    const manager = this.franjas.manager;
    if (!await manager.getRepository(Personal).findOneBy({ id: personalId, negocioId })) {
      throw new NotFoundException('Profesional no disponible.');
    }
    const filas = await manager.getRepository(HorarioPersonal).find({
      where: { negocioId, personalId }, order: { diaSemana: 'ASC', orden: 'ASC', id: 'ASC' },
    });
    // No se filtran inactivas: son la fuente recuperable de los borradores.
    return filas.map((fila) => this.vista(fila));
  }

  async guardarSemana(negocioId: number, personalId: number, entrada: EntradaSemana[],
    desde: string): Promise<FilaSemana[]> {
    if (!Array.isArray(entrada)) throw new BadRequestException('franjas: debe ser un arreglo.');
    return transaccionIdentidad(this.franjas.manager, async (manager) => {
      const perfil = await manager.getRepository(Personal).createQueryBuilder('perfil')
        .setLock('pessimistic_write')
        .where('perfil.id = :personalId AND perfil.negocioId = :negocioId',
          { personalId, negocioId }).getOne();
      if (!perfil) throw new NotFoundException('Profesional no disponible.');
      const repo = manager.getRepository(HorarioPersonal);
      const actuales = await repo.findBy({ negocioId, personalId });
      const idsActuales = new Set(actuales.map((fila) => fila.id));
      const idsEnviados = new Set<number>();
      const propuestas = entrada.map((original, fila) => {
        if (!original || typeof original !== 'object') {
          throw new BadRequestException(`fila ${fila}, franja: objeto obligatorio.`);
        }
        if (original.id !== undefined) {
          if (!Number.isInteger(original.id) || !idsActuales.has(original.id) ||
            idsEnviados.has(original.id)) {
            throw new BadRequestException(`fila ${fila}, id: no pertenece al horario o está repetido.`);
          }
          idsEnviados.add(original.id);
        }
        try { validarFranja(original); }
        catch (error) {
          const respuesta = error instanceof BadRequestException ? error.getResponse() : null;
          const mensajes = typeof respuesta === 'object' && respuesta !== null &&
            'message' in respuesta ? respuesta.message : 'franja inválida';
          throw new BadRequestException(`fila ${fila}, ${Array.isArray(mensajes)
            ? mensajes.join(' ') : String(mensajes)}`);
        }
        return original;
      });

      const relaciones = await manager.getRepository(PersonalSucursal).findBy({ negocioId, personalId });
      const asignadas = new Set(relaciones.map((r) => r.sucursalId));
      propuestas.forEach((franja, fila) => {
        if (franja.sucursalId != null && !asignadas.has(franja.sucursalId)) {
          throw new NotFoundException(`fila ${fila}, sucursalId: sucursal no asignada.`);
        }
      });
      const sucursales = asignadas.size ? await manager.getRepository(Sucursal).findBy({
        negocioId, id: In([...asignadas]),
      }) : [];
      const zonas = new Map(sucursales.map((s) => [s.id, s.zonaHoraria]));
      const excepciones = await this.cargarExcepciones(manager, negocioId, personalId);
      // Se validan las excepciones persistidas junto con el reemplazo candidato.
      const conflicto = validarRecurrencias(propuestas, excepciones.map((e) => ({
        sucursalId: e.sucursalId, fechaLocal: e.fechaLocal,
        franjas: e.franjas.map((f) => ({ inicioMinutos: f.inicioMinutos,
          finMinutos: f.finMinutos })),
      })), zonas, desde);
      if (conflicto) throw new ConflictException(`filas ${conflicto.filas.join(' y ')}, inicioMinutos: empalme de horarios.`);

      // El conjunto se valida antes de escribir: un error revierte toda la versión.
      const retirados = actuales.filter((fila) => !idsEnviados.has(fila.id)).map((fila) => fila.id);
      if (retirados.length) await repo.delete({ negocioId, personalId, id: In(retirados) });
      const guardadas: HorarioPersonal[] = [];
      for (const franja of propuestas) {
        const entidad = repo.create({ id: franja.id, negocioId, personalId,
          diaSemana: franja.diaSemana, orden: franja.orden,
          sucursalId: franja.sucursalId ?? null,
          inicioMinutos: franja.inicioMinutos ?? null, finMinutos: franja.finMinutos ?? null,
          descansoInicioMinutos: franja.descansoInicioMinutos ?? null,
          descansoFinMinutos: franja.descansoFinMinutos ?? null, activo: franja.activo });
        guardadas.push(await repo.save(entidad));
      }
      return guardadas.map((fila) => this.vista(fila)).sort((a, b) =>
        a.diaSemana - b.diaSemana || a.orden - b.orden || a.id - b.id);
    });
  }

  async consultarExcepciones(negocioId: number, personalId: number): Promise<VistaExcepcion[]> {
    const manager = this.franjas.manager;
    if (!await manager.getRepository(Personal).findOneBy({ id: personalId, negocioId })) {
      throw new NotFoundException('Profesional no disponible.');
    }
    const cabeceras = await this.cargarExcepciones(manager, negocioId, personalId);
    return cabeceras.map((cabecera) => this.vistaExcepcion(cabecera))
      .sort((a, b) => a.fechaLocal.localeCompare(b.fechaLocal) ||
        a.sucursalId - b.sucursalId || a.id - b.id);
  }

  async guardarExcepcion(negocioId: number, personalId: number, fechaLocal: string,
    sucursalId: number, franjas: EntradaExcepcion[], desde: string): Promise<VistaExcepcion> {
    validarFechaLocal(fechaLocal);
    if (!Number.isInteger(sucursalId) || sucursalId < 1) {
      throw new BadRequestException('sucursalId: debe ser entero positivo.');
    }
    if (!Array.isArray(franjas)) throw new BadRequestException('franjas: debe ser un arreglo.');
    const diaSemana = new Date(`${fechaLocal}T00:00:00.000Z`).getUTCDay();
    const propuestas = franjas.map((franja, fila) => {
      if (!franja || typeof franja !== 'object') {
        throw new BadRequestException(`fila ${fila}, franja: objeto obligatorio.`);
      }
      try { validarFranja({ diaSemana, orden: franja.orden, sucursalId,
        inicioMinutos: franja.inicioMinutos, finMinutos: franja.finMinutos,
        descansoInicioMinutos: franja.descansoInicioMinutos,
        descansoFinMinutos: franja.descansoFinMinutos, activo: true }); }
      catch (error) {
        const respuesta = error instanceof BadRequestException ? error.getResponse() : null;
        const mensaje = typeof respuesta === 'object' && respuesta !== null &&
          'message' in respuesta ? respuesta.message : 'franja inválida';
        throw new BadRequestException(`fila ${fila}, ${Array.isArray(mensaje)
          ? mensaje.join(' ') : String(mensaje)}`);
      }
      return franja;
    });
    return transaccionIdentidad(this.franjas.manager, async (manager) => {
      await this.bloquearPerfil(manager, negocioId, personalId);
      await this.exigirSucursal(manager, negocioId, personalId, sucursalId);
      const repo = manager.getRepository(ExcepcionHorario);
      const actuales = await this.cargarExcepciones(manager, negocioId, personalId);
      const anterior = actuales.find((e) => e.sucursalId === sucursalId &&
        this.fechaExcepcion(e.fechaLocal) === fechaLocal);
      const idsActuales = new Set(anterior?.franjas.map((f) => f.id) ?? []);
      const idsEnviados = new Set<number>();
      propuestas.forEach((franja, fila) => {
        if (franja.id === undefined) return;
        if (!Number.isInteger(franja.id) || !idsActuales.has(franja.id) ||
          idsEnviados.has(franja.id)) {
          throw new BadRequestException(`fila ${fila}, id: no pertenece a la excepción o está repetido.`);
        }
        idsEnviados.add(franja.id);
      });
      const semana = await manager.getRepository(HorarioPersonal).findBy({ negocioId, personalId });
      const zonas = await this.zonasAsignadas(manager, negocioId, personalId);
      const candidatas = actuales.filter((e) => e.id !== anterior?.id)
        .map((e) => this.paraCalendario(e));
      candidatas.push({ sucursalId, fechaLocal, franjas: propuestas });
      // La cabecera vacía sustituye esa fecha; se compara antes de cualquier DELETE.
      const conflicto = validarRecurrencias(semana, candidatas, zonas, desde);
      if (conflicto) throw new ConflictException(
        `filas ${conflicto.filas.join(' y ')}, inicioMinutos: empalme de horarios.`);
      const cabecera = anterior ?? await repo.save(repo.create({ negocioId, personalId,
        sucursalId, fechaLocal }));
      const hijas = manager.getRepository(FranjaExcepcionHorario);
      const retiradas = anterior?.franjas.filter((f) => !idsEnviados.has(f.id))
        .map((f) => f.id) ?? [];
      if (retiradas.length) await hijas.delete({ negocioId, excepcionId: cabecera.id,
        id: In(retiradas) });
      const guardadas: FranjaExcepcionHorario[] = [];
      for (const franja of propuestas) {
        guardadas.push(await hijas.save(hijas.create({ id: franja.id, negocioId,
          excepcionId: cabecera.id, orden: franja.orden,
          inicioMinutos: franja.inicioMinutos, finMinutos: franja.finMinutos,
          descansoInicioMinutos: franja.descansoInicioMinutos ?? null,
          descansoFinMinutos: franja.descansoFinMinutos ?? null })));
      }
      cabecera.franjas = guardadas;
      return this.vistaExcepcion(cabecera);
    });
  }

  async retirarExcepcion(negocioId: number, personalId: number, fechaLocal: string,
    sucursalId: number, desde: string): Promise<void> {
    validarFechaLocal(fechaLocal);
    if (!Number.isInteger(sucursalId) || sucursalId < 1) {
      throw new BadRequestException('sucursalId: debe ser entero positivo.');
    }
    await transaccionIdentidad(this.franjas.manager, async (manager) => {
      await this.bloquearPerfil(manager, negocioId, personalId);
      const repo = manager.getRepository(ExcepcionHorario);
      const actuales = await this.cargarExcepciones(manager, negocioId, personalId);
      const anterior = actuales.find((e) => e.sucursalId === sucursalId &&
        this.fechaExcepcion(e.fechaLocal) === fechaLocal);
      if (!anterior) throw new NotFoundException('Excepción no disponible.');
      const semana = await manager.getRepository(HorarioPersonal).findBy({ negocioId, personalId });
      const zonas = await this.zonasAsignadas(manager, negocioId, personalId);
      // Retirar restaura la recurrencia: se valida contra las otras sucursales.
      const conflicto = validarRecurrencias(semana,
        actuales.filter((e) => e.id !== anterior.id).map((e) => this.paraCalendario(e)),
        zonas, desde);
      if (conflicto) throw new ConflictException(
        `filas ${conflicto.filas.join(' y ')}, inicioMinutos: empalme de horarios.`);
      await manager.getRepository(FranjaExcepcionHorario).delete({ negocioId,
        excepcionId: anterior.id });
      await repo.delete({ id: anterior.id, negocioId, personalId });
    });
  }

  private async bloquearPerfil(manager: Repository<HorarioPersonal>['manager'], negocioId: number,
    personalId: number): Promise<void> {
    const perfil = await manager.getRepository(Personal).createQueryBuilder('perfil')
      .setLock('pessimistic_write')
      .where('perfil.id = :personalId AND perfil.negocioId = :negocioId',
        { personalId, negocioId }).getOne();
    if (!perfil) throw new NotFoundException('Profesional no disponible.');
  }

  private async cargarExcepciones(manager: Repository<HorarioPersonal>['manager'],
    negocioId: number, personalId: number): Promise<ExcepcionHorario[]> {
    const cabeceras = await manager.getRepository(ExcepcionHorario).find({
      where: { negocioId, personalId }, relations: { franjas: true },
    });
    if (!cabeceras.length) return cabeceras;
    // El driver local convierte DATE por huso; DATE_FORMAT conserva el día civil SQL.
    const fechas = await manager.query(`SELECT id,
      DATE_FORMAT(fecha_local, '%Y-%m-%d') fecha_local FROM excepciones_horario
      WHERE negocio_id = ? AND personal_id = ?`, [negocioId, personalId]) as
      { id: number; fecha_local: string }[];
    const porId = new Map(fechas.map((fila) => [Number(fila.id), fila.fecha_local]));
    for (const cabecera of cabeceras) cabecera.fechaLocal = porId.get(cabecera.id)!;
    return cabeceras;
  }

  private async exigirSucursal(manager: Repository<HorarioPersonal>['manager'], negocioId: number,
    personalId: number, sucursalId: number): Promise<void> {
    const asignacion = await manager.getRepository(PersonalSucursal).findOneBy({
      negocioId, personalId, sucursalId });
    if (!asignacion) throw new NotFoundException('Sucursal no asignada.');
  }

  private async zonasAsignadas(manager: Repository<HorarioPersonal>['manager'], negocioId: number,
    personalId: number): Promise<Map<number, string>> {
    const relaciones = await manager.getRepository(PersonalSucursal).findBy({ negocioId, personalId });
    const ids = relaciones.map((r) => r.sucursalId);
    const sucursales = ids.length ? await manager.getRepository(Sucursal).findBy({
      negocioId, id: In(ids) }) : [];
    return new Map(sucursales.map((s) => [s.id, s.zonaHoraria]));
  }

  private paraCalendario(excepcion: ExcepcionHorario) {
    return { sucursalId: excepcion.sucursalId,
      fechaLocal: this.fechaExcepcion(excepcion.fechaLocal),
      franjas: excepcion.franjas.map((f) => ({ inicioMinutos: f.inicioMinutos,
        finMinutos: f.finMinutos })) };
  }

  private fechaExcepcion(valor: string | Date): string {
    // MariaDB/TypeORM pueden devolver DATE como cadena o como Date según conexión.
    return valor instanceof Date ? valor.toISOString().slice(0, 10) : valor.slice(0, 10);
  }

  private vistaExcepcion(cabecera: ExcepcionHorario): VistaExcepcion {
    return { id: cabecera.id, sucursalId: cabecera.sucursalId,
      fechaLocal: this.fechaExcepcion(cabecera.fechaLocal),
      franjas: [...cabecera.franjas].sort((a, b) => a.orden - b.orden || a.id - b.id)
        .map((f) => ({ id: f.id, orden: f.orden, inicioMinutos: f.inicioMinutos,
          finMinutos: f.finMinutos, descansoInicioMinutos: f.descansoInicioMinutos,
          descansoFinMinutos: f.descansoFinMinutos })) };
  }

  private vista(fila: HorarioPersonal): FilaSemana {
    return { id: fila.id, diaSemana: fila.diaSemana, orden: fila.orden,
      sucursalId: fila.sucursalId, inicioMinutos: fila.inicioMinutos,
      finMinutos: fila.finMinutos, descansoInicioMinutos: fila.descansoInicioMinutos,
      descansoFinMinutos: fila.descansoFinMinutos, activo: fila.activo };
  }
}
