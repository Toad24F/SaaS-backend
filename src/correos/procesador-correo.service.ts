import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { DataSource } from 'typeorm';
import type { EntityManager } from 'typeorm';
import { CodigoAcceso } from '../codigos/entities/codigo-acceso.entity';
import { DerivadorCodigo } from '../codigos/derivador-codigo';
import { AltaAdministrador, EstadoAltaAdministrador } from '../altas/entities/alta-administrador.entity';
import { Usuario } from '../usuarios/entities/usuario.entity';
import { Negocio } from '../negocios/entities/negocio.entity';
import { Licencia } from '../licencias/entities/licencia.entity';
import { avisoElegible } from '../licencias/services/aviso-elegible';
import { Rol } from '../auth/enums/rol.enum';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { RelojSistema } from '../comun/reloj';
import type { Reloj } from '../comun/reloj';
import type { MensajeCorreo, TransporteCorreo } from './transporte-correo';
import { EnvioCorreo, EstadoEnvioCorreo } from './entities/envio-correo.entity';

const ARRENDAMIENTO_MS = 300000;
/** Vista cerrada: nunca serializa entidad de código, contenido, hash o token de trabajo. */
function vista(envio: EnvioCorreo) {
  return {
    id: envio.id, tipo: envio.tipo, estado: envio.estado, intentos: envio.intentos,
    proximoIntentoEn: envio.proximoIntentoEn, confirmadoEn: envio.confirmadoEn,
    ultimoError: envio.ultimoError
  };
}

/** Procesa códigos después del commit; el arranque no dispara entregas. */
@Injectable()
export class ProcesadorCorreoService {
  constructor(private readonly db: DataSource, private readonly transporte: TransporteCorreo,
    private readonly derivador: DerivadorCodigo = new DerivadorCodigo(),
    private readonly reloj: Reloj = new RelojSistema()) { }

  async tomar(): Promise<EnvioCorreo | null> {
    const ahora = this.reloj.ahora();
    return this.db.transaction(async (manager) => {
      // Solo bloquea la fila de trabajo. La consulta bloqueante reevalúa el ganador concurrente.
      const repo = manager.getRepository(EnvioCorreo);
      const envio = await repo.createQueryBuilder('envio').setLock('pessimistic_write')
        .where(`((envio.estado IN ('pendiente','fallido') AND envio.proximoIntentoEn <= :ahora)
          OR (envio.estado = 'tomado' AND envio.arrendadoHasta <= :ahora))`, { ahora })
        .orderBy('envio.id', 'ASC').take(1).getOne();
      if (!envio) return null;
      envio.estado = EstadoEnvioCorreo.TOMADO;
      envio.arrendamientoId = randomUUID();
      envio.arrendadoHasta = new Date(ahora.getTime() + ARRENDAMIENTO_MS);
      envio.intentos += 1;
      return repo.save(envio);//valida y persiste el arrendamiento y el estado de trabajo.
    });
  }

  async procesarUno() {
    const toma = await this.tomar();
    if (!toma) return null;
    let mensaje: MensajeCorreo | null;
    try {
      mensaje = toma.licenciaId !== null ? await this.prepararAviso(toma) :
        await this.db.transaction(async (manager) => {
        const datos = await this.bloquearCodigo(manager, toma);
        if (!this.leaseVigente(datos.envio, toma)) return null;
        const preparado = this.mensajeVigente(datos);
        if (!preparado) {
          // Descartar conserva el historial y no cambia la expiración del código.
          datos.envio.estado = EstadoEnvioCorreo.DESCARTADO;
          datos.envio.arrendamientoId = null;
          datos.envio.arrendadoHasta = null;
          datos.envio.ultimoError = 'Código o destinatario no vigente.';
          await manager.getRepository(EnvioCorreo).save(datos.envio);
        }
        return preparado;
        });
    } catch {
      await this.registrarResultado(toma, new Error('Preparación no disponible.'));
      return this.consultarEstado(toma.id);
    }
    if (!mensaje) return this.consultarEstado(toma.id);
    let error: unknown = null;
    // SMTP ocurre fuera de la transacción de dominio y sin persistir el mensaje.
    try { await this.transporte.enviar(mensaje); } catch (fallo) { error = fallo; }
    // Una caída aquí deja el lease recuperable: no fingimos un fallo SMTP ni un acuse durable.
    await this.registrarResultado(toma, error);
    return this.consultarEstado(toma.id);
  }

  async registrarResultado(toma: EnvioCorreo, error: unknown): Promise<boolean> {
    const ahora = this.reloj.ahora();
    const fallido = error !== null;
    const timeout = typeof error === 'object' && error !== null &&
      'name' in error && error.name === 'TimeoutError';
    // Backoff acotado: no guarda errores externos que puedan incluir contenido o secretos.
    const espera = Math.min(1800000, 60000 * 2 ** Math.min(toma.intentos - 1, 5));
    const resultado = await this.db.getRepository(EnvioCorreo).createQueryBuilder().update()
      .set({
        estado: fallido ? EstadoEnvioCorreo.FALLIDO : EstadoEnvioCorreo.ENVIADO,
        arrendamientoId: null, arrendadoHasta: null,
        confirmadoEn: fallido ? null : ahora,
        ultimoError: fallido ? (timeout ? 'Tiempo de espera agotado al entregar el correo.' :
          'No se pudo entregar el correo.') : null,
        proximoIntentoEn: fallido ? new Date(ahora.getTime() + espera) : ahora
      })// actualiza el estado del envío de correo según el resultado de la entrega, estableciendo el estado, los tiempos de arrendamiento y el próximo intento si hubo un fallo
      .where('id = :id AND estado = :estado AND arrendamiento_id = :token AND arrendado_hasta > :ahora',
        { id: toma.id, estado: EstadoEnvioCorreo.TOMADO, token: toma.arrendamientoId, ahora }).execute();
    return resultado.affected === 1;
  }

  async listar(negocioId: number, actorId: number) {//devueve la lista de envíos de correo para un negocio específico, después de autorizar al actor
    await this.autorizar(this.db.manager, actorId, negocioId);
    const envios = await this.db.getRepository(EnvioCorreo).find({ where: { negocioId }, order: { id: 'ASC' } });
    return envios.map(vista);
  }

  async reintentar(negocioId: number, envioId: string, actorId: number) {//permite a un superadministrador reintentar un envío de correo específico, después de autorizar al actor y bloquear el código asociado
    return this.db.transaction(async (manager) => {
      await this.autorizar(manager, actorId, negocioId);
      const referencia = await manager.getRepository(EnvioCorreo).findOneBy({ id: envioId, negocioId });
      if (!referencia) throw new NotFoundException('Envío no encontrado.');
      if (referencia.licenciaId !== null) {
        // La misma validación impide reintentar versiones o destinatarios sustituidos.
        const licencia = await manager.getRepository(Licencia).createQueryBuilder('licencia')
          .setLock('pessimistic_write').where('licencia.id = :id AND licencia.negocioId = :negocioId',
            { id: referencia.licenciaId, negocioId }).getOne();
        const envioAviso = await manager.getRepository(EnvioCorreo).createQueryBuilder('envio')
          .setLock('pessimistic_write').where('envio.id = :id', { id: envioId }).getOneOrFail();
        if (!licencia || !await this.avisoVigente(manager, envioAviso, licencia) ||
          [EstadoEnvioCorreo.ENVIADO, EstadoEnvioCorreo.DESCARTADO].includes(envioAviso.estado) ||
          (envioAviso.estado === EstadoEnvioCorreo.TOMADO &&
            envioAviso.arrendadoHasta! > this.reloj.ahora())) {
          throw new ConflictException('El envío está confirmado, ocupado u obsoleto.');
        }
        if (envioAviso.estado === EstadoEnvioCorreo.PENDIENTE) return vista(envioAviso);
        const antes = envioAviso.estado;
        envioAviso.estado = EstadoEnvioCorreo.PENDIENTE;
        envioAviso.proximoIntentoEn = this.reloj.ahora();
        envioAviso.arrendamientoId = null;
        envioAviso.arrendadoHasta = null;
        await manager.getRepository(EnvioCorreo).save(envioAviso);
        await new AuditoriaService().registrar(manager, { operacionId: randomUUID(),
          actorUsuarioId: actorId, negocioId, usuarioId: null, licenciaId: null,
          accion: 'envio_reintento_solicitado', valoresAntes: { estado: antes },
          valoresDespues: { envioId, estado: envioAviso.estado } });
        return vista(envioAviso);
      }
      const datos = await this.bloquearCodigo(manager, referencia);
      const envio = datos.envio;
      if ([EstadoEnvioCorreo.ENVIADO, EstadoEnvioCorreo.DESCARTADO].includes(envio.estado) ||//si el envío ya fue enviado o descartado, no se puede reintentar
        (envio.estado === EstadoEnvioCorreo.TOMADO && envio.arrendadoHasta! > this.reloj.ahora()) ||
        !this.mensajeVigente(datos)) {
        throw new ConflictException('El envío está confirmado, ocupado u obsoleto.');
      }
      if (envio.estado === EstadoEnvioCorreo.PENDIENTE) return vista(envio);//si el envío ya está pendiente, devuelve la vista sin cambios
      const antes = envio.estado;
      envio.estado = EstadoEnvioCorreo.PENDIENTE;
      envio.proximoIntentoEn = this.reloj.ahora();
      envio.arrendamientoId = null;
      envio.arrendadoHasta = null;
      await manager.getRepository(EnvioCorreo).save(envio);
      await new AuditoriaService().registrar(manager, {//registra la acción de reintento en la auditoría, incluyendo el estado antes y después del cambio
        operacionId: randomUUID(),
        actorUsuarioId: actorId, negocioId, usuarioId: null, licenciaId: null,
        accion: 'envio_reintento_solicitado', valoresAntes: { estado: antes },
        valoresDespues: { envioId, estado: envio.estado }
      });
      return vista(envio);
    });
  }

  private async autorizar(manager: EntityManager, actorId: number, negocioId: number) {//verifica que el actor sea un superadministrador activo y que el negocio exista antes de permitir la acción
    const actor = await manager.getRepository(Usuario).findOneBy({ id: actorId });
    if (!actor || actor.rol !== Rol.SUPERADMIN || !actor.activo || !actor.activadoEn) {
      throw new ForbiddenException('Solo el superadministrador gestiona envíos.');
    }
    if (!await manager.getRepository(Negocio).existsBy({ id: negocioId })) {
      throw new NotFoundException('Negocio no encontrado.');
    }
  }

  private async bloquearCodigo(manager: EntityManager, referencia: EnvioCorreo) {//bloquea el código de acceso y el destinatario correspondiente al envío de correo, asegurando que no haya cambios concurrentes mientras se procesa el envío
    const codigoRef = referencia.codigoAccesoId === null ? null :
      await manager.getRepository(CodigoAcceso).findOneBy({
        id: referencia.codigoAccesoId,
        negocioId: referencia.negocioId
      });
    // Orden compartido con consumo: destino, código, envío. Nunca envío antes del dominio.
    const destino = !codigoRef ? null : codigoRef.altaAdministradorId !== null
      ? await manager.getRepository(AltaAdministrador).createQueryBuilder('alta').setLock('pessimistic_write')
        .where('alta.id = :id AND alta.negocioId = :negocioId',
          { id: codigoRef.altaAdministradorId, negocioId: referencia.negocioId }).getOne()
      : await manager.getRepository(Usuario).createQueryBuilder('usuario').setLock('pessimistic_write')
        .where('usuario.id = :id AND usuario.negocioId = :negocioId',
          { id: codigoRef.usuarioId, negocioId: referencia.negocioId }).getOne();
    const codigo = !codigoRef ? null : await manager.getRepository(CodigoAcceso)
      .createQueryBuilder('codigo').addSelect('codigo.codigoHash').setLock('pessimistic_write')
      .where('codigo.id = :id AND codigo.negocioId = :negocioId',
        { id: codigoRef.id, negocioId: referencia.negocioId }).getOne();
    const envio = await manager.getRepository(EnvioCorreo).createQueryBuilder('envio')
      .setLock('pessimistic_write').where('envio.id = :id AND envio.negocioId = :negocioId',
        { id: referencia.id, negocioId: referencia.negocioId }).getOneOrFail();
    return { envio, codigo, destino };
  }

  private async prepararAviso(toma: EnvioCorreo): Promise<MensajeCorreo | null> {
    return this.db.transaction(async (manager) => {
      // Licencia -> envío comparte orden con renovación e invalidación del pendiente.
      const licencia = await manager.getRepository(Licencia).createQueryBuilder('licencia')
        .setLock('pessimistic_write')
        .where('licencia.id = :id AND licencia.negocioId = :negocioId',
          { id: toma.licenciaId, negocioId: toma.negocioId }).getOne();
      const envio = await manager.getRepository(EnvioCorreo).createQueryBuilder('envio')
        .setLock('pessimistic_write').where('envio.id = :id', { id: toma.id }).getOneOrFail();
      if (!this.leaseVigente(envio, toma)) return null;
      if (!licencia || !await this.avisoVigente(manager, envio, licencia)) {
        envio.estado = EstadoEnvioCorreo.DESCARTADO;
        envio.arrendamientoId = null;
        envio.arrendadoHasta = null;
        envio.ultimoError = 'Vencimiento o destinatario no vigente.';
        await manager.getRepository(EnvioCorreo).save(envio);
        return null;
      }
      return { destinatario: envio.correoDestinatario,
        asunto: 'Aviso de vencimiento de licencia',
        texto: `La licencia de tu negocio vence el ${licencia.venceEn!.toISOString()}.` };
    });
  }

  private async avisoVigente(manager: EntityManager, envio: EnvioCorreo,
    licencia: Licencia): Promise<boolean> {
    if (!avisoElegible(licencia, this.reloj.ahora()) ||
      licencia.versionVencimiento !== envio.versionVencimiento) return false;
    const negocio = await manager.getRepository(Negocio).findOneBy({ id: licencia.negocioId });
    if (!negocio?.correoAdministrador || negocio.activadoEn === null ||
      negocio.correoAdministrador !== envio.correoDestinatario) return false;
    const admin = await manager.getRepository(Usuario).findOneBy({ negocioId: negocio.id,
      email: envio.correoDestinatario, rol: Rol.ADMIN_NEGOCIO, activo: true });
    return admin?.activadoEn !== null && admin?.activadoEn !== undefined;
  }

  private mensajeVigente({ envio, codigo, destino }: Awaited<ReturnType<ProcesadorCorreoService['bloquearCodigo']>>): MensajeCorreo | null {
    if (!codigo || !destino || codigo.legadoFase1 || codigo.consumidoEn || codigo.invalidadoEn ||//si el código no es válido, no tiene destinatario o ha sido consumido o invalidado, devuelve null
      this.reloj.ahora() >= codigo.expiraEn || String(codigo.proposito) !== String(envio.tipo) ||
      !codigo.correoDestinatario || codigo.correoDestinatario !== envio.correoDestinatario ||
      !codigo.emisionId || !codigo.nonce || !codigo.claveVersion ||
      destino.correoVersion !== codigo.destinatarioVersion) return null;
    const vigente = destino instanceof AltaAdministrador
      ? destino.estado === EstadoAltaAdministrador.PENDIENTE && destino.correo === envio.correoDestinatario
      // Recuperar una contraseña no habilita la cuenta ni levanta una suspensión.
      : destino.activadoEn !== null && destino.email === envio.correoDestinatario &&
      destino.rol === Rol.ADMIN_NEGOCIO;
    if (!vigente) return null;//si el destinatario no es vigente, devuelve null
    const valor = this.derivador.derivar({
      emisionId: codigo.emisionId, nonce: codigo.nonce,
      claveVersion: codigo.claveVersion, proposito: codigo.proposito, negocioId: codigo.negocioId,
      destinatarioTipo: codigo.altaAdministradorId === null ? 'usuario' : 'alta',
      destinatarioId: codigo.altaAdministradorId ?? codigo.usuarioId!,
      destinatarioVersion: codigo.destinatarioVersion, correo: codigo.correoDestinatario
    });
    if (!timingSafeEqual(Buffer.from(this.derivador.hash(valor), 'hex'), Buffer.from(codigo.codigoHash, 'hex'))) return null;
    return {//si el código y el destinatario son vigentes, devuelve un mensaje de correo con el destinatario, asunto y texto correspondientes
      destinatario: envio.correoDestinatario, asunto: 'Código de acceso',
      texto: `Tu código de ${codigo.proposito === 'activacion_admin' ? 'activación' : 'recuperación'} es: ${valor}\nVence: ${codigo.expiraEn.toISOString()}`
    };
  }

  private leaseVigente(envio: EnvioCorreo, toma: EnvioCorreo) {
    return envio.estado === EstadoEnvioCorreo.TOMADO && envio.arrendamientoId === toma.arrendamientoId &&
      envio.arrendadoHasta !== null && envio.arrendadoHasta > this.reloj.ahora();
  }//verifica si el arrendamiento del envío de correo sigue vigente comparando el estado, el ID de arrendamiento y la fecha de vencimiento con la fecha actual

  private async consultarEstado(id: string) {
    return vista(await this.db.getRepository(EnvioCorreo).findOneByOrFail({ id }));
  }//devuelve la vista del estado del envío de correo correspondiente al ID proporcionado, lanzando una excepción si no se encuentra el envío
}
