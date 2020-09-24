/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { Pack } from "../../entity/Pack";
import { transformUser, UserResponse } from "./user";

export interface PackResponse {
  id?: number;
  name?: string;
  public?: boolean;
  owner?: UserResponse;
  questions?: string[];
  categories?: string[];
  updatedAt?: Date;
}

export const transformPack = (pack?: Pack): PackResponse => {
  return {
    id: pack?.id,
    name: pack?.name,
    public: pack?.public,
    owner: transformUser(pack?.owner!),
    questions: pack?.questions!.map((q) => q.title!),
    categories: pack?.categories!.map((c) => c.name!),
    updatedAt: pack?.updatedAt!,
  };
};
