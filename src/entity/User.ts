import {Entity, PrimaryGeneratedColumn, Column, PrimaryColumn, OneToOne, JoinColumn} from "typeorm";
import { Profile } from '../entity/Profile'

@Entity()
export class User {

    @PrimaryGeneratedColumn('increment')
    id: number;

    @Column({ nullable: true })
    username: string;

    @Column({ unique: true, length: 190, nullable: true })
    email: string;

    @Column({ length: 60 })
    password_hash: string;

    @Column({ nullable: true })
    auth_key: string

    @Column({ nullable: true })
    confirmed_at: number

    @Column({ nullable: true })
    unconfirmed_email: string

    @Column({ nullable: true })
    blocked_at: number

    @Column({ length: 45, nullable: true })
    registration_ip: string

    @Column()
    created_at: number

    @Column({ nullable: true })
    updated_at: number

    @Column({ default: 0 })
    flags: number

    @Column({ nullable: true })
    last_login_at: number

    @OneToOne(type => Profile, profile=>profile.user_id, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
    @JoinColumn()
    profile: Profile;

}
