import {
  BaseEntity,
  Column,
  CreateDateColumn,
  Entity,
  JoinTable,
  ManyToMany,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { Category } from "./Category";
import { Question } from "./Question";
import { User } from "./User";

@Entity()
export class Pack extends BaseEntity {
  @PrimaryGeneratedColumn()
  id?: number;

  @Column()
  name?: string;

  @Column()
  public?: boolean;

  @ManyToOne(() => User, (creator) => creator.packs)
  creator?: User;

  @OneToMany(() => Question, (question) => question.pack, {
    eager: true,
  })
  questions?: Question[];

  @ManyToMany(() => Category, (category) => category.packs, { eager: true })
  @JoinTable()
  categories?: Category[];

  @Column()
  @CreateDateColumn()
  createdAt?: Date;

  @Column()
  @UpdateDateColumn()
  updatedAt?: Date;
}
