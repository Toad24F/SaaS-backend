import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { In, Repository } from 'typeorm';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { transaccionIdentidad } from '../comun/transaccion-identidad';
import { bloquearNegocioAgenda, bloquearRecursosAgenda } from '../comun/bloqueos-coordinados';
import { Personal } from '../profesionales/entities/personal.entity';
import { PersonalSucursal } from '../profesionales/entities/personal-sucursal.entity';
import { Sucursal } from '../sucursales/entities/sucursal.entity';
import { validarRecurrencias } from './calendario';
import { HorarioPersonal } from './entities/horario-personal.entity';
import { fusionarFranjas } from './fusion-franjas';
import { exigirHorarioTransicionado } from './transicion-horarios';
import { DatosFranja, validarFranja } from './validar-franja';

export interface EntradaSemana extends DatosFranja { id?: number }
export interface FilaSemana extends DatosFranja { id: number }
/** Gestiona el conjunto semanal por negocio y perfil, bajo un único bloqueo de fila. */
@Injectable()
export class HorariosService {
  private readonly auditoria = new AuditoriaService();
  constructor(@InjectRepository(HorarioPersonal)
    private readonly franjas: Repository<HorarioPersonal>) {}

  async consultarSemana(negocioId: number, personalId: number): Promise<FilaSemana[]> {
    const manager = this.franjas.manager;
    if (!await manager.getRepository(Personal).findOneBy({ id: personalId, negocioId })) {
      throw new NotFoundException('Profesional no disponible.');
    }
    await exigirHorarioTransicionado(manager, negocioId, personalId);
    const filas = await manager.getRepository(HorarioPersonal).find({
      where: { negocioId, personalId }, order: { diaSemana: 'ASC', orden: 'ASC', id: 'ASC' },
    });
    // No se filtran inactivas: son la fuente recuperable de los borradores.
    return filas.map((fila) => this.vista(fila));
  }

  async guardarSemana(negocioId: number, personalId: number, entrada: EntradaSemana[],
    desde: string, actorId?: number): Promise<FilaSemana[]> {
    if (!Array.isArray(entrada)) throw new BadRequestException('franjas: debe ser un arreglo.');
    return transaccionIdentidad(this.franjas.manager, async (manager) => {
      await this.bloquearAgenda(manager, negocioId, personalId);
      const perfil = await manager.getRepository(Personal).createQueryBuilder('perfil')
        .setLock('pessimistic_write')
        .where('perfil.id = :personalId AND perfil.negocioId = :negocioId',
          { personalId, negocioId }).getOne();
      if (!perfil) throw new NotFoundException('Profesional no disponible.');
      await exigirHorarioTransicionado(manager, negocioId, personalId);
      const repo = manager.getRepository(HorarioPersonal);
      const actuales = await repo.findBy({ negocioId, personalId });
      const idsActuales = new Set(actuales.map((fila) => fila.id));
      const idsEnviados = new Set<number>();
      const validadas = entrada.map((original, fila) => {
        if (!original || typeof original !== 'object') {
          throw new BadRequestException(`fila ${fila}, franja: objeto obligatorio.`);
        }
        // La entrada interna tampoco debe aceptar un descanso y descartarlo al guardar.
        if (original.descansoInicioMinutos != null || original.descansoFinMinutos != null) {
          throw new BadRequestException(`fila ${fila}, descanso: campo retirado.`);
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
      // La fusión sucede antes de validar empalmes y de tocar filas persistidas.
      const propuestas = fusionarFranjas(validadas);
      const idsCanonicos = new Set(propuestas.map((fila) => fila.id)
        .filter((id): id is number => id !== undefined));

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
      const conflicto = validarRecurrencias(propuestas, [], zonas, desde);
      if (conflicto) throw new ConflictException(`filas ${conflicto.filas.join(' y ')}, inicioMinutos: empalme de horarios.`);

      // El conjunto se valida antes de escribir: un error revierte toda la versión.
      const retirados = actuales.filter((fila) => !idsCanonicos.has(fila.id)).map((fila) => fila.id);
      if (retirados.length) await repo.delete({ negocioId, personalId, id: In(retirados) });
      const guardadas: HorarioPersonal[] = [];
      for (const franja of propuestas) {
        const entidad = repo.create({ id: franja.id, negocioId, personalId,
          diaSemana: franja.diaSemana, orden: franja.orden,
          sucursalId: franja.sucursalId ?? null,
          inicioMinutos: franja.inicioMinutos ?? null, finMinutos: franja.finMinutos ?? null,
          descansoInicioMinutos: null,
          descansoFinMinutos: null, activo: franja.activo });
        guardadas.push(await repo.save(entidad));
      }
      const resultado = guardadas.map((fila) => this.vista(fila)).sort((a, b) =>
        a.diaSemana - b.diaSemana || a.orden - b.orden || a.id - b.id);
      const antes = actuales.map((fila) => this.vista(fila)).sort((a, b) =>
        a.diaSemana - b.diaSemana || a.orden - b.orden || a.id - b.id);
      if (actorId && JSON.stringify(antes) !== JSON.stringify(resultado)) {
        // El evento comparte el commit del reemplazo y guarda la semana canónica completa.
        await this.auditoria.registrar(manager, { operacionId: randomUUID(),
          actorUsuarioId: actorId, negocioId, usuarioId: personalId, licenciaId: null,
          recursoTipo: 'horario', recursoId: personalId,
          accion: 'reemplazar_semana', valoresAntes: { franjas: antes },
          valoresDespues: { franjas: resultado } });
      }
      return resultado;
    }, 'READ COMMITTED');
  }

  private async bloquearAgenda(manager: Repository<HorarioPersonal>['manager'], negocioId: number,
    personalId: number): Promise<void> {
    await bloquearNegocioAgenda(manager, negocioId);
    // Las asignaciones quedan estables tras la barrera; sedes antes de perfil.
    const asignadas = await manager.getRepository(PersonalSucursal).findBy({ negocioId, personalId });
    await bloquearRecursosAgenda(manager, negocioId, 'sucursal',
      asignadas.map((fila) => fila.sucursalId));
  }

  private async bloquearPerfil(manager: Repository<HorarioPersonal>['manager'], negocioId: number,
    personalId: number): Promise<void> {
    const perfil = await manager.getRepository(Personal).createQueryBuilder('perfil')
      .setLock('pessimistic_write')
      .where('perfil.id = :personalId AND perfil.negocioId = :negocioId',
        { personalId, negocioId }).getOne();
    if (!perfil) throw new NotFoundException('Profesional no disponible.');
  }


  private vista(fila: HorarioPersonal): FilaSemana {
    return { id: fila.id, diaSemana: fila.diaSemana, orden: fila.orden,
      sucursalId: fila.sucursalId, inicioMinutos: fila.inicioMinutos,
      finMinutos: fila.finMinutos, activo: fila.activo };
  }
}
