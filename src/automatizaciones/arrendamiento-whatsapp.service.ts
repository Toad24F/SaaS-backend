import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { RELOJ, type Reloj } from '../comun/reloj';
import { EnvioWhatsapp, type EstadoEnvioWhatsapp } from './entities/envio-whatsapp.entity';
import type { ResultadoWhatsapp } from './transporte-whatsapp';

const DURACION_TOMA_MS = 30_000;

export interface TomaWhatsapp {
  id: string;
  negocioId: number;
  citaId: number;
  token: string;
}

/** Los cambios de dueño se serializan en la fila durable del trabajo. */
@Injectable()
export class ArrendamientoWhatsappService {
  constructor(private readonly db: DataSource, @Inject(RELOJ) private readonly reloj: Reloj) {}

  tomar(incluirPendientesConBoton = true): Promise<TomaWhatsapp | null> {
    return this.db.transaction('READ COMMITTED', async (manager) => {
      const ahora = this.reloj.ahora();
      const repositorio = manager.getRepository(EnvioWhatsapp);
      const consulta = repositorio.createQueryBuilder('e').setLock('pessimistic_write').setOnLocked('skip_locked')
        .where(`(e.estado = 'pendiente' AND e.proximoIntentoEn <= :ahora
          OR e.estado = 'en_proceso' AND e.arrendadoHasta <= :ahora AND e.inicioTransporteEn IS NULL)`, { ahora });
      if (!incluirPendientesConBoton) consulta.andWhere("(e.tipo <> 'inicial_pendiente' OR e.utilHasta <= :ahora)");
      const envio = await consulta.orderBy('e.proximoIntentoEn', 'ASC').addOrderBy('e.id', 'ASC').limit(1).getOne();
      if (!envio) return null;
      // Un token nuevo impide que el dueño anterior cierre o prolongue una toma recuperada.
      const token = randomUUID();
      await repositorio.update(envio.id, { estado: 'en_proceso', arrendamientoId: token,
        arrendadoHasta: this.vencimiento(this.reloj.ahora()) });
      return { id: envio.id, negocioId: envio.negocioId, citaId: envio.citaId, token };
    });
  }

  renovar(toma: TomaWhatsapp): Promise<boolean> {
    return this.db.transaction('READ COMMITTED', async (manager) => {
      const vigente = await this.leerVigente(manager, toma);
      if (!vigente) return false;
      await manager.update(EnvioWhatsapp, vigente.envio.id, { arrendadoHasta: this.vencimiento(vigente.ahora) });
      return true;
    });
  }

  finalizar(toma: TomaWhatsapp, resultado: ResultadoWhatsapp): Promise<boolean> {
    return this.db.transaction('READ COMMITTED', async (manager) => {
      const vigente = await this.leerVigente(manager, toma);
      if (!vigente) return false;
      const { envio, ahora } = vigente;
      if (resultado.estado === 'aceptado') {
        await this.cerrar(manager, envio, 'aceptado', null, { referenciaExterna: resultado.referencia, aceptadoEn: ahora });
      } else if (resultado.estado === 'rechazado') {
        await this.cerrar(manager, envio, 'fallido', resultado.transitorio ? 'rechazo_transitorio' : 'rechazo_permanente');
      } else {
        await this.cerrar(manager, envio, 'incierto', 'resultado_incierto');
      }
      return true;
    });
  }

  async leerVigente(manager: EntityManager, toma: TomaWhatsapp) {
    const envio = await manager.getRepository(EnvioWhatsapp).createQueryBuilder('e').setLock('pessimistic_write')
      .where({ id: toma.id, negocioId: toma.negocioId, citaId: toma.citaId }).getOne();
    // El instante posterior al bloqueo evita reconocer una toma que venció durante la espera.
    const ahora = this.reloj.ahora();
    if (envio?.estado !== 'en_proceso' || envio.arrendamientoId !== toma.token
      || !envio.arrendadoHasta || envio.arrendadoHasta <= ahora) return null;
    return { envio, ahora };
  }

  async iniciarTransporte(manager: EntityManager, envio: EnvioWhatsapp, ahora: Date): Promise<void> {
    await manager.update(EnvioWhatsapp, envio.id, { intentos: envio.intentos + 1,
      inicioTransporteEn: ahora, arrendadoHasta: this.vencimiento(ahora) });
  }

  /** Se invoca en la transacción que ya verificó y bloqueó la toma. */
  async cerrar(manager: EntityManager, envio: EnvioWhatsapp,
    estado: Extract<EstadoEnvioWhatsapp, 'aceptado' | 'fallido' | 'incierto' | 'descartado'>,
    ultimoError: string | null, aceptacion?: Pick<EnvioWhatsapp, 'referenciaExterna' | 'aceptadoEn'>): Promise<void> {
    await manager.update(EnvioWhatsapp, envio.id, { estado, ultimoError, ...aceptacion,
      arrendamientoId: null, arrendadoHasta: null, inicioTransporteEn: null });
  }

  private vencimiento(ahora: Date): Date {
    return new Date(ahora.getTime() + DURACION_TOMA_MS);
  }
}
