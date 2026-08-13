const express = require("express");

// ROUTES
const routes = {
  account: require("./accounts.routes"),
  shops: require("./shops.routes"),
};

// MIDDLEWARES
const middlewares = {
  auth: require("../../middlewares/auth/auth.middlewares"),
};

const router = express.Router();

// Everything below belongs to whoever is signed in.
router.use(middlewares.auth.protect);

Object.entries(routes).forEach(([name, route]) => router.use(`/${name}`, route));

module.exports = router;
