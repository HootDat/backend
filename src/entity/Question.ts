import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { Pack } from "./Pack";

@Entity()
export class Question {
  @PrimaryGeneratedColumn()
  id?: number;

  @Column()
  title?: string;

  @ManyToOne(() => Pack, (pack) => pack.questions, { onDelete: "CASCADE" })
  pack?: Pack;
}
