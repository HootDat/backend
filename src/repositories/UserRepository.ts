import { EntityRepository, getRepository, Repository } from "typeorm";
import { FacebookAuthStrategy } from "../entity/FacebookAuthStrategy";
import { User } from "../entity/User";

@EntityRepository(User)
export class UserRepository extends Repository<User> {
  async getOrCreateFromFacebookID(name: string, facebookID: string) {
    const fbAuthRepository = getRepository(FacebookAuthStrategy);
    const fbAuth = await fbAuthRepository.findOne({ facebookID: facebookID });
    if (fbAuth) {
      // Existing user - find the user and return it
      const user = fbAuth.user;
      return user;
    } else {
      // New user - create account and return the new user
      const user = new User();
      user.name = name;
      user.authMethod = "facebook";
      await this.save(user);
      const fbAuth = new FacebookAuthStrategy();
      fbAuth.facebookID = facebookID;
      fbAuth.user = user;
      await fbAuthRepository.save(fbAuth);
      return await this.findOne(user.id);
    }
  }
}
