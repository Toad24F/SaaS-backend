import { Check, Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** Identidad y contacto del tenant; los bloqueos comerciales pertenecen a Licencia. */
@Entity({ name: 'negocios' })
@Check('chk_negocios_activacion', 'activado_en IS NULL OR activado_en >= creado_en')
@Check('chk_negocios_cupo', 'limite_sucursales_activas >= 1')
@Check('chk_negocios_rfc', 'rfc IS NULL OR CHAR_LENGTH(TRIM(rfc)) > 0')
@Check('chk_negocios_correo_administrador',
  'correo_administrador IS NULL OR (BINARY correo_administrador = BINARY LOWER(TRIM(correo_administrador)) AND CHAR_LENGTH(correo_administrador) > 0)')
export class Negocio {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id: number;

  @Column({ length: 150 })
  nombre: string;

  @Column({ length: 100, unique: true })
  slug: string;

  @Column({ name: 'email_contacto', length: 150 })
  emailContacto: string;

  // Anulables para datos históricos; el servicio de altas nuevas exige estos datos.
  @Column({ name: 'rfc', type: 'varchar', length: 13, nullable: true, unique: false })
  rfc: string | null;

  @Column({ name: 'correo_administrador', type: 'varchar', length: 150, nullable: true,
    transformer: {
      to: (correo: string | null) => correo?.trim().toLowerCase() ?? null,
      from: (correo: string | null) => correo,
    },
  })
  correoAdministrador: string | null;

  @Column({ name: 'limite_sucursales_activas', type: 'int', unsigned: true, default: 1 })
  limiteSucursalesActivas: number;

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
