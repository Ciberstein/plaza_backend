const express = require("express");

const controllers = {
  orders: require("../../controllers/user/orders.controllers"),
};

const middlewares = {
  orders: require("../../middlewares/user/orders.middlewares"),
};

const router = express.Router();

// The other side of the same rows: what this person has been asked to sell.
// Addressed by suborder, because that is the unit a seller actually deals with.
router.get("/", controllers.orders.sales);

router.post("/:id/confirm", middlewares.orders.sold, controllers.orders.confirm);
router.post("/:id/deliver", middlewares.orders.sold, controllers.orders.deliver);
router.post("/:id/cancel", middlewares.orders.sold, controllers.orders.cancelAsSeller);

module.exports = router;
