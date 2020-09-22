import { NextFunction, Request, Response } from "express";
import { getCustomRepository } from "typeorm";
import { CategoryRepository } from "../repositories/CategeryRepository";

export const getCategories = async (
  _: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const categoryRepository = getCustomRepository(CategoryRepository);
    const allCategories = await categoryRepository.find();
    res.json(allCategories);
  } catch (error) {
    next(error);
  }
};
