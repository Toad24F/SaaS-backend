import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { Negocio } from '../../negocios/entities/negocio.entity';
import { RecursoPortal } from './recurso-portal.entity';

/** Configuración publicada. Sin fila, el negocio conserva la marca inicial y la versión 0. */
@Entity({ name: 'personalizacion_portal' })
@Index('idx_personalizacion_portal_logo', ['negocioId', 'logoId'])
@Check('chk_personalizacion_portal_version', 'version >= 1')
@Check('chk_personalizacion_portal_colores', "fondo REGEXP '^#[0-9A-Fa-f]{6}$' AND texto REGEXP '^#[0-9A-Fa-f]{6}$' AND acento REGEXP '^#[0-9A-Fa-f]{6}$'")
export class PersonalizacionPortal {
  @PrimaryColumn({ name: 'negocio_id', type: 'int', unsigned: true })
  negocioId: number;

  @ManyToOne(() => Negocio, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'negocio_id', referencedColumnName: 'id', foreignKeyConstraintName: 'fk_personalizacion_portal_negocio' })
  negocio: Negocio;

  @Column({ type: 'int', unsigned: true })
  version: number;

  @Column({ type: 'char', length: 7, charset: 'ascii', collation: 'ascii_bin' })
  fondo: string;

  @Column({ type: 'char', length: 7, charset: 'ascii', collation: 'ascii_bin' })
  texto: string;

  @Column({ type: 'char', length: 7, charset: 'ascii', collation: 'ascii_bin' })
  acento: string;

  @Column({ name: 'logo_id', type: 'char', length: 36, charset: 'ascii', collation: 'ascii_bin', nullable: true })
  logoId: string | null;

  // La publicación del logo se representa solo con esta referencia. La FK
  // compuesta impide que la configuración apunte a un logo de otro negocio.
  @ManyToOne(() => RecursoPortal, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn([
    { name: 'negocio_id', referencedColumnName: 'negocioId', foreignKeyConstraintName: 'fk_personalizacion_portal_logo' },
    { name: 'logo_id', referencedColumnName: 'id' },
  ])
  logo: RecursoPortal | null;

  @CreateDateColumn({ name: 'creado_en', type: 'datetime', precision: 6 })
  creadoEn: Date;

  @UpdateDateColumn({ name: 'actualizado_en', type: 'datetime', precision: 6 })
  actualizadoEn: Date;
}
