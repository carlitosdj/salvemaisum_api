import {Entity, PrimaryGeneratedColumn, Column, PrimaryColumn, ManyToOne, JoinColumn} from "typeorm";
import { Component } from './Component'
@Entity()
export class ComponentExtra {

    @PrimaryGeneratedColumn('increment')
    id: number;

    @ManyToOne(() => Component, component => component.id, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
    @JoinColumn({ name: 'component_id' })
    parent: Component;

    @Column({ length: 100, nullable: true })
    key_extra: string;

    @Column({ type: 'text', nullable: true })
    value_extra: string;

    @Column({ type: 'double', nullable: true })
    created_at: number

    @Column({ nullable: true })
    status: number


}
