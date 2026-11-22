import { Check, Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type TipoEventoWhatsapp = 'enviado' | 'entregado' | 'leido' | 'respuesta' | 'fallo';
export type EstadoEventoWhatsapp = 'pendiente' | 'en_proceso' | 'procesado' | 'fallido';

/** Recibo mínimo: horas separadas y hashes, sin cuerpo ni payload utilizable. */
@Entity({ name: 'eventos_whatsapp' })
@Index('uq_evw_huella', ['negocioId', 'huellaEvento'], { unique: true })
@Index('idx_evw_trabajo', ['estadoProcesamiento', 'recibidoEn'])
@Index('idx_evw_mensaje', ['negocioId', 'mensajeExternoId'])
@Check('chk_evw_huella', "huella_evento REGEXP '^[0-9a-f]{64}$'")
@Check('chk_evw_remitente', "remitente_hash IS NULL OR remitente_hash REGEXP '^[0-9a-f]{64}$'")
@Check('chk_evw_accion', "accion_hash IS NULL OR accion_hash REGEXP '^[0-9a-f]{64}$'")
@Check('chk_evw_procesado', "estado_procesamiento='procesado' AND procesado_en IS NOT NULL OR estado_procesamiento<>'procesado' AND procesado_en IS NULL")
export class EventoWhatsapp {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true }) id: string;
  @Column({ name: 'negocio_id', type: 'int', unsigned: true }) negocioId: number;
  @Column({ name: 'huella_evento', type: 'char', length: 64, charset: 'ascii', collation: 'ascii_bin' }) huellaEvento: string;
  @Column({ name: 'evento_externo_id', type: 'varchar', length: 128, nullable: true }) eventoExternoId: string | null;
  @Column({ name: 'mensaje_externo_id', type: 'varchar', length: 128, nullable: true }) mensajeExternoId: string | null;
  @Column({ type: 'enum', enum: ['enviado', 'entregado', 'leido', 'respuesta', 'fallo'] }) tipo: TipoEventoWhatsapp;
  @Column({ name: 'recibido_en', type: 'datetime', precision: 6, default: () => 'CURRENT_TIMESTAMP(6)' }) recibidoEn: Date;
  @Column({ name: 'proveedor_en', type: 'datetime', precision: 6, nullable: true }) proveedorEn: Date | null;
  @Column({ name: 'remitente_hash', type: 'char', length: 64, charset: 'ascii', collation: 'ascii_bin', nullable: true }) remitenteHash: string | null;
  @Column({ name: 'accion_hash', type: 'char', length: 64, charset: 'ascii', collation: 'ascii_bin', nullable: true }) accionHash: string | null;
  @Column({ name: 'estado_procesamiento', type: 'enum', enum: ['pendiente', 'en_proceso', 'procesado', 'fallido'], default: 'pendiente' }) estadoProcesamiento: EstadoEventoWhatsapp;
  @Column({ name: 'procesado_en', type: 'datetime', precision: 6, nullable: true }) procesadoEn: Date | null;
  @Column({ name: 'ultimo_error', type: 'varchar', length: 255, nullable: true }) ultimoError: string | null;
}
