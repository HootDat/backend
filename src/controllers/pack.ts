import { NextFunction, Request, Response } from "express";
import { getCustomRepository } from "typeorm";
import { Pack } from "../entity/Pack";
import { PackRepository } from "../repositories/PackRepository";

// TODO: auth
// TODO: querystrings

export const getPacks = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const categoryNames: string[] = [];
    if (
      Array.isArray(req.query.categories) &&
      req.query.categories.length > 0
    ) {
      req.query.categories.forEach((category: unknown) => {
        if (typeof category === "string") {
          categoryNames.push(category);
        }
      });
    } else if (typeof req.query.categories === "string") {
      categoryNames.push(req.query.categories);
    }

    let offset = 0;
    if (req.query.offset && typeof req.query.offset === "string") {
      offset = parseInt(req.query.offset);
    }

    let limit = 0;
    if (req.query.limit && typeof req.query.limit === "string") {
      limit = parseInt(req.query.limit);
    }

    const packRepository = getCustomRepository(PackRepository);
    let packs: Pack[];
    if (categoryNames.length > 0) {
      packs = await packRepository.findByCategories(
        categoryNames,
        offset,
        limit
      );
    } else {
      packs = await packRepository.findWithPagination(offset, limit);
    }
    res.json(packs);
  } catch (error) {
    next(error);
  }
};

export const createPack = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { name, categories, questions, public: isPublic } = req.body;
    const packRepository = getCustomRepository(PackRepository);
    const savedPack = await packRepository.createFromRequest(
      name,
      categories,
      questions,
      isPublic
    );
    res.status(201).json(savedPack);
  } catch (error) {
    next(error);
  }
};

export const editPack = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { name, categories, questions, public: isPublic } = req.body;
    const packRepository = getCustomRepository(PackRepository);
    const updatedPack = await packRepository.updateFromRequest(
      req.params.id,
      name,
      categories,
      questions,
      isPublic
    );
    if (updatedPack === undefined) {
      res.status(400).send("This pack does not exist");
    } else {
      res.json(updatedPack);
    }
  } catch (error) {
    next(error);
  }
};

export const deletePack = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const packRepository = getCustomRepository(PackRepository);
    const id = req.params.id;
    const pack = await packRepository.findOne(id);
    if (pack === undefined) {
      res.status(400).send("This pack does not exist");
    } else {
      await packRepository.remove(pack);
      res.sendStatus(204);
    }
  } catch (error) {
    next(error);
  }
};
