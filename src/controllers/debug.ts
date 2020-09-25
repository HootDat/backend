import { Request, Response } from "express";
import { getConnection, getManager } from "typeorm";
import { Category } from "../entity/Category";
import { FacebookAuthStrategy } from "../entity/FacebookAuthStrategy";
import { Pack } from "../entity/Pack";
import { Question } from "../entity/Question";
import { User } from "../entity/User";

export const seed = async (_: Request, res: Response) => {
  const manager = getManager();

  const user = new User();
  user.name = "John Doe";
  user.authMethod = "facebook";
  await manager.save(user);

  const authStrategy = new FacebookAuthStrategy();
  authStrategy.facebookID = "123";
  authStrategy.user = user;
  await manager.save(authStrategy);

  const pack1 = new Pack();
  pack1.name = "John Doe's Pack1";
  pack1.public = false;
  pack1.owner = user;
  pack1.categories = ["c1", "c2", "c3"].map((c) => {
    const category = new Category();
    category.name = c;
    return category;
  });
  await manager.save(pack1.categories);
  await manager.save(pack1);

  pack1.questions = ["q1", "q2", "q3"].map((q) => {
    const question = new Question();
    question.title = q;
    question.pack = pack1;
    return question;
  });
  await manager.save(pack1.questions);

  const pack2 = new Pack();
  pack2.name = "John Doe's Pack2";
  pack2.public = true;
  pack2.owner = user;
  pack2.categories = ["c4", "c5", "c6"].map((c) => {
    const category = new Category();
    category.name = c;
    return category;
  });
  await manager.save(pack2.categories);
  await manager.save(pack2);

  pack2.questions = ["q4", "q5", "q6"].map((q) => {
    const question = new Question();
    question.title = q;
    question.pack = pack2;
    return question;
  });
  await manager.save(pack2.questions);

  res.sendStatus(200);
};

export const nukeDatabase = async (req: Request, res: Response) => {
  const connection = getConnection();
  await connection.dropDatabase();
  await connection.synchronize();
  return res.status(200).send("Database nuked");
};
