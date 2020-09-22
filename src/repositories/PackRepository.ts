import {
  Brackets,
  EntityRepository,
  getCustomRepository,
  Repository,
  SelectQueryBuilder,
} from "typeorm";
import { Pack } from "../entity/Pack";
import { Question } from "../entity/Question";
import { User } from "../entity/User";
import { CategoryRepository } from "./CategeryRepository";

export type PackQueryScope = "all" | "own" | "community";

@EntityRepository(Pack)
export class PackRepository extends Repository<Pack> {
  private visiblePacks(userID?: number): SelectQueryBuilder<Pack> {
    let query = this.createQueryBuilder("pack")
      .innerJoinAndSelect("pack.categories", "category")
      .innerJoinAndSelect("pack.owner", "owner");

    if (userID) {
      query = query.where(
        new Brackets((qb) => {
          qb.where("owner.id = :userID", { userID: userID }).orWhere(
            "pack.public = true"
          );
        })
      );
    } else {
      query = query.where("pack.public = true");
    }
    return query;
  }

  async findWithPagination(
    offset?: number,
    limit?: number,
    userID?: number,
    scope?: PackQueryScope,
    categoryNames?: string[]
  ): Promise<Pack[]> {
    let query = this.visiblePacks(userID).orderBy("pack.id", "DESC");

    if (categoryNames && categoryNames.length > 0) {
      query = query.andWhere("category.name IN (:...categoryNames)", {
        categoryNames,
      });
    }

    if (userID) {
      // Scope only makes sense when userId is supplied
      if (scope === "own") {
        // Only include my packs
        query = query.andWhere("owner.id = :userID", { userID: userID });
      } else if (scope === "community") {
        query = query.andWhere("owner.id <> :userID", { userID: userID });
      }
    }

    if (offset && offset > 0) {
      query = query.skip(offset);
    }
    if (limit && limit > 0) {
      query = query.take(limit);
    }
    const packIds = (await query.getMany()).map((pack) => pack.id);
    return await this.findByIds(packIds, { order: { id: "DESC" } });
  }

  async createFromRequest(
    ownerID: number,
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

    // Find the owner
    const owner = await this.manager.findOne(User, ownerID);
    if (!owner) {
      throw new Error("owner does not exist");
    }

    const pack = new Pack();
    pack.name = name;
    pack.public = isPublic;
    pack.categories = categories;
    pack.owner = owner;
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
