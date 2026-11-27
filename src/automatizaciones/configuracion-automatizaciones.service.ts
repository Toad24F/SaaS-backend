import { BadRequestException, ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { Rol } from '../auth/enums/rol.enum';
import { Negocio } from '../negocios/entities/negocio.entity';
import { Usuario } from '../usuarios/entities/usuario.entity';
import { ConfiguracionAutomatizaciones } from './entities/configuracion-automatizaciones.entity';

type ValoresConfiguracion = Pick<ConfiguracionAutomatizaciones,
  'version' | 'plazoConfirmacionHoras' | 'recordatorioHoras'>;

const VERSION_MAXIMA = 2 ** 32 - 1;

/** La versión cero representa los valores efectivos antes de la primera escritura. */
function proyectar(fila: ConfiguracionAutomatizaciones | null): ValoresConfiguracion {
  return {
    version: fila?.version ?? 0,
    plazoConfirmacionHoras: fila?.plazoConfirmacionHoras ?? 12,
    recordatorioHoras: fila?.recordatorioHoras ?? 24,
  };
}

function entero(valor: unknown, campo: string, minimo: number, maximo: number): number {
  if (typeof valor !== 'number' || !Number.isInteger(valor) || valor < minimo || valor > maximo) {
    throw new BadRequestException(`${campo} debe ser un entero entre ${minimo} y ${maximo}.`);
  }
  return valor;
}

/** Valida el reemplazo completo y rechaza identificadores o campos ajenos al contrato. */
function validar(entrada: unknown): ValoresConfiguracion {
  if (!entrada || typeof entrada !== 'object' || Array.isArray(entrada)) {
    throw new BadRequestException('Envía la versión y ambos plazos de automatización.');
  }
  const datos = entrada as Record<string, unknown>;
  if (Object.keys(datos).some(campo => !['version', 'plazoConfirmacionHoras', 'recordatorioHoras'].includes(campo))) {
    throw new BadRequestException('La configuración contiene campos no permitidos.');
  }
  return {
    version: entero(datos.version, 'La versión', 0, VERSION_MAXIMA),
    plazoConfirmacionHoras: entero(datos.plazoConfirmacionHoras, 'El plazo de confirmación', 6, 24),
    recordatorioHoras: entero(datos.recordatorioHoras, 'La anticipación del recordatorio', 12, 48),
  };
}

@Injectable()
export class ConfiguracionAutomatizacionesService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly auditoria: AuditoriaService,
  ) {}

  async consultar(actorId: number): Promise<ValoresConfiguracion> {
    const negocioId = this.negocioDelAdministrador(await this.db.manager.findOneBy(Usuario, { id: actorId }));
    return proyectar(await this.db.manager.findOneBy(ConfiguracionAutomatizaciones, { negocioId }));
  }

  async guardar(actorId: number, entrada: unknown): Promise<ValoresConfiguracion> {
    const datos = validar(entrada);
    return this.db.transaction('READ COMMITTED', async (manager) => {
      // El orden usuario → negocio coincide con los demás escritores. La fila del negocio
      // serializa también la primera edición, antes de que exista una configuración.
      const actor = await manager.findOne(Usuario, { where: { id: actorId }, lock: { mode: 'pessimistic_write' } });
      const negocioId = this.negocioDelAdministrador(actor);
      const negocio = await manager.findOne(Negocio, {
        where: { id: negocioId }, select: { id: true }, lock: { mode: 'pessimistic_write' },
      });
      if (!negocio) throw new ForbiddenException('Negocio no disponible.');

      const fila = await manager.findOneBy(ConfiguracionAutomatizaciones, { negocioId });
      const anterior = proyectar(fila);
      if (anterior.version !== datos.version) {
        throw new ConflictException('La versión de automatizaciones cambió. Recarga y vuelve a intentarlo.');
      }
      if (datos.version === VERSION_MAXIMA) {
        throw new ConflictException('La configuración de automatizaciones alcanzó su versión máxima.');
      }
      const siguiente = { ...datos, version: datos.version + 1 };
      if (fila) await manager.update(ConfiguracionAutomatizaciones, { negocioId }, siguiente);
      else await manager.insert(ConfiguracionAutomatizaciones, { negocioId, ...siguiente });

      // El cambio y su auditoría comparten el commit. Las citas, condiciones y envíos
      // conservan el plazo o la programación que se les asignó al crearlos.
      await this.auditoria.registrar(manager, {
        operacionId: randomUUID(), actorUsuarioId: actorId, negocioId, usuarioId: null,
        licenciaId: null, accion: 'configuracion_automatizaciones_modificada',
        valoresAntes: anterior, valoresDespues: siguiente,
      });
      return siguiente;
    });
  }

  private negocioDelAdministrador(usuario: Usuario | null): number {
    if (!usuario?.activo || !usuario.activadoEn || usuario.inhabilitadoEn ||
        usuario.negocioId === null || usuario.rol !== Rol.ADMIN_NEGOCIO) {
      throw new ForbiddenException('Se requiere una cuenta activa de administración del negocio.');
    }
    return usuario.negocioId;
  }
}
