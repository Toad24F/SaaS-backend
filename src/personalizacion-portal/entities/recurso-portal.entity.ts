import { Check, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Negocio } from '../../negocios/entities/negocio.entity';

export type MimeRecursoPortal = 'image/png' | 'image/jpeg' | 'image/webp';

/** El recurso es provisional hasta que la configuración publicada lo referencia. */
@Entity({ name: 'recursos_portal' })
@Index('idx_recursos_portal_expiracion', ['negocioId', 'expiraEn'])
@Check('chk_recursos_portal_mime', "mime IN ('image/png', 'image/jpeg', 'image/webp')")
@Check('chk_recursos_portal_dimensiones', 'ancho BETWEEN 1 AND 2048 AND alto BETWEEN 1 AND 2048')
@Check('chk_recursos_portal_tamano', 'OCTET_LENGTH(contenido) BETWEEN 1 AND 2097152')
@Check('chk_recursos_portal_expiracion', 'expira_en > creado_en')
export class RecursoPortal {
  // La clave compuesta obliga a incluir el negocio al resolver un UUID.
  @PrimaryColumn({ name: 'negocio_id', type: 'int', unsigned: true })
  negocioId: number;

  @PrimaryColumn({ type: 'char', length: 36, charset: 'ascii', collation: 'ascii_bin' })
  id: string;

  @ManyToOne(() => Negocio, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'negocio_id', referencedColumnName: 'id', foreignKeyConstraintName: 'fk_recursos_portal_negocio' })
  negocio: Negocio;

  @Column({ type: 'mediumblob' })
  contenido: Buffer;

  @Column({ type: 'varchar', length: 10, charset: 'ascii', collation: 'ascii_bin' })
  mime: MimeRecursoPortal;

  @Column({ type: 'smallint', unsigned: true })
  ancho: number;

  @Column({ type: 'smallint', unsigned: true })
  alto: number;

  @Column({ name: 'creado_en', type: 'datetime', precision: 6 })
  creadoEn: Date;

  @Column({ name: 'expira_en', type: 'datetime', precision: 6 })
  expiraEn: Date;
}
