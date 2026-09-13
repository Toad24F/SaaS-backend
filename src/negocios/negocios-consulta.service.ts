import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Negocio } from './entities/negocio.entity';
import { Licencia } from '../licencias/entities/licencia.entity';
import { Usuario } from '../usuarios/entities/usuario.entity';
import { Rol } from '../auth/enums/rol.enum';

type NegocioConsultado = Negocio & {
  licencia?: Pick<Licencia, 'id' | 'habilitadaEn' | 'venceEn' | 'suspendidaEn'> | null;
  administrador?: Pick<Usuario, 'id' | 'email' | 'activo' | 'activadoEn'> | null;
};

/** Lecturas administrativas globales; la capa HTTP exige sesión de superadmin. */
@Injectable()
export class NegociosConsultaService {
  constructor(@InjectRepository(Negocio) private readonly negocios: Repository<Negocio>) {}

  async listar() {
    const negocios = await this.consulta().orderBy('negocio.id', 'ASC').getMany();
    return negocios.map((negocio) => this.presentar(negocio));
  }

  async consultar(id: number) {
    const negocio = await this.consulta().where('negocio.id = :id', { id }).getOne();
    if (!negocio) throw new NotFoundException('Negocio no encontrado.');
    return this.presentar(negocio);
  }

  private consulta() {
    // Una consulta incluye relaciones del mismo negocio, sin filtrar licencias
    // bloqueadas. La selección SQL excluye hashes y nunca une códigos o sesiones.
    return this.negocios.createQueryBuilder('negocio')
      .leftJoinAndMapOne('negocio.licencia', Licencia, 'licencia', 'licencia.negocioId = negocio.id')
      .leftJoinAndMapOne('negocio.administrador', Usuario, 'administrador',
        'administrador.negocioId = negocio.id AND administrador.rol = :rolAdministrador',
        { rolAdministrador: Rol.ADMIN_NEGOCIO })
      .select([
        'negocio.id', 'negocio.nombre', 'negocio.slug', 'negocio.emailContacto',
        'negocio.telefonoContacto', 'negocio.activadoEn', 'negocio.creadoEn',
        'licencia.id', 'licencia.habilitadaEn', 'licencia.venceEn', 'licencia.suspendidaEn',
        'administrador.id', 'administrador.email', 'administrador.activo', 'administrador.activadoEn',
      ]);
  }

  private presentar(negocio: NegocioConsultado) {
    // Proyecta el contrato público de forma explícita: agregar columnas a las
    // entidades en el futuro no las incorpora automáticamente a las respuestas.
    const { licencia, administrador } = negocio;
    return {
      id: negocio.id, nombre: negocio.nombre, identificadorPublico: negocio.slug,
      emailContacto: negocio.emailContacto, telefonoContacto: negocio.telefonoContacto,
      activadoEn: negocio.activadoEn, creadoEn: negocio.creadoEn,
      licencia: licencia ? { id: licencia.id, habilitadaEn: licencia.habilitadaEn,
        venceEn: licencia.venceEn, suspendidaEn: licencia.suspendidaEn } : null,
      administrador: administrador ? { id: administrador.id, email: administrador.email,
        activo: administrador.activo, activadoEn: administrador.activadoEn } : null,
    };
  }
}
