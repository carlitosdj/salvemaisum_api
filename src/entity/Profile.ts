import {Entity, PrimaryGeneratedColumn, Column, PrimaryColumn, OneToOne, JoinColumn, ManyToOne} from "typeorm";
import { User } from '../entity/User'
import { City } from "./City";
import { State } from "./State";
@Entity()
export class Profile {

    @PrimaryGeneratedColumn('increment')
    user_id: number;

    @Column({ nullable: true })
    name: string;

    @Column({ nullable: true })
    gravatar_id: string;

    @Column({ nullable: true })
    image: string;

    @ManyToOne(() => City, city => city.id, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
    @JoinColumn({ name: 'city' })
    cityParent: City;

    @ManyToOne(() => State, state => state.id, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
    @JoinColumn({ name: 'state' })
    stateParent: State;

    @Column({ nullable: true})
    country: string;

    @Column({ nullable: true })
    bloodtype: string;

    @Column({ nullable: true })
    candonate: string;

}