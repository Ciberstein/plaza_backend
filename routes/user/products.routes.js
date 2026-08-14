const express = require("express");

const controllers = {
  products: require("../../controllers/user/products.controllers"),
};

const middlewares = {
  products: require("../../middlewares/user/products.middlewares"),
  upload: require("../../middlewares/upload.middlewares"),
};

const router = express.Router();

router.get("/", controllers.products.list);

router.post("/", middlewares.products.validate, controllers.products.create);

router.get("/:id", middlewares.products.owned, controllers.products.get);

router.patch(
  "/:id",
  middlewares.products.owned,
  middlewares.products.validate,
  controllers.products.update
);

// The transitions a seller is allowed. Separate endpoints rather than a
// writable `status`, for the same reason shops work that way: each carries its
// own rule, and one settable field is how a listing skips its own checks.
router.post(
  "/:id/publish",
  middlewares.products.owned,
  middlewares.products.publishable,
  controllers.products.publish
);

router.post("/:id/archive", middlewares.products.owned, controllers.products.archive);

/* photographs */

router.post(
  "/:id/images",
  middlewares.products.owned,
  middlewares.upload.single("image"),
  controllers.products.addImage
);

router.patch("/:id/images", middlewares.products.owned, controllers.products.reorderImages);

router.delete(
  "/:id/images/:imageId",
  middlewares.products.owned,
  controllers.products.removeImage
);

module.exports = router;
