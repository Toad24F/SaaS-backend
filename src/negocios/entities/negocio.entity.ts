import { Check, Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** Identidad y contacto del tenant; los bloqueos comerciales pertenecen a Licencia. */
@Entity({ name: 'negocios' })
@Check('chk_negocios_activacion', 'activado_en IS NULL OR activado_en >= creado_en')
export class Negocio {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id: number;

  @Column({ length: 150 })
  nombre: string;

  @Column({ length: 100, unique: true })
  slug: string;

  @Column({ name: 'email_contacto', length: 150 })
  emailContacto: string;

  @Column({
    name: 'telefono_contacto',
    type: 'varchar',
    length: 20,
    nullable: true,
  })
  telefonoContacto: string | null;

  // Permanece nulo hasta que el primer administrador completa su activación.
  @Column({ name: 'activado_en', type: 'datetime', precision: 6, nullable: true })
  activadoEn: Date | null;

  @CreateDateColumn({ name: 'creado_en', type: 'datetime', precision: 6 })
  creadoEn: Date;
}
