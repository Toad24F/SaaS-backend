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
import { validarAltaCliente, validarBusquedaClientes, validarConsultaFicha, validarCorreccionCliente,
  validarIdCliente, validarPaginacionClientes, type DatosCliente } from './clientes.entrada';

type Identidad = Pick<JwtPayload, 'sub' | 'sesionId'>;
const CAMPOS_FICHA = ['id', 'negocioId', 'version', 'nombreCompleto', 'telefono', 'creadoEn'] as const;
const CAMPOS_CITA = ['id', 'negocioId', 'clienteId', 'version', 'sucursalId', 'personalId', 'servicioId',
  'inicioUtc', 'finUtc', 'zonaHorariaReserva', 'estado', 'origen', 'folio', 'nombreContacto', 'telefonoContacto',
  'motivoConsulta', 'costoAceptado', 'nombreSucursal', 'nombreServicio', 'nombreProfesional'] as const;
const escaparLike = (valor: string) => valor.replace(/[!%_]/g, '!$&');
function proyectarFicha(ficha: Cliente) {
  return Object.fromEntries(CAMPOS_FICHA.map((k) => [k, ficha[k]])) as Pick<Cliente, typeof CAMPOS_FICHA[number]>;
}

/** Directorio privado: el teléfono se busca como contacto y nunca decide la identidad de una ficha. */
@Injectable()
export class ClientesService {
  constructor(private readonly acceso: AccesoOperativoService, private readonly auditoria: AuditoriaService) {}

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
        .select(CAMPOS_FICHA.map((k) => `cliente.${k}`)).where(this.acceso.alcanceClientes(ctx));
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
    const datos = validarAltaCliente(entrada);
    return this.acceso.ejecutar(identidad, Permiso.GESTIONAR_CLIENTES, async (inicial) => {
      const ctx = await this.bloquearAcceso(inicial, identidad);
      const actual = await this.acceso.resolverEnTransaccion(ctx.manager, identidad, Permiso.GESTIONAR_CLIENTES);
      return this.insertarFicha(actual, datos);
    });
  }

  /** Alta interna del escritor manual: el llamador ya mantiene los bloqueos comunes.
   * Comparte manager, reloj y auditoría con la cita; nunca abre otro commit ni fusiona por contacto.
   */
  async crearParaCitaEnTransaccion(manager: EntityManager, identidad: Identidad, entrada: unknown, instante?: Date) {
    const datos = validarAltaCliente(entrada);
    const ctx = await this.acceso.resolverEnTransaccion(manager, identidad, Permiso.CREAR_CITA_MANUAL, instante);
    return this.insertarFicha(ctx, datos);
  }

  private async insertarFicha(ctx: ContextoOperativo, datos: DatosCliente) {
    // Siempre INSERT: ni teléfono ni nombre coincidentes sobrescriben otra persona.
    const repositorio = ctx.manager.getRepository(Cliente);
    const ficha = await repositorio.save(repositorio.create({ ...datos, negocioId: ctx.negocioId, version: 1, creadoEn: ctx.ahora }));
    await this.registrar(ctx, ficha, null, ['nombreCompleto', 'telefono']);
    return proyectarFicha(ficha);
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
      if (ficha.version >= 4294967295) throw new ConflictException();
      const versionAntes = ficha.version;
      const resultado = await actual.manager.getRepository(Cliente).update({ id, negocioId: actual.negocioId, version: versionAntes },
        { nombreCompleto, telefono, version: versionAntes + 1 });
      if (resultado.affected !== 1) throw new ConflictException();
      Object.assign(ficha, { nombreCompleto, telefono, version: versionAntes + 1 });
      // No se escribe ninguna cita: su contacto y demás snapshots permanecen tal como se registraron.
      await this.registrar(actual, ficha, versionAntes, campos);
      return proyectarFicha(ficha);
    });
  }

  private async exigirFicha(ctx: ContextoOperativo, id: number, bloquear = false): Promise<Cliente> {
    const consulta = ctx.manager.getRepository(Cliente).createQueryBuilder('cliente')
      .select(CAMPOS_FICHA.map((k) => `cliente.${k}`)).where({ ...this.acceso.alcanceClientes(ctx), id });
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
