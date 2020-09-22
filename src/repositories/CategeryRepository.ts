import { EntityRepository, In, Repository } from "typeorm";
import { Category } from "../entity/Category";

@EntityRepository(Category)
export class CategoryRepository extends Repository<Category> {
  async createOrGet(names: string[]): Promise<Category[]> {
    if (names.length === 0) {
      return [];
    }

    return this.manager.transaction(async (manager) => {
      const existingCategories = await manager.find(Category, {
        name: In(names),
      });
      const newCategories = names
        .filter(
          (name) =>
            !existingCategories.some(
              (existingCategory) => existingCategory.name === name
            )
        )
        .map((categoryName) => {
          const category = new Category();
          category.name = categoryName;
          return category;
        });
      await manager.save(newCategories);
      return existingCategories.concat(newCategories);
    });
  }
}
