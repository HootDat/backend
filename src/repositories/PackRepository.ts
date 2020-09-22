import { EntityRepository, getCustomRepository, Repository } from "typeorm";
import { Pack } from "../entity/Pack";
import { Question } from "../entity/Question";
import { CategoryRepository } from "./CategeryRepository";

@EntityRepository(Pack)
export class PackRepository extends Repository<Pack> {
  async findWithPagination(offset?: number, limit?: number): Promise<Pack[]> {
    let query = this.createQueryBuilder("pack")
      .innerJoinAndSelect("pack.categories", "category")
      .innerJoinAndSelect("pack.questions", "question")
      .orderBy("pack.id", "DESC");

    if (offset && offset > 0) {
      query = query.skip(offset);
    }
    if (limit && limit > 0) {
      query = query.take(limit);
    }
    return await query.getMany();
  }

  async findByCategories(
    categoryNames: string[],
    offset?: number,
    limit?: number
  ): Promise<Pack[]> {
    let query = this.createQueryBuilder("pack")
      .select("pack.id")
      .innerJoinAndSelect("pack.categories", "category")
      .where("category.name IN (:...categoryNames)", {
        categoryNames,
      })
      .orderBy("pack.id", "DESC");

    if (offset && offset > 0) {
      query = query.skip(offset);
    }
    if (limit && limit > 0) {
      query = query.take(limit);
    }
    const packIds = (await query.getMany()).map((pack) => pack.id);
    return await this.findByIds(packIds);
  }

  async createFromRequest(
    name?: string,
    categoryNames?: string[],
    questionTitles?: string[],
    isPublic?: boolean
  ): Promise<Pack | undefined> {
    // Create the categories first
    const categoryRepository = getCustomRepository(CategoryRepository);
    const categories = await categoryRepository.createOrGet(
      categoryNames || []
    );

    const pack = new Pack();
    pack.name = name;
    pack.public = isPublic;
    pack.categories = categories;
    const questions = questionTitles?.map((title) => {
      const question = new Question();
      question.title = title;
      question.pack = pack;
      return question;
    });

    return this.manager.transaction(async (manager) => {
      const savedPack = await manager.save(pack);
      await manager.save(questions);
      // Use findOne to eagerly load the associated entities
      return await manager.findOne(Pack, savedPack.id);
    });
  }

  async updateFromRequest(
    id?: string,
    name?: string,
    categoryNames?: string[],
    questionTitles?: string[],
    isPublic?: boolean
  ): Promise<Pack | undefined> {
    const categeryRepository = getCustomRepository(CategoryRepository);
    const categories = await categeryRepository.createOrGet(
      categoryNames || []
    );

    return await this.manager.transaction(async (manager) => {
      const pack = await manager.findOne(Pack, id);
      if (pack === undefined) {
        return undefined;
      }

      pack.name = name;
      pack.categories = categories;
      pack.public = isPublic;
      if (pack.questions !== undefined) {
        await manager.remove(pack.questions);
      }
      pack.questions = questionTitles?.map((title) => {
        const question = new Question();
        question.title = title;
        question.pack = pack;
        return question;
      });
      await manager.save(pack);
      await manager.save(pack.questions);
      return await manager.findOne(Pack, pack.id);
    });
  }
}
