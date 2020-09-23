import { NextFunction, Request, Response } from "express";
import Joi from "joi";
import jwt from "jsonwebtoken";
import config from "../init/config";

const jwtSchema = Joi.object({
  userID: Joi.number().integer().required(),
  iat: Joi.number().integer().required(),
  exp: Joi.number().integer().required(),
});

export const extractJwt = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  // If no token, don't extract
  if (!authHeader) {
    req.jwt = undefined;
    return next();
  }
  // If token exists, assume the user wants to authenticate
  // We terminate the request if we can't extract the token
  const [type, token] = authHeader.split(" ", 2);
  if (type !== "Bearer") {
    return res.status(401).send("unsupported token type");
  }

  // Verify token
  try {
    const rawPayload = jwt.verify(token, config.jwtSecret);
    const payload = Joi.attempt(rawPayload, jwtSchema);
    req.jwt = payload;
    return next();
  } catch (error) {
    return res.status(401).send(`failed to authenticate: ${error}`);
  }
};

export const requireJwt = (req: Request, res: Response, next: NextFunction) => {
  if (!req.jwt) {
    return res.status(401).send("login required");
  }
  next();
};
