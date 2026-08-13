const express = require("express");

const controllers = {
  shops: require("../../controllers/public/shops.controllers"),
};

const router = express.Router();

router.get("/", controllers.shops.list);
router.get("/:slug", controllers.shops.get);

module.exports = router;
