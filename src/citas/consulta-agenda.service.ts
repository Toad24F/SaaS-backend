import { Injectable, NotFoundException } from '@nestjs/common';
import { Brackets } from 'typeorm';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { Permiso } from '../auth/services/autorizacion.service';
import { Cita } from '../disponibilidad/entities/cita.entity';
import { Sucursal } from '../sucursales/entities/sucursal.entity';
import { Personal } from '../profesionales/entities/personal.entity';
import { AccesoOperativoService } from './acceso-operativo.service';
import { validarConsultaAgenda } from './consulta-agenda.entrada';
import { intervalosCivilesUtc, proyectarHorarioCita } from './horario-agenda';

// Proyección explícita: conserva los nulos históricos y excluye referencias de sesión/apartado.
const CAMPOS: (keyof Cita)[] = ['id', 'version', 'negocioId', 'sucursalId', 'personalId', 'servicioId',
  'clienteId', 'inicioUtc', 'finUtc', 'zonaHorariaReserva', 'estado', 'origen', 'folio',
  'nombreContacto', 'telefonoContacto', 'motivoConsulta', 'nombreNegocio', 'nombreSucursal',
  'nombreServicio', 'nombreProfesional'];

/** Lectura paginada de agenda; no crea rutas, historial, causas ni escritores de citas. */
@Injectable()
export class ConsultaAgendaService {
  constructor(private readonly acceso: AccesoOperativoService) {}

  async listar(identidad: Pick<JwtPayload, 'sub' | 'sesionId'>, entrada: unknown) {
    const filtro = validarConsultaAgenda(entrada);
    // REPEATABLE READ mantiene zonas, filtros y página en la misma fotografía de lectura.
    return this.acceso.ejecutar(identidad, Permiso.CONSULTAR_CITAS, async (ctx) => {
      const alcance = this.acceso.alcanceCitas(ctx);
      if (filtro.personalId !== undefined && ((ctx.personalId !== null && filtro.personalId !== ctx.personalId) ||
        !await ctx.manager.getRepository(Personal).existsBy({ negocioId: ctx.negocioId, id: filtro.personalId }))) throw new NotFoundException();
      if (filtro.sucursalId !== undefined && !await ctx.manager.getRepository(Sucursal)
        .existsBy({ negocioId: ctx.negocioId, id: filtro.sucursalId })) throw new NotFoundException();
      const consulta = ctx.manager.getRepository(Cita).createQueryBuilder('cita').where(alcance);
      if (filtro.sucursalId !== undefined) consulta.andWhere('cita.sucursalId = :sucursalId', { sucursalId: filtro.sucursalId });
      if (filtro.personalId !== undefined) consulta.andWhere('cita.personalId = :personalId', { personalId: filtro.personalId });
      if (filtro.estado !== undefined) consulta.andWhere('cita.estado = :estado', { estado: filtro.estado });
      if (filtro.busqueda) {
        // ESCAPE explícito hace literales %, _ y !; el texto siempre viaja parametrizado.
        const patron = `%${filtro.busqueda.replace(/[!%_]/g, '!$&')}%`;
        consulta.andWhere("cita.nombreContacto LIKE :patron ESCAPE '!'", { patron });
      }
      const siguiente = new Date(Date.parse(`${filtro.hasta}T00:00:00Z`) + 86400000).toISOString().split('T')[0];
      const inicioCivil = Date.parse(`${filtro.desde}T00:00:00Z`);
      const finCivil = Date.parse(`${siguiente}T00:00:00Z`);
      // Ventana UTC conservadora e indexable; la selección final usa cada zona histórica.
      consulta.andWhere('cita.inicioUtc >= :minimo AND cita.inicioUtc < :maximo', {
        minimo: new Date(inicioCivil - 2 * 86400000), maximo: new Date(finCivil + 2 * 86400000) });
      const zonas = await consulta.clone().select('cita.zonaHorariaReserva', 'zona').distinct(true).getRawMany<{ zona: string }>();
      if (!zonas.length) return { citas: [], pagina: filtro.pagina, limite: filtro.limite, hayMas: false };
      consulta.andWhere(new Brackets((q) => {
        // Una fecha omitida puede no producir intervalos: jamás dejar la condición vacía abierta.
        q.where('1 = 0');
        zonas.forEach(({ zona }, i) => intervalosCivilesUtc(filtro.desde, siguiente, zona).forEach((tramo, j) => {
          const clave = `${i}_${j}`;
          q.orWhere(`(cita.zonaHorariaReserva = :zona${clave} AND cita.inicioUtc >= :desde${clave} AND cita.inicioUtc < :hasta${clave})`, {
            [`zona${clave}`]: zona, [`desde${clave}`]: tramo.inicio, [`hasta${clave}`]: tramo.fin });
        }));
      }));
      const filas = await consulta.select(CAMPOS.map((campo) => `cita.${campo}`))
        .orderBy('cita.inicioUtc', 'ASC').addOrderBy('cita.id', 'ASC')
        .offset((filtro.pagina - 1) * filtro.limite).limit(filtro.limite + 1).getMany();
      // Una fila adicional informa continuidad sin una cuenta separada o listado ilimitado.
      return { citas: filas.slice(0, filtro.limite).map((cita) => ({ ...cita, ...proyectarHorarioCita(cita) })),
        pagina: filtro.pagina, limite: filtro.limite, hayMas: filas.length > filtro.limite };
    }, 'REPEATABLE READ');
  }
}
