export interface PackOwner {
  id: number;
  name: string;
}

export type Question = string;

export type PackCategory = string;

export interface PackCreateInput {
  name: string;
  categories: string[];
  questions: string[];
  public: boolean;
}

export interface Pack {
  id: number;
  owner: PackOwner;
  name: string;
  categories: PackCategory[];
  questions: Question[];
  public: boolean;
  updatedAt: Date;
}

export const PacksModel = {
  findAll: (
    limit: number | null,
    offset: number | null,
    scope: "all" | "community" | "own" | null,
    categories: string[]
  ): Pack[] => {
    const packs: Pack[] = [
      {
        id: 1,
        owner: {
          id: 1,
          name: "John Doe",
        },
        name: "Fun Pack",
        categories: ["fun", "party", "cool"],
        questions: ["Lorem Ipsum?", "Want to drop 3216?"],
        public: true,
        updatedAt: new Date(),
      },
    ];
    return packs;
  },

  create: (input: PackCreateInput): Error | Pack => {
    if (0) {
      return new Error("test");
    }
    return {
      id: 1,
      owner: {
        id: 1,
        name: "John Doe",
      },
      name: "Fun Pack",
      categories: ["fun", "party", "cool"],
      questions: ["Lorem Ipsum?", "Want to drop 3216?"],
      public: true,
      updatedAt: new Date(),
    };
  },
};
