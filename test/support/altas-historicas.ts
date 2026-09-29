// Fixture exclusiva de fase 1: conserva escenarios históricos de activación y licencias.
// No se registra en Nest ni se utiliza para crear negocios en producción.
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import { AuditoriaService } from '../../src/auditoria/auditoria.service';
import { Rol } from '../../src/auth/enums/rol.enum';
import { AutorizacionService, Permiso } from '../../src/auth/services/autorizacion.service';
import { CodigosService } from '../../src/codigos/codigos.service';
import { PropositoCodigoAcceso } from '../../src/codigos/entities/codigo-acceso.entity';
import { Licencia } from '../../src/licencias/entities/licencia.entity';
import { Negocio } from '../../src/negocios/entities/negocio.entity';
import { Usuario } from '../../src/usuarios/entities/usuario.entity';

export interface CrearNegocioHistorico {
  actorUsuarioId: number;
  nombre: string;
  identificadorPublico: string;
  emailAdministrador: string;
  ahora: Date;
}

export interface AltaNegocioHistorica {
  correo: string;
  negocioId: number;
  administradorId: number;
  licenciaId: number;
  codigo: string;
  expiraEn: Date;
}

/** Prepara el estado de fase 1 exclusivamente para las regresiones históricas. */
export class AltasHistoricasFixture {
  constructor(
    private readonly negocios: Repository<Negocio>,
    private readonly autorizacion: AutorizacionService,
    private readonly codigos: CodigosService,
    private readonly auditoria: AuditoriaService,
  ) { }

  async crearNegocio(datos: CrearNegocioHistorico): Promise<AltaNegocioHistorica> {
    const nombre = datos.nombre.trim();
    const slug = datos.identificadorPublico.trim().toLowerCase();
    const email = datos.emailAdministrador.trim().toLowerCase();
    if (!nombre || !slug || !email) {
      throw new BadRequestException('Nombre, identificador y correo son obligatorios.');
    }

    try {
      return await this.negocios.manager.transaction(async (manager) => {
        // El rol se obtiene del estado actual: el cliente no puede declararse superadmin.
        const actor = await manager.getRepository(Usuario)
          .createQueryBuilder('usuario')
          .setLock('pessimistic_read')
          .where('usuario.id = :id', { id: datos.actorUsuarioId })
          .getOne();
        if (!actor) throw new ForbiddenException('Acceso denegado.');
        this.autorizacion.exigir(actor.rol, Permiso.CREAR_NEGOCIO);

        const negocio = await manager.getRepository(Negocio).save(
          manager.getRepository(Negocio).create({
            nombre,
            slug,
            // El correo inicial del administrador funciona también como contacto.
            emailContacto: email,
            telefonoContacto: null,
            activadoEn: null,
          }),
        );
        const licencia = await manager.getRepository(Licencia).save(
          manager.getRepository(Licencia).create({
            negocioId: negocio.id,
            habilitadaEn: null,
            venceEn: null,
            suspendidaEn: null,
          }),
        );
        const administrador = await manager.getRepository(Usuario).save(
          manager.getRepository(Usuario).create({
            negocioId: negocio.id,
            nombre: null,
            email,
            passwordHash: null,
            rol: Rol.ADMIN_NEGOCIO,
            activo: true,
            activadoEn: null,
          }),
        );
        const codigo = await this.codigos.emitir(manager, {
          negocioId: negocio.id,
          usuarioId: administrador.id,
          emisorUsuarioId: actor.id,
          proposito: PropositoCodigoAcceso.ACTIVACION_ADMIN,
          legadoFase1: true,
          ahora: datos.ahora,
        });

        // Registra IDs y estado, nunca el código utilizable ni su hash.
        await this.auditoria.registrar(manager, {
          operacionId: randomUUID(),
          actorUsuarioId: actor.id,
          negocioId: negocio.id,
          usuarioId: administrador.id,
          licenciaId: licencia.id,
          accion: 'negocio_creado',
          valoresAntes: null,
          valoresDespues: {
            nombre: negocio.nombre,
            identificadorPublico: negocio.slug,
            licenciaAnualHabilitada: false,
            administradorActivado: false,
          },
        });

        return {
          negocioId: negocio.id,
          administradorId: administrador.id,
          correo: email,
          licenciaId: licencia.id,
          codigo: codigo.codigo,
          expiraEn: codigo.expiraEn,
        };
      });
    } catch (error) {
      const codigo = (error as { driverError?: { code?: string } }).driverError?.code
        ?? (error as { code?: string }).code;
      if (codigo === 'ER_DUP_ENTRY') {
        throw new ConflictException('El identificador o correo ya está registrado.');
      }
      throw error;
    }
  }

}
