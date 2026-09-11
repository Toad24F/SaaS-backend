import {
    Column,
    CreateDateColumn,
    Entity,
    JoinColumn,
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
    @Column({ name: 'activado_en', type: 'datetime', nullable: true })
    activadoEn: Date | null;

    @CreateDateColumn({ name: 'creado_en' })
    creadoEn: Date;
}
