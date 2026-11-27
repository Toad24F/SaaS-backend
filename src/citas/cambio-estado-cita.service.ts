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
import { CambiosPoliticaCitaService } from '../automatizaciones/cambios-politica-cita.service';

/** Escritor de estados: versión y evento comparten commit y el bloqueo común del Profesional. */
@Injectable()
export class CambioEstadoCitaService {
  constructor(private readonly acceso: AccesoOperativoService, private readonly motor: MotorDisponibilidadService,
    private readonly politica: CambiosPoliticaCitaService) {}

  async cambiar(identidad: Pick<JwtPayload, 'sub' | 'sesionId'>, entradaId: unknown, entrada: unknown) {
    const id = validarIdCita(entradaId);
    const datos = validarCambioEstado(entrada);
    return this.acceso.ejecutar(identidad, Permiso.CAMBIAR_ESTADO_CITA, async (inicial) => {
      const manager = inicial.manager;
      // Esta lectura solo descubre recursos inmutables dentro del negocio; no autoriza una edición.
      // La fila y su versión se releen bajo bloqueo después del Profesional.
      const referencia = await manager.getRepository(Cita).findOneBy({ id, negocioId: inicial.negocioId });
      if (!referencia) throw new NotFoundException();
      if (inicial.personalId !== null && referencia.personalId !== inicial.personalId) throw new NotFoundException();
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
      // Releer propiedad con el perfil servidor después de todos los bloqueos.
      if (ctx.negocioId !== cita.negocioId || (ctx.personalId !== null && cita.personalId !== ctx.personalId)) throw new NotFoundException();
      if (cita.version !== datos.version) throw new ConflictException();
      if (cita.estado === datos.estado) return this.proyectar(cita);
      if (cita.version === 4294967295) throw new ConflictException();
      if ((datos.estado === 'completada' || datos.estado === 'no_asistio') && ctx.ahora < cita.finUtc) throw new ConflictException();
      if (cita.estado === 'cancelada') {
        if (datos.estado !== 'confirmada') throw new ConflictException();
        // No se consulta cupo telefónico al reactivar. El motor verifica el intervalo histórico
        // sin excluir ninguna cita activa ni aceptar duración/separación procedentes del formulario.
        if (cita.inicioUtc <= ctx.ahora) throw new ConflictException();
        const validacion = await this.motor.revalidarCitaCanceladaEnTransaccion(manager, identidad, cita.id, ctx.ahora);
        if (!validacion.valido) throw new ConflictException();
      }
      const version = cita.version + 1;
      const cambiaGeneracion = cita.estado === 'cancelada' || (cita.estado === 'confirmada' && datos.estado === 'pendiente');
      // El motor dio luz verde antes de sustituir la generación de una reactivación.
      const condicion = cambiaGeneracion ? await this.politica.sustituir(manager, cita, cita, ctx.ahora,
        datos.estado === 'confirmada' ? 'confirmada' : 'seguimiento_manual') : {};
      if (!cambiaGeneracion && (datos.estado === 'cancelada' || (cita.estado === 'pendiente' && datos.estado === 'confirmada'))) {
        await this.politica.cerrarCondicion(manager, cita, ctx.ahora, datos.estado);
      }
      const actualizada = await manager.getRepository(Cita).update({ id, negocioId: ctx.negocioId, version: cita.version },
        { estado: datos.estado, version, causaCancelacion: null, ...condicion });
      if (actualizada.affected !== 1) throw new ConflictException();
      // Se auditan solo los valores operativos que cambian; contacto y notas de atención permanecen en su snapshot.
      await manager.save(EventoCita, { negocioId: ctx.negocioId, citaId: id, actorUsuarioId: ctx.actorId,
        sesionPublicaId: null, accion: datos.estado === 'cancelada' ? 'cancelacion' : cita.estado === 'cancelada' ? 'reactivacion' : 'cambio_estado',
        ocurridoEn: ctx.ahora, versionResultante: version, valoresAntes: { estado: cita.estado, version: cita.version,
          ...(cita.causaCancelacion ? { causaCancelacion: cita.causaCancelacion } : {}) },
        valoresDespues: { estado: datos.estado, version, ...(cita.causaCancelacion ? { causaCancelacion: null } : {}) }, motivo: datos.motivo });
      return this.proyectar({ ...cita, estado: datos.estado, version });
    }, 'READ COMMITTED');
  }

  private proyectar(cita: Pick<Cita, 'id' | 'estado' | 'version'>) {
    // El ID y la versión permiten conciliar el cambio con la cita abierta.
    return { id: cita.id, estado: cita.estado, version: cita.version };
  }
}
