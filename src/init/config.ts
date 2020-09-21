import dotenv from "dotenv";

// Load the values from the environment
const { error } = dotenv.config();
if (error) {
  console.error(`Failed to load environment variables: ${error}`);
  process.exit(1);
} else {
  console.debug("Loaded environment variables from .env");
}

// Put the values in a nicely structured object.
// Exits the process if a required variable is not found.

function getValueOrExit(key: string): string {
  const maybeValue = process.env[key];
  if (maybeValue === undefined) {
    console.error(`Missing required config variable '${key}'`);
    process.exit(1);
  }
  return maybeValue;
}
interface Config {
  environment: "production" | "development";
  port: string;
  jwtSecret: string;
  database: {
    host: string;
    port: number;
    username: string;
    password: string;
    database: string;
  };
}

const config: Config = {
  environment:
    process.env.NODE_ENV === "production" ? "production" : "development",

  /**
   *  Application port.
   */
  port: getValueOrExit("PORT"),

  /**
   * JWT Secret.
   */
  jwtSecret: getValueOrExit("JWT_SECRET"),

  /**
   * Postgres connection options.
   */
  database: {
    /**
     * Database host.
     */
    host: getValueOrExit("POSTGRES_HOST"),
    /**
     * Database host port.
     */
    port: Number.parseInt(getValueOrExit("POSTGRES_PORT")),
    /**
     * Database username.
     */
    username: getValueOrExit("POSTGRES_USERNAME"),
    /**
     * Database password.
     */
    password: getValueOrExit("POSTGRES_PASSWORD"),
    /**
     * Database name to connect to.
     */
    database: getValueOrExit("POSTGRES_DATABASE"),
  },

  // TODO: OAuth stuff
};

export default config;
