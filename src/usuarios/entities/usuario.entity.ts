import {
    Column,
    Check,
    CreateDateColumn,
    Entity,
    JoinColumn,
    Index,
    ManyToOne,
    PrimaryGeneratedColumn,
} from 'typeorm';
import { Negocio } from '../../negocios/entities/negocio.entity';
import { Rol } from '../../auth/enums/rol.enum';

// La misma transformación se aplica a cuentas activas y pendientes para reservar
// globalmente una única representación de cada correo.
const normalizadorCorreo = {
    to: (email: string): string => email.trim().toLowerCase(),
    from: (email: string): string => email,
};

@Entity({ name: 'usuarios' })
@Index('uq_usuarios_negocio_id', ['negocioId', 'id'], { unique: true })
@Check('chk_usuarios_rol_negocio', "(rol = 'superadmin' AND negocio_id IS NULL) OR (rol IN ('admin_negocio','recepcionista') AND negocio_id IS NOT NULL)")
@Check('chk_usuarios_email_normalizado', 'BINARY email = BINARY LOWER(TRIM(email)) AND CHAR_LENGTH(email) > 0')
@Check('chk_usuarios_activo', 'activo IN (0, 1)')
@Check('chk_usuarios_activacion', "(activado_en IS NULL AND nombre IS NULL AND password_hash IS NULL) OR (activado_en IS NOT NULL AND nombre IS NOT NULL AND CHAR_LENGTH(TRIM(nombre)) > 0 AND password_hash IS NOT NULL AND CHAR_LENGTH(password_hash) > 0 AND activado_en >= creado_en)")
export class Usuario {
    @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
    id: number;

    @Column({ name: 'negocio_id', type: 'int', unsigned: true, nullable: true })
    negocioId: number | null;

    @ManyToOne(() => Negocio, { onDelete: 'CASCADE', nullable: true })
    @JoinColumn({ name: 'negocio_id' })
    negocio: Negocio | null;

    @Column({ type: 'varchar', length: 150, nullable: true })
    nombre: string | null;

    @Column({ length: 150, unique: true, transformer: normalizadorCorreo })
    email: string;

    @Column({ name: 'password_hash', type: 'varchar', length: 255, nullable: true })
    passwordHash: string | null;

    @Column({
        type: 'enum',
        enum: Rol,
    })
    rol: Rol;

    @Column({ default: true })
    activo: boolean;

    // Una cuenta pendiente conserva activo=true, pero no está activada todavía.
    @Column({ name: 'activado_en', type: 'datetime', precision: 6, nullable: true })
    activadoEn: Date | null;

    // Columna técnica: hace que MariaDB permita como máximo un admin por tenant.
    @Column({
        name: 'admin_negocio_unico',
        type: 'int',
        unsigned: true,
        nullable: true,
        asExpression: "CASE WHEN rol = 'admin_negocio' THEN negocio_id ELSE NULL END",
        generatedType: 'STORED',
        unique: true,
        select: false,
    })
    adminNegocioUnico: number | null;

    @CreateDateColumn({ name: 'creado_en', type: 'datetime', precision: 6 })
    creadoEn: Date;
}
