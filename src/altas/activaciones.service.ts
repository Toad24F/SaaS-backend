import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { Rol } from '../auth/enums/rol.enum';
import { PoliticaContrasenasService } from '../auth/services/politica-contrasenas.service';
import { CodigosService } from '../codigos/codigos.service';
import { PropositoCodigoAcceso } from '../codigos/entities/codigo-acceso.entity';
import { Licencia } from '../licencias/entities/licencia.entity';
import { CalendarioLicenciasService } from '../licencias/services/calendario-licencias.service';
import { PoliticaAccesoLicenciaService } from '../licencias/services/politica-acceso-licencia.service';
import { Negocio } from '../negocios/entities/negocio.entity';
import { Usuario } from '../usuarios/entities/usuario.entity';

export interface ActivarCuenta {
  codigo: string;
  nombre: string;
  password: string;
  ahora: Date;
}

/** Activa únicamente la cuenta ligada al código y comparte su transacción de consumo. */
@Injectable()
export class ActivacionesService {
  constructor(
    @InjectRepository(Usuario) private readonly usuarios: Repository<Usuario>,
    private readonly codigos: CodigosService,
    private readonly contrasenas: PoliticaContrasenasService,
    private readonly politicaLicencia: PoliticaAccesoLicenciaService,
    private readonly calendario: CalendarioLicenciasService,
    private readonly auditoria: AuditoriaService,
  ) { }

  async activarAdministrador(datos: ActivarCuenta): Promise<void> {
    const { nombre, passwordHash } = await this.prepararCredenciales(datos);
    await this.codigos.consumir(this.usuarios.manager.connection, {
      codigo: datos.codigo,
      proposito: PropositoCodigoAcceso.ACTIVACION_ADMIN,
      ahora: datos.ahora,
    }, async (manager, codigo) => {
      const usuario = await manager.getRepository(Usuario).findOneByOrFail({ id: codigo.usuarioId });
      const licencia = await manager.getRepository(Licencia).createQueryBuilder('licencia')
        .setLock('pessimistic_write')
        .where('licencia.negocioId = :negocioId', { negocioId: codigo.negocioId })
        .getOneOrFail();
      if (
        usuario.rol !== Rol.ADMIN_NEGOCIO ||
        usuario.activadoEn !== null ||
        !this.politicaLicencia.puedeActivarAdministrador(licencia, datos.ahora)
      ) {
        throw new BadRequestException('La cuenta no puede activarse.');
      }

      const venceEn = this.calendario.sumarAnios(datos.ahora);
      // Cuenta, negocio y primer año cambian juntos o se revierten juntos.
      await manager.getRepository(Usuario).update(usuario.id, {
        nombre, passwordHash, activadoEn: new Date(datos.ahora),
      });
      await manager.getRepository(Negocio).update(codigo.negocioId, {
        activadoEn: new Date(datos.ahora),
      });
      await manager.getRepository(Licencia).update(licencia.id, {
        habilitadaEn: new Date(datos.ahora), venceEn,
      });
      await this.auditoria.registrar(manager, {
        operacionId: randomUUID(), actorUsuarioId: usuario.id,
        negocioId: codigo.negocioId, usuarioId: usuario.id, licenciaId: licencia.id,
        accion: 'administrador_activado', valoresAntes: { activadoEn: null },
        valoresDespues: { activadoEn: datos.ahora.toISOString(), venceEn: venceEn.toISOString() },
      });
    });
  }

  async activarRecepcionista(datos: ActivarCuenta): Promise<void> {
    const { nombre, passwordHash } = await this.prepararCredenciales(datos);
    await this.codigos.consumir(this.usuarios.manager.connection, {
      codigo: datos.codigo,
      proposito: PropositoCodigoAcceso.ACTIVACION_RECEPCIONISTA,
      ahora: datos.ahora,
    }, async (manager, codigo) => {
      const usuario = await manager.getRepository(Usuario).findOneByOrFail({ id: codigo.usuarioId });
      const licencia = await manager.getRepository(Licencia).findOneByOrFail({ negocioId: codigo.negocioId });
      const negocio = await manager.getRepository(Negocio).findOneByOrFail({ id: codigo.negocioId });
      if (
        usuario.rol !== Rol.RECEPCIONISTA || usuario.activadoEn !== null ||
        negocio.activadoEn === null ||
        !this.politicaLicencia.puedeActivarRecepcionista(licencia, datos.ahora)
      ) {
        throw new BadRequestException('La cuenta no puede activarse.');
      }

      // Solo completa credenciales; correo, tenant, rol y licencia permanecen intactos.
      await manager.getRepository(Usuario).update(usuario.id, {
        nombre, passwordHash, activadoEn: new Date(datos.ahora),
      });
      await this.auditoria.registrar(manager, {
        operacionId: randomUUID(), actorUsuarioId: usuario.id,
        negocioId: codigo.negocioId, usuarioId: usuario.id, licenciaId: licencia.id,
        accion: 'recepcionista_activado', valoresAntes: { activadoEn: null },
        valoresDespues: { activadoEn: datos.ahora.toISOString() },
      });
    });
  }

  private async prepararCredenciales(datos: ActivarCuenta) {
    const nombre = datos.nombre.trim();
    if (!nombre) throw new BadRequestException('El nombre es obligatorio.');
    return { nombre, passwordHash: await this.contrasenas.generarHash(datos.password) };
  }
}
