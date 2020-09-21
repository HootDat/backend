import { createConnection } from "typeorm";
import config from "./config";

const connecteToDatabase = () =>
  createConnection({
    type: "postgres",
    host: config.database.host,
    port: config.database.port,
    username: config.database.username,
    password: config.database.password,
    database: config.database.database,
    synchronize: config.environment === "production" ? false : true,
    logging: true,
    entities: ["dist/entity/**.*.js"],
    migrations: ["dist/migration/**/*.js"],
  });

export default connecteToDatabase;
