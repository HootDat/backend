import {
  BaseEntity,
  Column,
  Entity,
  ManyToMany,
  PrimaryGeneratedColumn,
} from "typeorm";
import { Pack } from "./Pack";

@Entity()
export class Category extends BaseEntity {
  @PrimaryGeneratedColumn()
  id?: number;

  @Column()
  name?: string;

  @ManyToMany(() => Pack, (pack) => pack.categories)
  packs?: Pack[];
}
