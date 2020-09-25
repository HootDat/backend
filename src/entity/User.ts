import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { Pack } from "./Pack";

export type UserAuthMethod = "facebook";

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id?: number;

  @Column()
  name?: string;

  @Column({ select: false })
  authMethod?: UserAuthMethod;

  @OneToMany(() => Pack, (pack) => pack.owner)
  packs?: Pack[];

  @Column()
  @CreateDateColumn()
  createdAt?: Date;

  @Column()
  @UpdateDateColumn()
  updatedAt?: Date;
}
