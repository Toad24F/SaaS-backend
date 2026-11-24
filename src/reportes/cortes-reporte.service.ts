import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { DataSource, EntityManager, LessThanOrEqual, MoreThan } from 'typeorm';
import { Rol } from '../auth/enums/rol.enum';
import { fechaCivilCita } from '../citas/horario-agenda';
import { RELOJ, type Reloj } from '../comun/reloj';
import { Cita } from '../disponibilidad/entities/cita.entity';
import { Personal } from '../profesionales/entities/personal.entity';
import { Servicio } from '../servicios/entities/servicio.entity';
import { Sucursal } from '../sucursales/entities/sucursal.entity';
import { Usuario } from '../usuarios/entities/usuario.entity';
import { CorteReporte } from './entities/corte-reporte.entity';
import { FilaCorteReporte } from './entities/fila-corte-reporte.entity';
import { type FiltrosCorte, validarFiltrosCorte } from './filtros-corte';
import { calcularIndicadores } from './indicadores-corte';

const DIA_MS = 86_400_000;
const TAMANO_LOTE = 500;
const DESDE_SQL = Date.parse('1000-01-01T00:00:00.000Z');
const HASTA_SQL = Date.parse('9999-12-31T23:59:59.999Z');
const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;

// Seleccionar en SQL solo los campos utilizados evita cargar contacto, cliente o notas.
const CAMPOS_CITA = ['id', 'sucursalId', 'personalId', 'servicioId', 'nombreSucursal',
  'nombreProfesional', 'nombreServicio', 'inicioUtc', 'finUtc', 'zonaHorariaReserva',
  'estado', 'origen', 'costoAceptado', 'causaCancelacion'] satisfies (keyof Cita)[];
const CAMPOS_INDICADORES = ['citaId', 'finUtc', 'estado', 'origen', 'servicioId', 'nombreServicio',
  'sucursalId', 'nombreSucursal', 'costoAceptado', 'causaCancelacion'] as const satisfies readonly (keyof FilaCorteReporte)[];
type FilaResumen = Pick<FilaCorteReporte, typeof CAMPOS_INDICADORES[number] | 'fechaCivil'>;

@Injectable()
export class CortesReporteService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    @Inject(RELOJ) private readonly reloj: Reloj,
  ) {}

  async crear(actorUsuarioId: number, entrada: unknown) {
    const filtros = validarFiltrosCorte(entrada);
    return this.db.transaction('REPEATABLE READ', async (manager) => {
      // La primera lectura sin bloqueo abre la fotografía compartida por todo el corte.
      const fechaCorte = this.reloj.ahora();
      const negocioId = await this.negocioDelAdministrador(manager, actorUsuarioId);
      await this.validarPertenencia(manager, negocioId, filtros);

      const corte = { id: randomUUID(), filtros, fechaCorte, expiraEn: new Date(fechaCorte.getTime() + DIA_MS) };
      await manager.insert(CorteReporte, { ...corte, negocioId, actorUsuarioId });
      await this.materializarFilas(manager, negocioId, corte.id, filtros);
      // El commit publica cabecera y filas juntas, incluso si no hubo citas en el periodo.
      await manager.update(CorteReporte, { id: corte.id }, { completo: true });
      return corte;
    });
  }

  /** Autoriza la cabecera antes de que un consumidor pueda consultar sus filas. */
  async obtenerCorte(actorUsuarioId: number, id: string): Promise<CorteReporte> {
    return this.buscarCorte(this.db.manager, actorUsuarioId, id);
  }

  async obtenerResumen(actorUsuarioId: number, id: string) {
    // La cabecera autorizada y todas sus filas se leen en la misma fotografía, incluso entre lotes.
    return this.db.transaction('REPEATABLE READ', async (manager) => {
      const corte = await this.buscarCorte(manager, actorUsuarioId, id);
      return calcularIndicadores(corte, this.leerFilas(manager, corte.id));
    });
  }

  private async buscarCorte(manager: EntityManager, actorUsuarioId: number, id: string): Promise<CorteReporte> {
    const negocioId = await this.negocioDelAdministrador(manager, actorUsuarioId);
    const corte = UUID.test(id) && await manager.findOneBy(CorteReporte, {
      id, negocioId, actorUsuarioId, completo: true, expiraEn: MoreThan(this.reloj.ahora()),
    });
    if (!corte) throw new NotFoundException('Corte no disponible.');
    return corte;
  }

  private async *leerFilas(manager: EntityManager, corteId: string) {
    const consulta = manager.createQueryBuilder(FilaCorteReporte, 'fila')
      // Leer DATE como texto civil evita que el huso local del proceso desplace el día al hidratarlo.
      .select('CAST(fila.fechaCivil AS CHAR)', 'fechaCivil')
      .where('fila.corteId = :corteId', { corteId })
      .andWhere('fila.citaId > :cursor')
      .orderBy('fila.citaId', 'ASC')
      .limit(TAMANO_LOTE);
    for (const campo of CAMPOS_INDICADORES) consulta.addSelect(`fila.${campo}`, campo);

    let cursor = 0;
    for (;;) {
      // La clave del corte y el cursor de cita evitan repetir filas o truncar el total.
      const lote = await consulta.setParameter('cursor', cursor).getRawMany<FilaResumen>();
      yield* lote;
      if (lote.length < TAMANO_LOTE) return;
      cursor = lote[lote.length - 1].citaId;
    }
  }

  private async negocioDelAdministrador(manager: EntityManager, id: number): Promise<number> {
    const actor = await manager.findOne(Usuario, {
      where: { id }, select: { rol: true, negocioId: true, activo: true, activadoEn: true, inhabilitadoEn: true },
    });
    if (!actor?.activo || !actor.activadoEn || actor.inhabilitadoEn ||
        actor.rol !== Rol.ADMIN_NEGOCIO || actor.negocioId === null) {
      throw new ForbiddenException('Se requiere una cuenta activa de administración del negocio.');
    }
    return actor.negocioId;
  }

  private async validarPertenencia(manager: EntityManager, negocioId: number, filtros: FiltrosCorte) {
    const recursos = [
      [Sucursal, filtros.sucursalId], [Personal, filtros.personalId], [Servicio, filtros.servicioId],
    ] as const;
    // Los recursos inactivos siguen siendo filtros válidos de citas pasadas.
    for (const [entidad, id] of recursos) {
      if (id !== null && !await manager.existsBy(entidad, { id, negocioId })) {
        throw new NotFoundException('Filtro de reporte no disponible.');
      }
    }
  }

  private async materializarFilas(manager: EntityManager, negocioId: number, corteId: string, filtros: FiltrosCorte) {
    const { desde, hasta, sucursalId, personalId, servicioId } = filtros;
    // Un día extra a cada lado cubre los desplazamientos IANA. Cada fila decide
    // si pertenece al periodo con su propia zona histórica y sus límites inclusivos.
    const minimo = new Date(Math.max(DESDE_SQL, Date.parse(desde) - DIA_MS));
    const maximo = new Date(Math.min(HASTA_SQL, Date.parse(hasta) + 2 * DIA_MS - 1));
    const consulta = manager.createQueryBuilder(Cita, 'cita')
      .select(CAMPOS_CITA.map((campo) => `cita.${campo}`))
      .where({
        negocioId, inicioUtc: LessThanOrEqual(maximo),
        ...(sucursalId !== null && { sucursalId }),
        ...(personalId !== null && { personalId }),
        ...(servicioId !== null && { servicioId }),
      })
      .andWhere('cita.inicioUtc >= :minimo', { minimo })
      .andWhere('cita.id > :cursor')
      .orderBy('cita.id', 'ASC')
      .limit(TAMANO_LOTE);

    // El cursor limita memoria y tamaño del INSERT, sin limitar el total del reporte.
    let cursor = 0;
    for (;;) {
      const citas = await consulta.setParameter('cursor', cursor).getMany();
      const filas = citas.flatMap(({ id, zonaHorariaReserva, ...datos }) => {
        const fechaCivil = fechaCivilCita({ inicioUtc: datos.inicioUtc, zonaHorariaReserva });
        if (fechaCivil.length !== 10 || fechaCivil < desde || fechaCivil > hasta) return [];
        return [{ corteId, citaId: id, fechaCivil, ...datos }];
      });
      if (filas.length) await manager.insert(FilaCorteReporte, filas);
      if (citas.length < TAMANO_LOTE) return;
      cursor = citas[citas.length - 1].id;
    }
  }
}
