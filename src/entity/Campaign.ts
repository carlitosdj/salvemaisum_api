import {Entity, PrimaryGeneratedColumn, Column, PrimaryColumn, ManyToOne, JoinColumn, OneToMany, OneToOne, Timestamp} from "typeorm";
import { Bloodcenter } from "./Bloodcenter";
import { City } from "./City";
import { Profile } from "./Profile";
import { State } from "./State";

@Entity()
export class Campaign {

    @PrimaryGeneratedColumn('increment')
    id: number;

    @Column({ type: 'double', nullable: true })
    created_at: number

    @ManyToOne(() => Profile, profile => profile.user_id, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
    @JoinColumn({ name: 'user_id' })
    parentUser: Profile;

    @Column({ nullable: true })
    name: string;

    @Column({ nullable: true })
    bloodtype: string;

    @Column({ nullable: true })
    image: string;

    @Column({ nullable: true })
    status: number

    @Column({ nullable: true })
    bcname: string

    @Column({ nullable: true })
    bcaddress: string

    @ManyToOne(() => City, city => city.id, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
    @JoinColumn({ name: 'bccity' })
    cityParent: City;

    @ManyToOne(() => State, state => state.id, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
    @JoinColumn({ name: 'bcstate' })
    stateParent: State;

    @Column({ nullable: true })
    bccountry: string
    
    @Column({ nullable: true })
    tags: string;

    @Column({ nullable: true, type: 'text' })
    description: string;

    @ManyToOne(() => Bloodcenter, bc => bc.id, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
    @JoinColumn({ name: 'bc' })
    bcParent: Bloodcenter;

}
