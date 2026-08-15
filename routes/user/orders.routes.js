const express = require("express");

const controllers = {
  orders: require("../../controllers/user/orders.controllers"),
};

const middlewares = {
  orders: require("../../middlewares/user/orders.middlewares"),
};

const throttle = require("../../middlewares/throttle.middlewares");

const router = express.Router();

// What this person bought.
router.get("/", controllers.orders.list);

// One order mails every seller in it, so a basket of twenty listings is twenty
// messages from one request. Placing an order also takes stock down, which is
// its own brake, but the mail leaves whether or not the stock ever comes back.
router.post("/", throttle.mailing, middlewares.orders.basket, controllers.orders.create);

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
