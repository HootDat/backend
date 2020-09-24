import { User } from "../../entity/User";

export interface UserResponse {
  id?: number;
  name?: string;
}

export const transformUser = (user: User): UserResponse => {
  return {
    id: user.id,
    name: user.name,
  };
};
