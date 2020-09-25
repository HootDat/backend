import bodyParser from "body-parser";
import compression from "compression"; // compresses requests
import cors from "cors";
import express, { NextFunction, Request, Response } from "express";
import http from "http";
import morgan from "morgan";

import "reflect-metadata";
import { createConnection } from "typeorm";
import * as authController from "./controllers/auth";
import * as categoryController from "./controllers/category";
import * as debugController from "./controllers/debug";
import * as packController from "./controllers/pack";
import config from "./init/config";
import logger from "./init/logger";
import { extractJwt, requireJwt } from "./middleware/auth";
import setupSocket from "./socket";

createConnection()
  .catch((error) => {
    logger.error(`Failed to connect to database: ${error}`);
    process.exit(1);
  })
  .then(() => {
    // Create Express server
    const app = express();

    // Express configuration
    app.use(compression());
    app.use(bodyParser.json());
    app.use(bodyParser.urlencoded({ extended: true }));
    if (config.environment === "production") {
      app.use(morgan("combined"));
    } else {
      app.use(morgan("dev"));
    }

    const corsOptions = {
      exposedHeaders: "Authorization",
    };
    app.use(cors(corsOptions));

    app.use(extractJwt);

    /**
     * Primary app routes.
     */
    app.get("/packs", packController.getPacks);
    app.post("/packs", requireJwt, packController.createPack);
    app.put("/packs/:id", requireJwt, packController.editPack);
    app.delete("/packs/:id", requireJwt, packController.deletePack);

    app.get("/categories", categoryController.getCategories);

    app.post("/auth/login/facebook", authController.loginWithFacebook);

    if (config.environment === "development") {
      app.post("/debug/nuke", debugController.nukeDatabase);
      app.post("/debug/seed", debugController.seed);
    }

    app.use(
      (error: Error, _req: Request, res: Response, _next: NextFunction) => {
        logger.warn("unhandled error", error);
        return res.status(500).json({ error: "internal server error" });
      },
    );

    /**
     * Start Express server and setup socket.io server
     */
    const server = http.createServer(app);
    setupSocket(server);
    server.listen(config.port, () => {
      logger.info(
        `App is running at http://localhost:${config.port} in ${config.environment} mode`,
      );
    });
  })
  .catch((error) => {
    console.error(error);
    // Errors thrown by handlers are automatically caught by Express
    // If we reach here, we must have encountered an error during initialisation
    process.exit(1);
  });
