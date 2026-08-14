const express = require("express");

const controllers = {
  favourites: require("../../controllers/user/favourites.controllers"),
};

const router = express.Router();

// Before /:productId, or "ids" would be read as one.
router.get("/ids", controllers.favourites.ids);

router.get("/", controllers.favourites.list);

router.post("/:productId", controllers.favourites.add);
router.delete("/:productId", controllers.favourites.remove);

module.exports = router;
