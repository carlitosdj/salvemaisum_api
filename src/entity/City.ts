import {Entity, PrimaryGeneratedColumn, Column, PrimaryColumn, ManyToOne, JoinColumn, OneToMany, OneToOne, Timestamp} from "typeorm";
import { Profile } from "./Profile";
import { State } from "./State";

@Entity()
export class City {

    @PrimaryGeneratedColumn('increment')
    id: number;

    @Column({ nullable: true })
    name: string

    @ManyToOne(() => State, state => state.id, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
    @JoinColumn({ name: 'state' })
    parentState: State;

}
