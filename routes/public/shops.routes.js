const express = require("express");

const controllers = {
  shops: require("../../controllers/public/shops.controllers"),
};

const throttle = require("../../middlewares/throttle.middlewares");

const router = express.Router();

// Searches shop names and descriptions the same way, and pays the same price
// for it.
router.get("/", throttle.browsing, controllers.shops.list);
router.get("/:slug", controllers.shops.get);

module.exports = router;
