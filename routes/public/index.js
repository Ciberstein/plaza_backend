const express = require("express");

// ROUTES
const routes = {
  shops: require("./shops.routes"),
  meta: require("./meta.routes"),
};

const router = express.Router();

Object.entries(routes).forEach(([name, route]) => router.use(`/${name}`, route));

module.exports = router;
