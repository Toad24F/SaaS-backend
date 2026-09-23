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

/** Solo el primer administrador se activa por código y habilita la licencia. */
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
    await this.codigos.consumir(this.usuarios.manager.connection, {//consume el codigo de activacion y ejecuta la operacion de activacion de administrador
      codigo: datos.codigo,
      proposito: PropositoCodigoAcceso.ACTIVACION_ADMIN,
      ahora: datos.ahora,
    }, async (manager, codigo) => {
      const usuario = await manager.getRepository(Usuario).findOneByOrFail({ id: codigo.usuarioId });//busca el usuario con el id de usuario si no lo encuentra lanza un error
      const licencia = await manager.getRepository(Licencia).createQueryBuilder('licencia')//consulta la licencia del negocio con el id de negocio del codigo, si no lo encuentra lanza un error
        .setLock('pessimistic_write')//bloquea el registro de licencia para que no se pueda modificar mientras se consume el codigo
        .where('licencia.negocioId = :negocioId', { negocioId: codigo.negocioId })
        .getOneOrFail();
      if (
        usuario.rol !== Rol.ADMIN_NEGOCIO ||//verifica que el rol del usuario sea admin_negocio
        usuario.activadoEn !== null ||//verifica que el usuario no este activado
        !this.politicaLicencia.puedeActivarAdministrador(licencia, datos.ahora)//verifica que la licencia pueda activar un administrador|
      ) {
        throw new BadRequestException('La cuenta no puede activarse.');
      }

      const venceEn = this.calendario.sumarAnios(datos.ahora);//calcula la fecha de vencimiento de la licencia sumando un año a la fecha actual
      // Cuenta, negocio y primer año cambian juntos o se revierten juntos.
      await manager.getRepository(Usuario).update(usuario.id, {//actualiza el usuario con el nombre, hash de la contraseña y la fecha de activacion
        nombre, passwordHash, activadoEn: new Date(datos.ahora),
      });
      await manager.getRepository(Negocio).update(codigo.negocioId, {//actualiza el negocio con la fecha de activacion
        activadoEn: new Date(datos.ahora),
      });
      await manager.getRepository(Licencia).update(licencia.id, {//actualiza la licencia con la fecha de habilitacion y la fecha de vencimiento
        habilitadaEn: new Date(datos.ahora), venceEn,
      });
      await this.auditoria.registrar(manager, {//registra la auditoria de la activacion del administrador
        operacionId: randomUUID(), actorUsuarioId: usuario.id,
        negocioId: codigo.negocioId, usuarioId: usuario.id, licenciaId: licencia.id,
        accion: 'administrador_activado', valoresAntes: { activadoEn: null },
        valoresDespues: { activadoEn: datos.ahora.toISOString(), venceEn: venceEn.toISOString() },
      });
    });
  }

  private async prepararCredenciales(datos: ActivarCuenta) {
    const nombre = datos.nombre.trim();
    if (!nombre) throw new BadRequestException('El nombre es obligatorio.');
    return { nombre, passwordHash: await this.contrasenas.generarHash(datos.password) };
  }
}
