const express = require("express");
const rateLimit = require("express-rate-limit");

// CONTROLLERS
const controllers = {
  accounts: require("../../controllers/auth/accounts.controllers"),
};

// MIDDLEWARES
const middlewares = {
  auth: require("../../middlewares/auth/auth.middlewares"),
  register: require("../../middlewares/auth/register.middlewares"),
  login: require("../../middlewares/auth/login.middlewares"),
};

const router = express.Router();

// Tighter than the rest of the API: these are the endpoints worth brute
// forcing, and a marketplace account holds money.
const credentialsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: "fail", message: "Too many attempts, please try again later." },
});

router.post(
  "/register",
  credentialsLimiter,
  middlewares.register.validate,
  middlewares.register.available,
  middlewares.register.create,
  controllers.accounts.register
);

router.post(
  "/login",
  credentialsLimiter,
  middlewares.login.validate,
  middlewares.login.authenticate,
  controllers.accounts.login
);

router.post("/logout", controllers.accounts.logout);

router.get("/session", middlewares.auth.protect, controllers.accounts.session);

module.exports = router;
