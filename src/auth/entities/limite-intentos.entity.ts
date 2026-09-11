import { Check, Column, Entity, Index, PrimaryColumn } from 'typeorm';

/** Una fila por IP comparte intentos de login y validación de todos los códigos. */
@Entity({ name: 'limites_intentos' })
@Index('idx_limites_ventana', ['ventanaInicio'])
@Index('idx_limites_bloqueo', ['bloqueadoHasta'])
@Check('chk_limites_origen', 'CHAR_LENGTH(TRIM(origen)) > 0')
@Check('chk_limites_bloqueo', 'bloqueado_hasta IS NULL OR bloqueado_hasta >= ventana_inicio')
export class LimiteIntentos {
  // 45 caracteres admiten las representaciones textuales canónicas IPv4 e IPv6.
  @PrimaryColumn({ type: 'varchar', length: 45 })
  origen: string;

  @Column({ name: 'ventana_inicio', type: 'datetime', precision: 6 })
  ventanaInicio: Date;

  @Column({ type: 'int', unsigned: true, default: 0 })
  intentos: number;

  @Column({ name: 'bloqueado_hasta', type: 'datetime', precision: 6, nullable: true })
  bloqueadoHasta: Date | null;
}
