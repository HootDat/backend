import Axios from "axios";
import { NextFunction, Request, Response } from "express";
import Joi from "joi";
import * as jwt from "jsonwebtoken";
import { getCustomRepository } from "typeorm";
import config from "../init/config";
import { UserRepository } from "../repositories/UserRepository";

// The response we expect to receive when calling FB to verify the user's access token
const fbAccessTokenResponseSchema = Joi.object({
  id: Joi.string().required(),
}).unknown();

const checkAccessToken = async (accessToken: string): Promise<boolean> => {
  const accessTokenResponse = await Axios.get(
    `https://graph.facebook.com/app/?access_token=${accessToken}`
  );
  const responseBody = Joi.attempt(
    accessTokenResponse.data,
    fbAccessTokenResponseSchema
  );
  return responseBody.id === config.oAuth.facebook.appID;
};

// The response we expect to receive when calling FB to retrieve user profile
const fbProfileResponseSchema = Joi.object({
  name: Joi.string().required(),
  id: Joi.string().required(),
}).unknown();

interface FacebookProfile {
  name: string;
  id: string;
}

const fetchFacebookProfile = async (
  accessToken: string
): Promise<FacebookProfile> => {
  const profileResponse = await Axios.get(
    `https://graph.facebook.com/me/?access_token=${accessToken}`
  );
  const body = Joi.attempt(profileResponse.data, fbProfileResponseSchema);
  const name: string = body.name;
  const id: string = body.id;
  return { name: name, id: id };
};

// The request we will receive for logging in with facebook
const fbAuthRequestSchema = Joi.object({
  accessToken: Joi.string().required(),
}).unknown();

export const loginWithFacebook = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // Verify the facebook access token
    const { value: reqBody, error } = fbAuthRequestSchema.validate(req.body);
    if (error) {
      return res.status(400).send(error.message);
    }
    const accessToken: string = reqBody.accessToken;

    try {
      const isValidToken = await checkAccessToken(accessToken);
      if (!isValidToken) {
        return res.status(401).send("bad credential");
      }

      const profile = await fetchFacebookProfile(accessToken);
      const userRepository = getCustomRepository(UserRepository);
      const user = await userRepository.getOrCreateFromFacebookID(
        profile.name,
        profile.id
      );

      if (!user) {
        return res.sendStatus(500);
      }
      // Generate and send our own JWT
      const token = jwt.sign({ userID: user.id }, config.jwtSecret, {
        expiresIn: "2 days",
      });
      // Send the jwt in the header and user in the body
      return res.set("Authorization", `Bearer ${token}`).json(user);
    } catch (error) {
      if (error.response) {
        return res.status(401).send("bad credentials");
      } else {
        return res.status(500).send(error);
      }
    }
  } catch (error) {
    next(error);
  }
};
