const express = require("express");

const controllers = {
  shops: require("../../controllers/user/shops.controllers"),
};

const middlewares = {
  shops: require("../../middlewares/user/shops.middlewares"),
};

const router = express.Router();

router.get("/", controllers.shops.list);

router.post(
  "/",
  middlewares.shops.validate,
  middlewares.shops.slug,
  controllers.shops.create
);

router.get("/:id", middlewares.shops.owned, controllers.shops.get);

router.patch("/:id", middlewares.shops.owned, controllers.shops.update);

module.exports = router;
