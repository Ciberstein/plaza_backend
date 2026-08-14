const express = require("express");

const controllers = {
  cart: require("../../controllers/user/cart.controllers"),
};

const router = express.Router();

// Before /:productId, or "count" would be read as one.
router.get("/count", controllers.cart.count);

router.get("/", controllers.cart.list);
router.delete("/", controllers.cart.clear);

router.post("/:productId", controllers.cart.add);
router.patch("/:productId", controllers.cart.setQuantity);
router.delete("/:productId", controllers.cart.remove);

module.exports = router;
