import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AutorizacionService, Permiso } from '../auth/services/autorizacion.service';
import { Usuario } from '../usuarios/entities/usuario.entity';
import { Sucursal } from '../sucursales/entities/sucursal.entity';
import { Servicio } from '../servicios/entities/servicio.entity';
import { PersonalSucursal } from '../profesionales/entities/personal-sucursal.entity';
import { PersonalServicio } from '../profesionales/entities/personal-servicio.entity';
import { PersonalServicioSucursal } from '../profesionales/entities/personal-servicio-sucursal.entity';
import type { ContextoCalculoDisponibilidad, ContextoDisponibilidad } from './contexto-disponibilidad.service';
import { derivarEstadoOferta, type FuentesOferta } from './estado-oferta';

/** Lee la oferta con el manager autorizado; no inicia otra transacción. */
@Injectable()
export class OfertaEfectivaService {
  constructor(private readonly autorizacion: AutorizacionService) {}

  /** Puerta previa al motor: no valida horarios ni ocupaciones; solo descarta oferta inactiva. */
  async filtrarCandidatos<T>(contexto: ContextoCalculoDisponibilidad, sucursalId: number,
    servicioId: number, modalidad: 'publica' | 'manual', candidatos: readonly T[]) {
    const oferta = await this.consultar(contexto, sucursalId, servicioId, modalidad);
    return { oferta, candidatos: oferta.ofrecido ? [...candidatos] : [] as T[] };
  }

  async consultar(contexto: ContextoCalculoDisponibilidad, sucursalId: number,
    servicioId: number, modalidad: 'publica' | 'manual') {
    if (!Number.isSafeInteger(sucursalId) || sucursalId <= 0 ||
      !Number.isSafeInteger(servicioId) || servicioId <= 0 ||
      (modalidad !== 'publica' && modalidad !== 'manual')) {
      throw new BadRequestException('Combinación de disponibilidad inválida.');
    }
    if (modalidad === 'manual') {
      // El contexto público jamás aporta rol; solo la entrada privada autoriza manual.
      if (!('rol' in contexto) || !('actorId' in contexto)) {
        throw new ForbiddenException('Modalidad manual no autorizada.');
      }
      this.autorizacion.exigir((contexto as ContextoDisponibilidad).rol,
        Permiso.VALIDAR_DISPONIBILIDAD_MANUAL);
    }
    const { manager, negocioId, personalId } = contexto;
    if (!manager.queryRunner?.isTransactionActive) {
      throw new Error('La lectura de oferta requiere una transacción activa.');
    }
    // Todas las búsquedas usan negocioId obtenido del actor, nunca un ID de petición.
    const [sucursal, servicio, cuenta, asignacion, seleccion, combinacion] = await Promise.all([
      manager.getRepository(Sucursal).findOneBy({ negocioId, id: sucursalId }),
      manager.getRepository(Servicio).findOneBy({ negocioId, id: servicioId }),
      manager.getRepository(Usuario).findOneBy({ negocioId, id: personalId }),
      manager.getRepository(PersonalSucursal).findOneBy({ negocioId, personalId, sucursalId }),
      manager.getRepository(PersonalServicio).findOneBy({ negocioId, personalId, servicioId }),
      manager.getRepository(PersonalServicioSucursal).findOneBy({
        negocioId, personalId, sucursalId, servicioId }),
    ]);
    if (!sucursal || !servicio) throw new NotFoundException('Combinación no disponible.');
    const fuentes: FuentesOferta = { asignado: asignacion !== null,
      sucursalActiva: sucursal.activo, cuentaActiva: cuenta?.activo ?? false,
      servicioActivo: servicio.activo, seleccionGeneralActiva: seleccion?.activo ?? false,
      atencionActiva: asignacion?.activo ?? false,
      seleccionSucursalActiva: combinacion?.activo ?? false };
    // La puerta de oferta se aplica antes de generar ranuras, sin mutar preferencias.
    // El motor toma zona y duración de esta misma lectura, sin consultar otro repositorio.
    return { negocioId, personalId, sucursalId, servicioId, modalidad, fuentes,
      zonaHoraria: sucursal.zonaHoraria, duracionMinutos: servicio.duracionMinutos,
      ...derivarEstadoOferta(fuentes) };
  }
}
