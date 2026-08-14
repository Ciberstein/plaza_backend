const express = require("express");

const controllers = {
  orders: require("../../controllers/user/orders.controllers"),
};

const middlewares = {
  orders: require("../../middlewares/user/orders.middlewares"),
};

const router = express.Router();

// What this person bought.
router.get("/", controllers.orders.list);

router.post("/", middlewares.orders.basket, controllers.orders.create);

router.get("/:id", middlewares.orders.purchased, controllers.orders.get);

// Cancelling reaches one seller's part of the order, not the whole thing. An
// order that went to four sellers is four agreements, and backing out of one
// is not backing out of the others.
router.post(
  "/:id/parts/:subOrderId/cancel",
  middlewares.orders.purchased,
  controllers.orders.cancelAsBuyer
);

module.exports = router;
