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

export type PackUpdateRejectedOverwrite = { serverCopy: Pack };
export type PackUpdateUpdated = { updatedCopy: Pack };
export type PackUpdatePackNotFound = "pack does not exist";
export type PackUpdateUnexpectedError = "unexpected error";
export type PackUpdateResult =
  | PackUpdateUpdated
  | PackUpdateRejectedOverwrite
  | PackUpdatePackNotFound
  | PackUpdateUnexpectedError;

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
    lastEdited: Date,
    id: string,
    name?: string,
    categoryNames?: string[],
    questionTitles?: string[],
    isPublic?: boolean
  ): Promise<PackUpdateResult> {
    const categeryRepository = getCustomRepository(CategoryRepository);
    const categories = await categeryRepository.createOrGet(
      categoryNames || []
    );

    return await this.manager.transaction(async (manager) => {
      const pack = await manager.findOne(Pack, id);
      if (!pack) {
        return "pack does not exist";
      }
      if (!pack.updatedAt) {
        return "unexpected error";
      }
      // If the server copy is newer than the client copy, don't allow update
      if (pack.updatedAt > lastEdited) {
        return { serverCopy: pack };
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
      // We might not have modified properties of the pack (eg only changed questions)
      // But we still want the updatedAt column to sync to the current time
      // There's no clean way to only update the updatedAt column
      await manager.query(
        `UPDATE "pack" SET "updatedAt" = NOW() WHERE id = ${pack.id}`
      );
      await manager.save(pack.questions);
      const reloadedPack = await manager.findOne(Pack, pack.id);
      if (!reloadedPack) {
        return "unexpected error";
      }
      return { updatedCopy: reloadedPack };
    });
  }
}
