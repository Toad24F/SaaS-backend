import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { Permiso } from '../auth/services/autorizacion.service';
import { Usuario } from '../usuarios/entities/usuario.entity';
import { Licencia } from '../licencias/entities/licencia.entity';
import { Cita } from '../disponibilidad/entities/cita.entity';
import { bloquearNegocioAgenda, bloquearRecursosAgenda } from '../comun/bloqueos-coordinados';
import { MotorDisponibilidadService } from '../disponibilidad/motor-disponibilidad.service';
import { AccesoOperativoService } from './acceso-operativo.service';
import { validarCambioEstado } from './cambio-estado.entrada';
import { validarIdCita } from './consulta-cita.entrada';
import { EventoCita } from './entities/evento-cita.entity';

/** Escritor de estados: versión y evento comparten commit y el bloqueo común del Profesional. */
@Injectable()
export class CambioEstadoCitaService {
  constructor(private readonly acceso: AccesoOperativoService, private readonly motor: MotorDisponibilidadService) {}

  async cambiar(identidad: Pick<JwtPayload, 'sub' | 'sesionId'>, entradaId: unknown, entrada: unknown) {
    const id = validarIdCita(entradaId);
    const datos = validarCambioEstado(entrada);
    return this.acceso.ejecutar(identidad, Permiso.CAMBIAR_ESTADO_CITA, async (inicial) => {
      const manager = inicial.manager;
      // Esta lectura solo descubre recursos inmutables dentro del negocio; no autoriza una edición.
      // La fila y su versión se releen bajo bloqueo después del Profesional.
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
      // READ COMMITTED y este nuevo acceso comparten un reloj posterior a todas las esperas.
      const ctx = await this.acceso.resolverEnTransaccion(manager, identidad, Permiso.CAMBIAR_ESTADO_CITA);
      if (ctx.negocioId !== cita.negocioId) throw new NotFoundException();
      if (cita.version !== datos.version) throw new ConflictException();
      if (cita.estado === datos.estado) return this.proyectar(cita);
      if (cita.version === 4294967295) throw new ConflictException();
      if ((datos.estado === 'completada' || datos.estado === 'no_asistio') && ctx.ahora < cita.finUtc) throw new ConflictException();
      if (cita.estado === 'cancelada') {
        // No se consulta cupo telefónico al reactivar. El motor verifica el intervalo histórico
        // sin excluir ninguna cita activa ni aceptar duración/separación procedentes del formulario.
        if (cita.inicioUtc <= ctx.ahora) throw new ConflictException();
        const validacion = await this.motor.revalidarCitaCanceladaEnTransaccion(manager, identidad, cita.id, ctx.ahora);
        if (!validacion.valido) throw new ConflictException();
      }
      const version = cita.version + 1;
      const actualizada = await manager.getRepository(Cita).update({ id, negocioId: ctx.negocioId, version: cita.version },
        { estado: datos.estado, version });
      if (actualizada.affected !== 1) throw new ConflictException();
      // Se auditan solo los valores operativos que cambian; contacto y notas de atención permanecen en su snapshot.
      await manager.getRepository(EventoCita).insert({ negocioId: ctx.negocioId, citaId: id, actorUsuarioId: ctx.actorId,
        sesionPublicaId: null, accion: datos.estado === 'cancelada' ? 'cancelacion' : cita.estado === 'cancelada' ? 'reactivacion' : 'cambio_estado',
        ocurridoEn: ctx.ahora, versionResultante: version, valoresAntes: { estado: cita.estado, version: cita.version },
        valoresDespues: { estado: datos.estado, version }, motivo: datos.motivo });
      return this.proyectar({ ...cita, estado: datos.estado, version });
    }, 'READ COMMITTED');
  }

  private proyectar(cita: Pick<Cita, 'id' | 'folio' | 'estado' | 'version'>) {
    return { id: cita.id, folio: cita.folio, estado: cita.estado, version: cita.version };
  }
}
