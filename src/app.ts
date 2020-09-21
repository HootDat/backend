import bodyParser from "body-parser";
import compression from "compression"; // compresses requests
import errorHandler from "errorhandler";
import express from "express";
import flash from "express-flash";
import lusca from "lusca";
import passport from "passport";
import path from "path";
import "reflect-metadata";
import * as passportConfig from "./config/passport";
import * as apiController from "./controllers/api";
import * as contactController from "./controllers/contact";
import * as homeController from "./controllers/home";
import * as packController from "./controllers/pack";
import * as userController from "./controllers/user";
import config from "./init/config";
import connecteToDatabase from "./init/database";
import logger from "./init/logger";

connecteToDatabase()
  .catch((error) => {
    logger.error(`Failed to connect to database: ${error}`);
    process.exit(1);
  })
  .then(() => {
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
    app.use((req, res, next) => {
      res.locals.user = req.user;
      next();
    });
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
      express.static(path.join(__dirname, "public"), { maxAge: 31557600000 })
    );

    /**
     * Primary app routes.
     */
    app.get("/", homeController.index);
    app.get("/login", userController.getLogin);
    app.post("/login", userController.postLogin);
    app.get("/logout", userController.logout);
    app.get("/forgot", userController.getForgot);
    app.post("/forgot", userController.postForgot);
    app.get("/reset/:token", userController.getReset);
    app.post("/reset/:token", userController.postReset);
    app.get("/signup", userController.getSignup);
    app.post("/signup", userController.postSignup);
    app.get("/contact", contactController.getContact);
    app.post("/contact", contactController.postContact);
    app.get(
      "/account",
      passportConfig.isAuthenticated,
      userController.getAccount
    );
    app.post(
      "/account/profile",
      passportConfig.isAuthenticated,
      userController.postUpdateProfile
    );
    app.post(
      "/account/password",
      passportConfig.isAuthenticated,
      userController.postUpdatePassword
    );
    app.post(
      "/account/delete",
      passportConfig.isAuthenticated,
      userController.postDeleteAccount
    );
    app.get(
      "/account/unlink/:provider",
      passportConfig.isAuthenticated,
      userController.getOauthUnlink
    );

    app.get("/packs", packController.getPacks);
    app.post("/packs", packController.createPack);

    /**
     * API examples routes.
     */
    app.get("/api", apiController.getApi);
    app.get(
      "/api/facebook",
      passportConfig.isAuthenticated,
      passportConfig.isAuthorized,
      apiController.getFacebook
    );

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
     * Start Express server.
     */
    app.listen(config.port, () => {
      logger.info(
        `App is running at http://localhost:${config.port} in ${config.environment} mode`,
      );
    });
  });
