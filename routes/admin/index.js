const express = require("express");

// ROUTES
const routes = {
  shops: require("./shops.routes"),
};

const middlewares = {
  auth: require("../../middlewares/auth/auth.middlewares"),
};

const router = express.Router();

// Everything below is staff-only. Applied on the router rather than per route,
// so a new endpoint added here cannot be forgotten.
router.use(middlewares.auth.protect);
router.use(middlewares.auth.admin);

// Mounted here as each area is built.
Object.entries(routes).forEach(([name, route]) => router.use(`/${name}`, route));

module.exports = router;
