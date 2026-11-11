import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { Permiso } from '../auth/services/autorizacion.service';
import { Usuario } from '../usuarios/entities/usuario.entity';
import { Licencia } from '../licencias/entities/licencia.entity';
import { Cita } from '../disponibilidad/entities/cita.entity';
import { bloquearNegocioAgenda, bloquearRecursosAgenda } from '../comun/bloqueos-coordinados';
import { MotorDisponibilidadService } from '../disponibilidad/motor-disponibilidad.service';
import { AccesoOperativoService } from './acceso-operativo.service';
import { validarCambioHorario } from './cambio-horario.entrada';
import { validarIdCita } from './consulta-cita.entrada';
import { EventoCita } from './entities/evento-cita.entity';

/** Mueve una cita bajo el bloqueo común; horario, versión e historial se confirman juntos. */
@Injectable()
export class CambioHorarioCitaService {
  constructor(private readonly acceso: AccesoOperativoService, private readonly motor: MotorDisponibilidadService) {}

  async cambiar(identidad: Pick<JwtPayload, 'sub' | 'sesionId'>, entradaId: unknown, entrada: unknown) {
    const id = validarIdCita(entradaId);
    const datos = validarCambioHorario(entrada);
    return this.acceso.ejecutar(identidad, Permiso.CAMBIAR_HORARIO_CITA, async inicial => {
      const manager = inicial.manager;
      // Descubrir los recursos no autoriza la edición: la cita se relee después del perfil común.
      const referencia = await manager.getRepository(Cita).findOneBy({ id, negocioId: inicial.negocioId });
      if (!referencia) throw new NotFoundException();
      for (const usuarioId of [...new Set([inicial.actorId, referencia.personalId])].sort((a, b) => a - b)) {
        const usuario = await manager.getRepository(Usuario).createQueryBuilder('usuario').setLock('pessimistic_write')
          .where({ id: usuarioId, negocioId: inicial.negocioId }).getOne();
        if (!usuario) throw new NotFoundException();
      }
      await bloquearNegocioAgenda(manager, inicial.negocioId);
      const licencia = await manager.getRepository(Licencia).createQueryBuilder('licencia').setLock('pessimistic_write')
        .where({ negocioId: inicial.negocioId }).getOne();
      if (!licencia) throw new NotFoundException();
      await bloquearRecursosAgenda(manager, inicial.negocioId, 'sucursal', [referencia.sucursalId]);
      await bloquearRecursosAgenda(manager, inicial.negocioId, 'servicio', [referencia.servicioId]);
      await bloquearRecursosAgenda(manager, inicial.negocioId, 'personal', [referencia.personalId]);
      const cita = await manager.getRepository(Cita).createQueryBuilder('cita').setLock('pessimistic_write')
        .where({ id, negocioId: inicial.negocioId }).getOne();
      if (!cita) throw new NotFoundException();
      // READ COMMITTED: acceso, reloj, versión y destino se comprueban después de todas las esperas.
      const ctx = await this.acceso.resolverEnTransaccion(manager, identidad, Permiso.CAMBIAR_HORARIO_CITA);
      if (ctx.negocioId !== cita.negocioId) throw new NotFoundException();
      if (cita.version !== datos.version || cita.estado === 'cancelada' || cita.inicioUtc <= ctx.ahora) throw new ConflictException();
      const validacion = await this.motor.revalidarMovimientoEnTransaccion(manager, identidad, id, datos, ctx.ahora);
      if (!validacion.valido || validacion.inicioUtc <= ctx.ahora) throw new ConflictException();
      const horario = { inicioUtc: validacion.inicioUtc, finUtc: validacion.finUtc,
        finOcupacionUtc: new Date(validacion.finUtc.getTime() + cita.separacionMinutos * 60000), zonaHorariaReserva: validacion.zonaHoraria };
      if (cita.inicioUtc.getTime() === horario.inicioUtc.getTime() && cita.finUtc.getTime() === horario.finUtc.getTime() &&
        cita.finOcupacionUtc?.getTime() === horario.finOcupacionUtc.getTime() && cita.zonaHorariaReserva === horario.zonaHorariaReserva) return this.proyectar(cita);
      if (cita.version === 4294967295) throw new ConflictException();
      const version = cita.version + 1;
      const actualizada = await manager.getRepository(Cita).update({ id, negocioId: ctx.negocioId, version: cita.version }, { ...horario, version });
      if (actualizada.affected !== 1) throw new ConflictException();
      // El evento contiene solo valores operativos anteriores/nuevos, sin copiar contacto o notas.
      const eventos = manager.getRepository(EventoCita);
      await eventos.save(eventos.create({ negocioId: ctx.negocioId, citaId: id, actorUsuarioId: ctx.actorId,
        sesionPublicaId: null, accion: 'cambio_horario', ocurridoEn: ctx.ahora, versionResultante: version,
        valoresAntes: this.valoresHorario(cita), valoresDespues: this.valoresHorario({ ...cita, ...horario, version }), motivo: null }));
      return this.proyectar({ ...cita, ...horario, version });
    }, 'READ COMMITTED');
  }

  private valoresHorario(cita: Cita) {
    return { inicioUtc: cita.inicioUtc.toISOString(), finUtc: cita.finUtc.toISOString(),
      finOcupacionUtc: cita.finOcupacionUtc?.toISOString() ?? null, zonaHoraria: cita.zonaHorariaReserva, version: cita.version };
  }

  private proyectar(cita: Cita) {
    return { id: cita.id, folio: cita.folio, estado: cita.estado, ...this.valoresHorario(cita),
      finOcupacionUtc: (cita.finOcupacionUtc ?? cita.finUtc).toISOString() };
  }
}

