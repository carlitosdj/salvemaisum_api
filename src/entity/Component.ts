import {Entity, PrimaryGeneratedColumn, Column, PrimaryColumn, ManyToOne, JoinColumn, OneToMany, OneToOne, Timestamp} from "typeorm";
import { ComponentExtra } from './ComponentExtra'

@Entity()
export class Component {

    @PrimaryGeneratedColumn('increment')
    id: number;

    @ManyToOne(() => Component, component => component.id, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
    @JoinColumn({ name: 'component_id' })
    parent: Component;

    @Column({ nullable: true })
    name: string;

    @Column({ type:'text', nullable: true })
    description: string;

    @Column({ type: 'double', nullable: true })
    created_at: number

    @Column({ nullable: true })
    status: number

    @Column({ nullable: true })
    order: number

    @Column({ nullable: true })
    duration: number

    @OneToMany(() => Component, component => component.parent)
    children: Component[];

    @OneToMany(() => ComponentExtra, extra => extra.parent)
    extras: ComponentExtra[];

    @Column({ nullable: true })
    tags: string;

}
