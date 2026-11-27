import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { RELOJ, type Reloj } from '../comun/reloj';
import { EnvioWhatsapp, type EstadoEnvioWhatsapp } from './entities/envio-whatsapp.entity';
import type { ResultadoWhatsapp } from './transporte-whatsapp';
import { bloquearCitaDeEnvio, derivarSeguimientoWhatsapp } from './seguimiento-whatsapp';
import { envioVigenteHasta } from './envios-cita';

const DURACION_TOMA_MS = 30_000;
const ESPERAS_REINTENTO_MS = [60_000, 300_000] as const;

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
      const cita = resultado.estado === 'rechazado'
        ? await bloquearCitaDeEnvio(manager, toma.negocioId, toma.citaId) : null;
      const vigente = await this.leerVigente(manager, toma);
      if (!vigente) return false;
      const { envio, ahora } = vigente;
      if (resultado.estado === 'aceptado') {
        await this.cerrar(manager, envio, 'aceptado', null, { referenciaExterna: resultado.referencia, aceptadoEn: ahora });
      } else if (resultado.estado === 'rechazado') {
        if (envio.tipo === 'recordatorio' && (cita?.estado !== 'confirmada' || cita.generacionAutomatizacion !== envio.generacion)) {
          await this.cerrar(manager, envio, 'descartado', 'envio_fuera_de_vigencia', { correlacionProveedor: null });
          return true;
        }
        const espera = ESPERAS_REINTENTO_MS[envio.intentos - 1];
        const siguiente = ahora.getTime() + Math.max(espera ?? 0, resultado.reintentarEnMs ?? 0);
        // El reintento usa los mismos límites que el envío y retira la correlación del rechazo conocido.
        if (resultado.transitorio && espera !== undefined && cita && envioVigenteHasta(envio, cita, siguiente)) {
          await manager.update(EnvioWhatsapp, envio.id, { estado: 'pendiente', proximoIntentoEn: new Date(siguiente),
            ultimoError: 'rechazo_transitorio', arrendamientoId: null, arrendadoHasta: null,
            inicioTransporteEn: null, correlacionProveedor: null });
        } else {
          await this.cerrar(manager, envio, 'fallido', resultado.transitorio ? 'reintento_agotado' : 'rechazo_permanente',
            { correlacionProveedor: null });
          await derivarSeguimientoWhatsapp(manager, envio, cita, 'No se pudo enviar la confirmación por WhatsApp.');
        }
      } else {
        await this.cerrar(manager, envio, 'incierto', 'resultado_incierto');
      }
      return true;
    });
  }

  recuperarIncierto(): Promise<boolean> {
    return this.db.transaction('READ COMMITTED', async (manager) => {
      const envio = await manager.getRepository(EnvioWhatsapp).createQueryBuilder('e')
        .setLock('pessimistic_write').setOnLocked('skip_locked')
        .where("e.estado = 'en_proceso' AND e.inicioTransporteEn IS NOT NULL AND e.arrendadoHasta <= :ahora",
          { ahora: this.reloj.ahora() }).orderBy('e.arrendadoHasta', 'ASC').addOrderBy('e.id', 'ASC').limit(1).getOne();
      if (!envio) return false;
      // Una caída tras marcar el intento deja abierta la posibilidad de que Meta lo haya aceptado.
      await this.cerrar(manager, envio, 'incierto', 'toma_vencida_tras_transporte');
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

  async iniciarTransporte(manager: EntityManager, envio: EnvioWhatsapp, ahora: Date): Promise<string> {
    const correlacionProveedor = randomUUID();
    await manager.update(EnvioWhatsapp, envio.id, { intentos: envio.intentos + 1,
      inicioTransporteEn: ahora, arrendadoHasta: this.vencimiento(ahora), correlacionProveedor });
    return correlacionProveedor;
  }

  /** Se invoca en la transacción que ya verificó y bloqueó la toma. */
  async cerrar(manager: EntityManager, envio: EnvioWhatsapp,
    estado: Extract<EstadoEnvioWhatsapp, 'aceptado' | 'fallido' | 'incierto' | 'descartado'>,
    ultimoError: string | null, datos?: Partial<Pick<EnvioWhatsapp, 'referenciaExterna' | 'aceptadoEn' | 'correlacionProveedor'>>): Promise<void> {
    await manager.update(EnvioWhatsapp, envio.id, { estado, ultimoError, ...datos,
      arrendamientoId: null, arrendadoHasta: null, inicioTransporteEn: null });
  }

  private vencimiento(ahora: Date): Date {
    return new Date(ahora.getTime() + DURACION_TOMA_MS);
  }
}
