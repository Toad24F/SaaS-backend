import {
  Column,
  Check,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Usuario } from '../../usuarios/entities/usuario.entity';
import { AltaAdministrador } from '../../altas/entities/alta-administrador.entity';

export enum PropositoCodigoAcceso {
  // La recepción se crea completa y nunca recibe un código de activación.
  ACTIVACION_ADMIN = 'activacion_admin',
  RECUPERACION = 'recuperacion',
}

/** Historial del código: solo persiste su hash, nunca el valor entregable. */
@Entity({ name: 'codigos_acceso' })
@Index('uq_codigos_cuenta_proposito', ['usuarioId', 'proposito', 'vigenteUnico'], {
  unique: true,
})
@Index('uq_codigos_alta_proposito', ['altaAdministradorId', 'proposito', 'vigenteUnico'], { unique: true })
@Index('uq_codigos_emision', ['emisionId'], { unique: true })
// La bandeja comprueba que el código referido pertenece al mismo negocio.
@Index('uq_codigos_negocio_id', ['negocioId', 'id'], { unique: true })
@Index('idx_codigos_destinatario', ['negocioId', 'usuarioId'])
@Index('idx_codigos_alta', ['negocioId', 'altaAdministradorId'])
@Index('idx_codigos_expiracion', ['expiraEn'])
@Check('chk_codigos_hash', "CHAR_LENGTH(codigo_hash) = 64 AND codigo_hash NOT REGEXP '[^0-9a-f]'")
@Check('chk_codigos_expiracion', 'expira_en > emitido_en')
@Check('chk_codigos_consumo', 'consumido_en IS NULL OR (consumido_en >= emitido_en AND consumido_en < expira_en)')
@Check('chk_codigos_invalidacion', 'invalidado_en IS NULL OR invalidado_en >= emitido_en')
@Check('chk_codigos_estado', 'consumido_en IS NULL OR invalidado_en IS NULL')
@Check('chk_codigos_destino', "(proposito = 'activacion_admin' AND alta_administrador_id IS NOT NULL AND usuario_id IS NULL AND legado_fase_1 = 0) OR (proposito = 'recuperacion' AND usuario_id IS NOT NULL AND alta_administrador_id IS NULL) OR (proposito = 'activacion_admin' AND usuario_id IS NOT NULL AND alta_administrador_id IS NULL AND legado_fase_1 = 1)")
@Check('chk_codigos_derivacion', '(legado_fase_1 = 1 AND emision_id IS NULL AND nonce IS NULL AND clave_version IS NULL AND correo_destinatario IS NULL) OR (legado_fase_1 = 0 AND emision_id IS NOT NULL AND nonce IS NOT NULL AND clave_version IS NOT NULL AND correo_destinatario IS NOT NULL)')
@Check('chk_codigos_version', 'destinatario_version >= 1 AND (clave_version IS NULL OR clave_version >= 1)')
@Check('chk_codigos_correo', 'correo_destinatario IS NULL OR (BINARY correo_destinatario = BINARY LOWER(TRIM(correo_destinatario)) AND CHAR_LENGTH(correo_destinatario) > 0)')
export class CodigoAcceso {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: string;

  @Column({ name: 'negocio_id', type: 'int', unsigned: true })
  negocioId: number;

  @Column({ name: 'usuario_id', type: 'int', unsigned: true, nullable: true })
  usuarioId: number | null;

  @ManyToOne(() => Usuario, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn([
    { name: 'negocio_id', referencedColumnName: 'negocioId' },
    { name: 'usuario_id', referencedColumnName: 'id' },
  ])
  usuario: Usuario | null;

  // Activación nueva: invitación del mismo negocio, nunca cuenta pendiente.
  @Column({ name: 'alta_administrador_id', type: 'int', unsigned: true, nullable: true })
  altaAdministradorId: number | null;

  @ManyToOne(() => AltaAdministrador, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn([
    { name: 'negocio_id', referencedColumnName: 'negocioId' },
    { name: 'alta_administrador_id', referencedColumnName: 'id' },
  ])
  altaAdministrador: AltaAdministrador | null;

  @Column({ name: 'destinatario_version', type: 'int', unsigned: true, default: 1 })
  destinatarioVersion: number;

  // Metadatos públicos de derivación; la clave y el código nunca se persisten.
  @Column({ name: 'emision_id', type: 'char', length: 36, nullable: true })
  emisionId: string | null;

  @Column({ type: 'char', length: 32, nullable: true })
  nonce: string | null;

  @Column({ name: 'clave_version', type: 'int', unsigned: true, nullable: true })
  claveVersion: number | null;

  @Column({ name: 'correo_destinatario', type: 'varchar', length: 150, nullable: true })
  correoDestinatario: string | null;

  // Compatibilidad temporal hasta sustituir el alta HTTP de fase 1 en T035.
  @Column({ name: 'legado_fase_1', type: 'boolean', default: false })
  legadoFase1: boolean;

  @Column({ name: 'emisor_usuario_id', type: 'int', unsigned: true })
  emisorUsuarioId: number;

  @ManyToOne(() => Usuario, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'emisor_usuario_id' })
  emisor: Usuario;

  @Column({ type: 'enum', enum: PropositoCodigoAcceso })
  proposito: PropositoCodigoAcceso;

  @Column({
    name: 'codigo_hash',
    type: 'char',
    length: 64,
    unique: true,
    select: false,
  })
  codigoHash: string;

  @CreateDateColumn({ name: 'emitido_en', type: 'datetime', precision: 6 })
  emitidoEn: Date;

  @Column({ name: 'expira_en', type: 'datetime', precision: 6 })
  expiraEn: Date;

  @Column({ name: 'consumido_en', type: 'datetime', precision: 6, nullable: true })
  consumidoEn: Date | null;

  @Column({ name: 'invalidado_en', type: 'datetime', precision: 6, nullable: true })
  invalidadoEn: Date | null;

  // Restringe a un código vigente por cuenta y propósito sin borrar historial.
  @Column({
    name: 'vigente_unico',
    type: 'tinyint',
    nullable: true,
    asExpression:
      'CASE WHEN consumido_en IS NULL AND invalidado_en IS NULL THEN 1 ELSE NULL END',
    generatedType: 'STORED',
    select: false,
  })
  vigenteUnico: number | null;
}
