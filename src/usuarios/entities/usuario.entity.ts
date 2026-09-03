import {
    Column,
    CreateDateColumn,
    Entity,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
} from 'typeorm';
import { Negocio } from './negocio.entity';

export enum RolUsuario {
    SUPERADMIN = 'superadmin',
    ADMIN_NEGOCIO = 'admin_negocio',
    RECEPCIONISTA = 'recepcionista',
}

@Entity({ name: 'usuarios' })
export class Usuario {
    @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
    id: number;

    @Column({ name: 'negocio_id', type: 'int', unsigned: true, nullable: true })
    negocioId: number | null;

    @ManyToOne(() => Negocio, { onDelete: 'CASCADE', nullable: true })
    @JoinColumn({ name: 'negocio_id' })
    negocio: Negocio | null;

    @Column({ length: 150 })
    nombre: string;

    @Column({ length: 150, unique: true })
    email: string;

    @Column({ name: 'password_hash', length: 255 })
    passwordHash: string;

    @Column({
        type: 'enum',
        enum: RolUsuario,
    })
    rol: RolUsuario;

    @Column({ default: true })
    activo: boolean;

    @CreateDateColumn({ name: 'creado_en' })
    creadoEn: Date;
}