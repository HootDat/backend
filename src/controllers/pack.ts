import { Request, Response } from "express";
import { Pack, PacksModel } from "../models/pack";

export const getPacks = (_: Request, res: Response) => {
  res.json(PacksModel.findAll(null, null, null, []));
};

export const createPack = (_: Request, res: Response) => {
  const result = PacksModel.create({
    name: "Sports questions",
    categories: ["fun", "school", "sports"],
    questions: ["123123", "345345"],
    public: true,
  });
  if (result instanceof Error) {
    const error: Error = result;
    res.status(500).json({ error: error.message });
  } else {
    const pack: Pack = result;
    res.status(201).send(pack);
  }
};
