import {Entity, PrimaryGeneratedColumn, Column, PrimaryColumn, ManyToOne, JoinColumn, OneToMany, OneToOne, Timestamp} from "typeorm";
import { Campaign } from "./Campaign";
import { City } from "./City";
import { Profile } from "./Profile";
import { State } from "./State";

@Entity()
export class Bloodcenter {

    @PrimaryGeneratedColumn('increment')
    id: number;

    @Column({ nullable: true })
    name: string;

    @Column({ nullable: true })
    image: string;

    @Column({ nullable: true })
    address: string

    @ManyToOne(() => City, city => city.id, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
    @JoinColumn({ name: 'bccity' })
    cityParent: City;

    @ManyToOne(() => State, state => state.id, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
    @JoinColumn({ name: 'bcstate' })
    stateParent: State;

    @Column({ nullable: true })
    country: string

    @Column({ nullable: true })
    phone: string

    @Column({ nullable: true })
    region: string

    @Column({ nullable: true })
    email: string

    @Column({ nullable: true })
    description: string

    @Column({ nullable: true })
    status: number

    @OneToMany(() => Campaign, campaign => campaign.bcParent)
    campaigns: Campaign[];

    
}
