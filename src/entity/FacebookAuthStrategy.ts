import {
  Column,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { User } from "./User";

@Entity()
export class FacebookAuthStrategy {
  @PrimaryGeneratedColumn()
  id?: number;

  @Column()
  facebookID?: string;

  @OneToOne(() => User, { eager: true, onDelete: "CASCADE" })
  @JoinColumn()
  user?: User;
}
