import { ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Brackets, type EntityManager } from 'typeorm';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { Permiso } from '../auth/services/autorizacion.service';
import { Usuario } from '../usuarios/entities/usuario.entity';
import { Cliente } from '../disponibilidad/entities/cliente.entity';
import { Cita } from '../disponibilidad/entities/cita.entity';
import { AccesoOperativoService, type ContextoOperativo } from '../citas/acceso-operativo.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { bloquearNegocioAgenda } from '../comun/bloqueos-coordinados';
import { proyectarHorarioCita } from '../citas/horario-agenda';
import { ResolucionClienteService } from './resolucion-cliente.service';
import { ClienteCoincidenteException } from './cliente-coincidente';
import { UnionCliente } from './entities/union-cliente.entity';
import { normalizarIdentidadCliente, normalizarNombreCliente } from './identidad-cliente';
import { huellaUnionCliente, MAX_ENTERO_CLIENTE, validarAltaCliente, validarBusquedaClientes, validarConsultaFicha,
  validarCorreccionCliente, validarIdCliente, validarPaginacionClientes, validarUnionCliente, type DatosCliente } from './clientes.entrada';

type Identidad = Pick<JwtPayload, 'sub' | 'sesionId'>;
const CAMPOS_FICHA = ['id', 'negocioId', 'version', 'nombreCompleto', 'telefono', 'creadoEn'] as const;
// El historial identifica las citas con sus IDs y conserva el contacto de cada reserva.
const CAMPOS_CITA = ['id', 'negocioId', 'clienteId', 'version', 'sucursalId', 'personalId', 'servicioId',
  'inicioUtc', 'finUtc', 'zonaHorariaReserva', 'estado', 'origen', 'nombreContacto', 'telefonoContacto',
  'motivoConsulta', 'costoAceptado', 'nombreSucursal', 'nombreServicio', 'nombreProfesional'] as const;
const escaparLike = (valor: string) => valor.replace(/[!%_]/g, '!$&');
function proyectarFicha(ficha: Cliente) {
  return Object.fromEntries(CAMPOS_FICHA.map((k) => [k, ficha[k]])) as Pick<Cliente, typeof CAMPOS_FICHA[number]>;
}

/** Las versiones resultantes se derivan de la decisión, aunque las fichas cambien después. */
function proyectarUnion(operacion: UnionCliente) {
  return { id: String(operacion.id), origenId: operacion.origenId, destinoId: operacion.destinoId,
    versionOrigen: operacion.versionOrigen + 1, versionDestino: operacion.versionDestino + 1,
    ocurridoEn: operacion.ocurridoEn.toISOString() };
}

/** Directorio privado: el buscador admite teléfonos compartidos y el alta usa la identidad completa. */
@Injectable()
export class ClientesService {
  constructor(private readonly acceso: AccesoOperativoService, private readonly auditoria: AuditoriaService,
    private readonly resolucion: ResolucionClienteService) {}

  /** Selección interna para el escritor manual: releer después de sus bloqueos, en su propio commit.
   * El ID es obligatorio; ni un teléfono coincidente ni datos del navegador suplen una ficha ajena.
   * No abre otra transacción ni reserva capacidad: el escritor conserva la revalidación y sus bloqueos.
   * El instante interno opcional conserva la misma decisión temporal que motor y cupo.
   */
  async resolverExistenteEnTransaccion(manager: EntityManager, identidad: Identidad, entradaId: unknown, instante?: Date) {
    const id = validarIdCliente(entradaId);
    const ctx = await this.acceso.resolverEnTransaccion(manager, identidad, Permiso.CREAR_CITA_MANUAL, instante);
    return proyectarFicha(await this.exigirFicha(ctx, id));
  }

  async listar(identidad: Identidad, entrada: unknown) {
    const filtro = validarBusquedaClientes(entrada);
    return this.acceso.ejecutar(identidad, Permiso.CONSULTAR_CLIENTES, async (ctx) => {
      const consulta = ctx.manager.getRepository(Cliente).createQueryBuilder('cliente')
        .select(CAMPOS_FICHA.map((k) => `cliente.${k}`)).where(this.acceso.alcanceClientes(ctx))
        // Excluir las fichas absorbidas antes de buscar o calcular si hay otra página.
        .andWhere('cliente.fusionadoEnId IS NULL');
      if (filtro.busqueda) {
        const compacto = filtro.busqueda.replace(/[\s-]/g, '').replace(/^\+52/, '');
        // Búsqueda parcial por teléfono admite formato mexicano; nombres y símbolos se buscan literalmente.
        const telefono = /^\d{1,10}$/.test(compacto) ? compacto : filtro.busqueda;
        consulta.andWhere(new Brackets((q) => q.where("cliente.nombreCompleto LIKE :nombre ESCAPE '!'", { nombre: `%${escaparLike(filtro.busqueda!)}%` })
          .orWhere("cliente.telefono LIKE :telefono ESCAPE '!'", { telefono: `%${escaparLike(telefono)}%` })));
      }
      const filas = await consulta.orderBy('cliente.nombreCompleto', 'ASC').addOrderBy('cliente.id', 'ASC')
        .offset((filtro.pagina - 1) * filtro.limite).limit(filtro.limite + 1).getMany();
      return { clientes: filas.slice(0, filtro.limite).map(proyectarFicha), pagina: filtro.pagina,
        limite: filtro.limite, hayMas: filas.length > filtro.limite };
    }, 'REPEATABLE READ');
  }

  async consultar(identidad: Identidad, entradaId: unknown, query: unknown) {
    const id = validarIdCliente(entradaId);
    validarConsultaFicha(query);
    return this.acceso.ejecutar(identidad, Permiso.CONSULTAR_CLIENTES, async (ctx) =>
      proyectarFicha(await this.exigirFicha(ctx, id)), 'REPEATABLE READ');
  }

  async historialCitas(identidad: Identidad, entradaId: unknown, query: unknown) {
    const id = validarIdCliente(entradaId);
    const filtro = validarPaginacionClientes(query);
    return this.acceso.ejecutar(identidad, Permiso.CONSULTAR_CLIENTES, async (ctx) => {
      await this.exigirFicha(ctx, id);
      // El vínculo es el ID compuesto de ficha, nunca su teléfono ni su nombre actual.
      const filas = await ctx.manager.getRepository(Cita).createQueryBuilder('cita')
        .select(CAMPOS_CITA.map((k) => `cita.${k}`)).where({ negocioId: ctx.negocioId, clienteId: id })
        .orderBy('cita.inicioUtc', 'ASC').addOrderBy('cita.id', 'ASC')
        .offset((filtro.pagina - 1) * filtro.limite).limit(filtro.limite + 1).getMany();
      return { citas: filas.slice(0, filtro.limite).map((cita) => ({
        ...Object.fromEntries(CAMPOS_CITA.map((k) => [k, cita[k]])) as Pick<Cita, typeof CAMPOS_CITA[number]>,
        ...proyectarHorarioCita(cita) })), pagina: filtro.pagina, limite: filtro.limite, hayMas: filas.length > filtro.limite };
    }, 'REPEATABLE READ');
  }

  async crear(identidad: Identidad, entrada: unknown) {
    return (await this.crearConMeta(identidad, entrada)).ficha;
  }

  /** El estado HTTP se decide con el mismo resultado transaccional que la auditoría. */
  async crearConMeta(identidad: Identidad, entrada: unknown) {
    const datos = validarAltaCliente(entrada);
    return this.acceso.ejecutar(identidad, Permiso.GESTIONAR_CLIENTES, async (inicial) => {
      const ctx = await this.bloquearAcceso(inicial, identidad);
      const actual = await this.acceso.resolverEnTransaccion(ctx.manager, identidad, Permiso.GESTIONAR_CLIENTES);
      return this.resolverFicha(actual, datos);
    });
  }

  /** Resolución del contacto capturado por el escritor manual bajo los bloqueos de agenda.
   * La ficha y, si es nueva, su auditoría comparten el commit de la cita.
   */
  async resolverContactoParaCitaEnTransaccion(manager: EntityManager, identidad: Identidad, datos: DatosCliente, instante: Date) {
    const ctx = await this.acceso.resolverEnTransaccion(manager, identidad, Permiso.CREAR_CITA_MANUAL, instante);
    return (await this.resolverFicha(ctx, datos)).ficha;
  }

  private async resolverFicha(ctx: ContextoOperativo, datos: DatosCliente) {
    const { ficha, creada } = await this.resolucion.resolverEnTransaccion(ctx.manager, ctx.negocioId, datos, ctx.ahora);
    // Reutilizar una ficha conserva su versión, sus datos y su auditoría existente.
    if (creada) await this.registrar(ctx, ficha, null, ['nombreCompleto', 'telefono']);
    return { ficha: proyectarFicha(ficha), creada };
  }

  async corregir(identidad: Identidad, entradaId: unknown, entrada: unknown) {
    const id = validarIdCliente(entradaId);
    const datos = validarCorreccionCliente(entrada);
    return this.acceso.ejecutar(identidad, Permiso.GESTIONAR_CLIENTES, async (inicial) => {
      const ctx = await this.bloquearAcceso(inicial, identidad);
      const ficha = await this.exigirFicha(ctx, id, true);
      // Releer después de TODAS las esperas, incluida la fila de cliente, y antes de cualquier escritura.
      const actual = await this.acceso.resolverEnTransaccion(ctx.manager, identidad, Permiso.GESTIONAR_CLIENTES);
      if (ficha.version !== datos.version) throw new ConflictException();
      const nombreCompleto = datos.nombreCompleto ?? ficha.nombreCompleto;
      const telefono = datos.telefono ?? ficha.telefono;
      const campos = [...(nombreCompleto === ficha.nombreCompleto ? [] : ['nombreCompleto']), ...(telefono === ficha.telefono ? [] : ['telefono'])];
      if (!campos.length) return proyectarFicha(ficha);
      if (ficha.version >= MAX_ENTERO_CLIENTE) throw new ConflictException();
      // La edición propone el destino bajo el bloqueo de negocio. Varias coincidencias
      // heredadas requieren revisión y no producen una sugerencia arbitraria.
      const identidadNueva = normalizarIdentidadCliente(nombreCompleto, telefono);
      const candidatas = await this.resolucion.buscarCoincidencias(actual.manager, actual.negocioId,
        identidadNueva, { excluirId: id });
      if (candidatas.length > 1) throw new ConflictException();
      if (candidatas.length === 1) throw new ClienteCoincidenteException(candidatas[0]);
      const versionAntes = ficha.version;
      const resultado = await actual.manager.getRepository(Cliente).update({ id, negocioId: actual.negocioId, version: versionAntes },
        { nombreCompleto, telefono, nombreNormalizado: Buffer.from(identidadNueva.nombreNormalizado), version: versionAntes + 1 });
      if (resultado.affected !== 1) throw new ConflictException();
      Object.assign(ficha, { nombreCompleto, telefono, version: versionAntes + 1 });
      // No se escribe ninguna cita: su contacto y demás snapshots permanecen tal como se registraron.
      await this.registrar(actual, ficha, versionAntes, campos);
      return proyectarFicha(ficha);
    });
  }

  /** Confirma la unión y su evidencia dentro de una sola transacción del negocio. */
  async unir(identidad: Identidad, entradaId: unknown, cuerpo: unknown) {
    const origenId = validarIdCliente(entradaId);
    const entrada = validarUnionCliente(cuerpo, origenId);
    return this.acceso.ejecutar(identidad, Permiso.GESTIONAR_CLIENTES, async (inicial) => {
      const ctx = await this.bloquearAcceso(inicial, identidad);
      const operaciones = ctx.manager.getRepository(UnionCliente);
      const contenidoHash = huellaUnionCliente(origenId, entrada);
      const anterior = await operaciones.findOneBy({ negocioId: ctx.negocioId, actorUsuarioId: ctx.actorId, clave: entrada.clave });
      if (anterior) {
        // Recuperar antes de exigir que el origen esté activo: una unión confirmada lo absorbió.
        await this.acceso.resolverEnTransaccion(ctx.manager, identidad, Permiso.GESTIONAR_CLIENTES);
        if (anterior.contenidoHash !== contenidoHash) throw new ConflictException();
        return proyectarUnion(anterior);
      }

      // Orden global: negocio, fichas en ID ascendente, después citas en ID ascendente.
      const ids = [origenId, entrada.destinoId].sort((a, b) => a - b);
      const primera = await this.exigirFicha(ctx, ids[0], true, true);
      const segunda = await this.exigirFicha(ctx, ids[1], true, true);
      const [origen, destino] = primera.id === origenId ? [primera, segunda] : [segunda, primera];
      const actual = await this.acceso.resolverEnTransaccion(ctx.manager, identidad, Permiso.GESTIONAR_CLIENTES);
      await this.exigirUnionVigente(actual, origen, destino, entrada);

      const citaIds = await this.trasladarCitas(actual, origen.id, destino.id);
      const fichas = actual.manager.getRepository(Cliente);
      for (const ficha of [primera, segunda]) {
        // Cambian el vínculo histórico y las versiones. El contacto del destino permanece intacto.
        const cambio = await fichas.update({ id: ficha.id, negocioId: actual.negocioId, version: ficha.version },
          { version: ficha.version + 1, ...(ficha.id === origenId ? { fusionadoEnId: destino.id } : {}) });
        if (cambio.affected !== 1) throw new ConflictException();
      }
      const operacion = await operaciones.save(operaciones.create({
        negocioId: actual.negocioId, actorUsuarioId: actual.actorId, origenId, destinoId: destino.id,
        versionOrigen: origen.version, versionDestino: destino.version, clave: entrada.clave,
        contenidoHash, ocurridoEn: actual.ahora,
      }));
      const resultado = proyectarUnion(operacion);
      await this.auditoria.registrar(actual.manager, { operacionId: randomUUID(), actorUsuarioId: actual.actorId,
        negocioId: actual.negocioId, usuarioId: null, licenciaId: null, recursoTipo: 'cliente', recursoId: origenId,
        accion: 'cliente_unido', ocurridoEn: actual.ahora,
        valoresAntes: { versionOrigen: origen.version, versionDestino: destino.version },
        valoresDespues: { unionId: resultado.id, destinoId: destino.id, motivo: 'coincidencia_identidad', citaIds,
          versionOrigen: resultado.versionOrigen, versionDestino: resultado.versionDestino },
      });
      return resultado;
    });
  }

  private async exigirUnionVigente(ctx: ContextoOperativo, origen: Cliente, destino: Cliente,
    entrada: ReturnType<typeof validarUnionCliente>) {
    if (origen.fusionadoEnId !== null || destino.fusionadoEnId !== null ||
      origen.version !== entrada.versionOrigen || destino.version !== entrada.versionDestino ||
      origen.version >= MAX_ENTERO_CLIENTE || destino.version >= MAX_ENTERO_CLIENTE) throw new ConflictException();
    const propuesta = normalizarIdentidadCliente(entrada.datosPropuestos?.nombreCompleto ?? origen.nombreCompleto,
      entrada.datosPropuestos?.telefono ?? origen.telefono);
    if (propuesta.telefono !== destino.telefono ||
      propuesta.nombreNormalizado !== normalizarNombreCliente(destino.nombreCompleto)) throw new ConflictException();
    if (entrada.datosPropuestos) {
      // La advertencia de edición debe seguir señalando exactamente el mismo destino.
      const candidatas = await this.resolucion.buscarCoincidencias(ctx.manager, ctx.negocioId, propuesta, { excluirId: origen.id });
      if (candidatas.length !== 1 || candidatas[0].id !== destino.id) throw new ConflictException();
    }
  }

  private async trasladarCitas(ctx: ContextoOperativo, origenId: number, destinoId: number): Promise<number[]> {
    const repo = ctx.manager.getRepository(Cita);
    const origen = { negocioId: ctx.negocioId, clienteId: origenId };
    const citas = await repo.createQueryBuilder('cita').select('cita.id').where(origen)
      .orderBy('cita.id', 'ASC').setLock('pessimistic_write').getMany();
    if (citas.length) {
      // Solo se mueve la FK. No se reescriben snapshots, versiones ni eventos de cita.
      const cambio = await repo.update(origen, { clienteId: destinoId });
      if (cambio.affected !== citas.length) throw new ConflictException();
    }
    return citas.map(cita => cita.id);
  }

  private async exigirFicha(ctx: ContextoOperativo, id: number, bloquear = false, incluirFusionada = false): Promise<Cliente> {
    const consulta = ctx.manager.getRepository(Cliente).createQueryBuilder('cliente')
      .select(CAMPOS_FICHA.map((k) => `cliente.${k}`)).addSelect('cliente.fusionadoEnId')
      .where({ ...this.acceso.alcanceClientes(ctx), id });
    // La unión distingue una fila absorbida bajo bloqueo. El directorio solo selecciona activas.
    if (!incluirFusionada) consulta.andWhere('cliente.fusionadoEnId IS NULL');
    if (bloquear) consulta.setLock('pessimistic_write');
    const ficha = await consulta.getOne();
    if (!ficha) throw new NotFoundException();
    return ficha;
  }

  private async bloquearAcceso(ctx: ContextoOperativo, identidad: Identidad) {
    // Orden común: usuario -> negocio -> cliente. Descubrir el negocio otra vez bajo el bloqueo del usuario.
    const usuario = await ctx.manager.getRepository(Usuario).createQueryBuilder('usuario').select('usuario.id')
      .setLock('pessimistic_read').where('usuario.id = :id', { id: ctx.actorId }).getOne();
    if (!usuario) throw new UnauthorizedException();
    const vigente = await this.acceso.resolverEnTransaccion(ctx.manager, identidad, Permiso.GESTIONAR_CLIENTES);
    await bloquearNegocioAgenda(vigente.manager, vigente.negocioId);
    return vigente;
  }

  private async registrar(ctx: ContextoOperativo, ficha: Cliente, versionAntes: number | null, campos: string[]) {
    // Valores permitidos: versiones y campos afectados. No duplicar contacto, notas ni formularios en auditoría.
    await this.auditoria.registrar(ctx.manager, { operacionId: randomUUID(), actorUsuarioId: ctx.actorId,
      negocioId: ctx.negocioId, usuarioId: null, licenciaId: null, recursoTipo: 'cliente', recursoId: ficha.id,
      accion: versionAntes === null ? 'cliente_creado' : 'cliente_corregido', ocurridoEn: ctx.ahora,
      valoresAntes: versionAntes === null ? null : { version: versionAntes },
      valoresDespues: { version: ficha.version, camposModificados: campos } });
  }
}
