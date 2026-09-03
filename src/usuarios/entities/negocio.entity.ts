import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

export enum EstadoNegocio {
    ACTIVO = 'activo',
    SUSPENDIDO = 'suspendido',
}

@Entity({ name: 'negocios' })
export class Negocio {
    @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
    id: number;

    @Column({ length: 150 })
    nombre: string;

    @Column({ length: 100, unique: true })
    slug: string;

    @Column({ name: 'email_contacto', length: 150 })
    emailContacto: string;

    @Column({ name: 'telefono_contacto', length: 20, nullable: true })
    telefonoContacto: string;

    @Column({
        type: 'enum',
        enum: EstadoNegocio,
        default: EstadoNegocio.ACTIVO,
    })
    estado: EstadoNegocio;

    @CreateDateColumn({ name: 'creado_en' })
    creadoEn: Date;
}