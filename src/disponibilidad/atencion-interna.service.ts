import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { validarFechaLocal } from '../horarios/calendario';
import { HorarioPersonal } from '../horarios/entities/horario-personal.entity';
import { exigirHorarioTransicionado } from '../horarios/transicion-horarios';
import { Sucursal } from '../sucursales/entities/sucursal.entity';
import type { ContextoCalculoDisponibilidad } from './contexto-disponibilidad.service';
import { BloqueosAplicablesService } from './bloqueos-aplicables.service';
import { proyectarAtencion, type FranjaSemanalFuente,
  type ProyeccionAtencion } from './proyeccion-atencion';

/** Proyecta horarios con el contexto autorizado, sin transacciones ni repositorios propios. */
@Injectable()
export class AtencionInternaService {
  constructor(private readonly bloqueos: BloqueosAplicablesService) {}

  async consultar(contexto: ContextoCalculoDisponibilidad, sucursalId: number,
    desde: string, hasta: string): Promise<ProyeccionAtencion> {
    if (!contexto.manager.queryRunner?.isTransactionActive) {
      throw new Error('La lectura de atención requiere una transacción activa.');
    }
    validarFechaLocal(desde);
    validarFechaLocal(hasta);
    const inicio = Date.parse(`${desde}T00:00:00.000Z`);
    const fin = Date.parse(`${hasta}T00:00:00.000Z`);
    if (fin < inicio || (fin - inicio) / 86400000 >= 31 ||
      !Number.isSafeInteger(sucursalId) || sucursalId <= 0) {
      throw new BadRequestException('Rango o sucursal de atención inválidos.');
    }
    const { manager, negocioId, personalId } = contexto;
    // Una excepción o descanso heredado no puede convertirse en horas disponibles.
    await exigirHorarioTransicionado(manager, negocioId, personalId);
    const sede = await manager.getRepository(Sucursal).findOneBy({ id: sucursalId, negocioId });
    if (!sede) throw new NotFoundException('Sucursal no disponible.');
    // No se filtra el estado de la sede: el cálculo de citas afectadas necesitará verlo.
    const semana = await manager.getRepository(HorarioPersonal).findBy({
      negocioId, personalId, activo: true, sucursalId });
    const fuentesSemana: FranjaSemanalFuente[] = semana.map((fila) => {
      if (fila.inicioMinutos === null || fila.finMinutos === null || fila.sucursalId === null) {
        throw new Error('Horario activo incompleto.');
      }
      return { id: fila.id, sucursalId: fila.sucursalId, diaSemana: fila.diaSemana,
        inicioMinutos: fila.inicioMinutos, finMinutos: fila.finMinutos,
        descansoInicioMinutos: fila.descansoInicioMinutos,
        descansoFinMinutos: fila.descansoFinMinutos };
    });
    const restricciones = await this.bloqueos.consultar(contexto, sucursalId,
      desde, hasta, sede.zonaHoraria);
    const resultado: ProyeccionAtencion = { bloques: [], tramos: [], descansos: [], omisiones: [] };
    // La fecha es civil de la sucursal; solo los extremos se comparan en UTC.
    for (let dia = inicio; dia <= fin; dia += 86400000) {
      const fechaLocal = new Date(dia).toISOString().slice(0, 10);
      const diario = proyectarAtencion(fechaLocal, sucursalId, sede.zonaHoraria,
        fuentesSemana, [], restricciones);
      resultado.bloques.push(...diario.bloques);
      resultado.tramos.push(...diario.tramos);
      resultado.descansos.push(...diario.descansos);
      resultado.omisiones.push(...diario.omisiones);
    }
    return resultado;
  }
}
