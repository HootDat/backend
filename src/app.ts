import bodyParser from "body-parser";
import compression from "compression"; // compresses requests
import cors from "cors";
import errorHandler from "errorhandler";
import express from "express";
import flash from "express-flash";
import lusca from "lusca";
import morgan from "morgan";
import passport from "passport";
import path from "path";
import http from "http";

import "reflect-metadata";
import { createConnection } from "typeorm";
import * as categoryController from "./controllers/category";
import * as packController from "./controllers/pack";
import config from "./init/config";
import logger from "./init/logger";
import setupSocket from "./socket";

createConnection()
  .catch((error) => {
    logger.error(`Failed to connect to database: ${error}`);
    process.exit(1);
  })
  .then((connection) => {
    // Create Express server
    const app = express();

    // Express configuration
    app.set("views", path.join(__dirname, "../views"));
    app.set("view engine", "pug");
    app.use(compression());
    app.use(bodyParser.json());
    app.use(bodyParser.urlencoded({ extended: true }));
    app.use(passport.initialize());
    app.use(passport.session());
    app.use(flash());
    app.use(lusca.xframe("SAMEORIGIN"));
    app.use(lusca.xssProtection(true));
    if (config.environment === "production") {
      app.use(morgan("combined"));
    } else {
      app.use(morgan("dev"));
    }
    app.use(cors());
    app.use((req, res, next) => {
      if (!req.session) {
        next();
        return;
      }
      // After successful login, redirect back to the intended page
      if (
        !req.user &&
        req.path !== "/login" &&
        req.path !== "/signup" &&
        !req.path.match(/^\/auth/) &&
        !req.path.match(/\./)
      ) {
        req.session.returnTo = req.path;
      } else if (req.user && req.path == "/account") {
        req.session.returnTo = req.path;
      }
      next();
    });

    app.use(
      express.static(path.join(__dirname, "public"), { maxAge: 31557600000 }),
    );

    // TODO: remove this later
    if (config.environment === "development") {
      app.post("/debug/nuke", async (_, res) => {
        await connection.dropDatabase();
        await connection.synchronize();
        res.status(200).send("Database nuked");
      });
    }

    /**
     * Primary app routes.
     */
    app.get("/packs", packController.getPacks);
    app.post("/packs", packController.createPack);
    app.put("/packs/:id", packController.editPack);
    app.delete("/packs/:id", packController.deletePack);

    app.get("/categories", categoryController.getCategories);

    /**
     * OAuth authentication routes. (Sign in)
     */
    /* app.get("/auth/facebook", passport.authenticate("facebook", { scope: ["email", "public_profile"] })); */
    /* app.get("/auth/facebook/callback", passport.authenticate("facebook", { failureRedirect: "/login" }), (req, res) => { */
    /*     res.redirect(req.session.returnTo || "/"); */
    /* }); */

    /**
     * Error Handler. Provides full stack - remove for production
     */
    app.use(errorHandler());

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
  });
