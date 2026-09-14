import {Entity, PrimaryGeneratedColumn, Column, PrimaryColumn, ManyToOne, JoinColumn, OneToMany, OneToOne, Timestamp} from "typeorm";
import { City } from "./City";

@Entity()
export class State {

    @PrimaryGeneratedColumn('increment')
    id: number;

    @Column({ nullable: true })
    name: string

    @Column({ nullable: true })
    state: string;

    @Column({ nullable: true })
    country: number;

    @OneToMany(() => City, city => city.id)
    cities: City[];

}
