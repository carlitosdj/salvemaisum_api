import {Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn} from "typeorm";
import { Profile } from './Profile'

@Entity()
export class Contact {

    @PrimaryGeneratedColumn('increment')
    id: number;

    @Column({ type: 'double', nullable: true })
    created_at: number;

    @Column({ nullable: true })
    name: string;

    @Column({ nullable: true })
    email: string;

    @Column({ nullable: true })
    subject: string;

    @Column({ nullable: true, type: 'text' })
    message: string;

}