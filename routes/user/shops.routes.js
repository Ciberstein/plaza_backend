const express = require("express");

const controllers = {
  shops: require("../../controllers/user/shops.controllers"),
  members: require("../../controllers/user/members.controllers"),
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

// Who works here. Reading the roster goes through `member`, the wider door:
// a collaborator is entitled to know who else has this shop's name on their
// listings. Inviting and removing go through `owned`, the strict one — they
// are two of the four things that stay the owner's.
//
// Removing is the exception inside the exception: `owned` would stop somebody
// leaving a shop they do not own, so it uses the wider door and the controller
// checks that they are removing themselves.
router.get("/:id/members", middlewares.shops.member, controllers.members.list);
router.post("/:id/members", throttle.mailing, middlewares.shops.owned, controllers.members.invite);
router.delete("/:id/members/:accountId", middlewares.shops.member, controllers.members.remove);

// The transitions an owner is allowed. Each is its own endpoint rather than a
// status field on the update, because each carries a different rule and a
// single writable `status` is exactly what let a seller approve themselves.
router.post("/:id/submit", middlewares.shops.owned, controllers.shops.submit);
router.post("/:id/withdraw", middlewares.shops.owned, controllers.shops.withdraw);
router.post("/:id/close", middlewares.shops.owned, controllers.shops.close);
router.post("/:id/reopen", middlewares.shops.owned, controllers.shops.reopen);

module.exports = router;
