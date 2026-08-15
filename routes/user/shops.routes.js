const express = require("express");

const controllers = {
  shops: require("../../controllers/user/shops.controllers"),
};

const middlewares = {
  shops: require("../../middlewares/user/shops.middlewares"),
  upload: require("../../middlewares/upload.middlewares"),
};

const throttle = require("../../middlewares/throttle.middlewares");

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

router.post(
  "/:id/logo",
  throttle.uploads,
  middlewares.shops.owned,
  middlewares.upload.single("image"),
  controllers.shops.uploadLogo
);

router.delete("/:id/logo", middlewares.shops.owned, controllers.shops.deleteLogo);

// The transitions an owner is allowed. Each is its own endpoint rather than a
// status field on the update, because each carries a different rule and a
// single writable `status` is exactly what let a seller approve themselves.
router.post("/:id/submit", middlewares.shops.owned, controllers.shops.submit);
router.post("/:id/withdraw", middlewares.shops.owned, controllers.shops.withdraw);
router.post("/:id/close", middlewares.shops.owned, controllers.shops.close);
router.post("/:id/reopen", middlewares.shops.owned, controllers.shops.reopen);

module.exports = router;
