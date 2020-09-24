import { NextFunction, Request, Response } from "express";
import Joi from "joi";
import { getCustomRepository } from "typeorm";
import { PackQueryScope, PackRepository } from "../repositories/PackRepository";

const getPacksRequestSchema = Joi.object({
  categories: Joi.array().items(Joi.string()),
  offset: Joi.number().integer(),
  limit: Joi.number().integer(),
  scope: Joi.string().allow("all", "community", "own"),
}).unknown();

export const getPacks = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { value: body, error } = getPacksRequestSchema.validate(req.query);
    if (error) {
      return res.status(400).json({ error: error.message });
    }

    const categories: string[] | undefined = body.categories;
    const offset: number | undefined = body.offset;
    const limit: number | undefined = body.limit;
    const userID = req.jwt?.userID;
    const scope: PackQueryScope | undefined = body.scope;

    const packRepository = getCustomRepository(PackRepository);
    const packs = await packRepository.findWithPagination(
      offset,
      limit,
      userID,
      scope,
      categories
    );
    res.json(packs);
  } catch (error) {
    next(error);
  }
};

const createPackRequestSchema = Joi.object({
  name: Joi.string().required(),
  categories: Joi.array().items(Joi.string()),
  questions: Joi.array().items(Joi.string()),
  public: Joi.boolean().required(),
}).unknown();

export const createPack = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userID = req.jwt?.userID;
    if (!userID) {
      return res.status(401).json({ error: "login required" });
    }

    const { value: body, error } = createPackRequestSchema.validate(req.body);
    if (error) {
      return res
        .status(400)
        .json({ error: `malformed request body: ${error.message}` });
    }

    const name: string = body.name;
    const categories: string[] | undefined = body.categories;
    const questions: string[] | undefined = body.questions;
    const isPublic: boolean = body.public;

    const packRepository = getCustomRepository(PackRepository);
    const savedPack = await packRepository.createFromRequest(
      userID,
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

const editPackRequestSchema = Joi.object({
  name: Joi.string(),
  categories: Joi.array().items(Joi.string()),
  questions: Joi.array().items(Joi.string()),
  public: Joi.boolean(),
  // the updatedAt timestamp is needed to prevent the client from
  // overwriting a pack that has changed on the server
  updatedAt: Joi.string().isoDate().required(),
}).unknown();

// Edit the pack
// When the response code is 400, a json body will be returned with a "message" key
// which explains the reason.
export const editPack = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // Make sure the user is authorised
    const userID = req.jwt?.userID;
    if (!userID) {
      return res.status(401).json({ error: "login required" });
    }
    const packID = req.params.id;
    if (!packID) {
      return res.status(400).json({ error: "pack id is required" });
    }
    const pack = await getCustomRepository(PackRepository).findOne(packID);
    if (!pack) {
      return res.status(400).json({ error: "pack does not exist" });
    }
    // Only the owner can edit the pack
    if (pack.owner?.id !== userID) {
      return res.status(403).json({ error: "permission denied" });
    }

    // Read the body
    const { value: body, error } = editPackRequestSchema.validate(req.body);
    if (error) {
      return res
        .status(400)
        .json({ error: `malformed request body: ${error.message}` });
    }

    const name: string | undefined = body.name;
    const categories: string[] | undefined = body.categories;
    const questions: string[] | undefined = body.questions;
    const isPublic: boolean | undefined = body.public;
    const updatedAt: Date = new Date(body.updatedAt);

    const packRepository = getCustomRepository(PackRepository);
    const updateResult = await packRepository.updateFromRequest(
      updatedAt,
      packID,
      name,
      categories,
      questions,
      isPublic
    );
    if (updateResult === "pack does not exist") {
      return res.status(400).json({ error: "pack does not exist" });
    } else if (
      updateResult instanceof Object &&
      "updatedCopy" in updateResult
    ) {
      return res.json(updateResult.updatedCopy);
    } else if (updateResult instanceof Object && "serverCopy" in updateResult) {
      return res.status(400).json({
        error: "server has a newer copy",
        serverCopy: updateResult.serverCopy,
      });
    } else {
      return res.status(500).json({ error: "internal server error" });
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
    // Make sure the user is authorised
    const userID = req.jwt?.userID;
    if (!userID) {
      return res.status(401).json({ error: "login required" });
    }
    const packID = req.params.id;
    if (!packID) {
      return res.status(400).json({ error: "pack id is required" });
    }
    const packRepository = getCustomRepository(PackRepository);
    const pack = await packRepository.findOne(packID);
    if (!pack) {
      return res.status(400).json({ error: "pack does not exist" });
    }
    // Only the owner can delete the pack
    if (pack.owner?.id !== userID) {
      return res.status(403).json({ error: "permission denied" });
    }
    await packRepository.remove(pack);
    res.sendStatus(204);
  } catch (error) {
    next(error);
  }
};
