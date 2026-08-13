const express = require("express");

// ROUTES
const routes = {};

const router = express.Router();

// Mounted here as each area is built.
Object.entries(routes).forEach(([name, route]) => router.use(`/${name}`, route));

module.exports = router;
