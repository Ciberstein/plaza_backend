const express = require("express");

const controllers = {
  products: require("../../controllers/public/products.controllers"),
};

const throttle = require("../../middlewares/throttle.middlewares");

const router = express.Router();

// The expensive read. A search cannot use an index — the wildcard is on both
// ends of the term — so what one request costs is set by how much is for sale,
// not by how much was asked for.
router.get("/", throttle.browsing, controllers.products.list);

// By id, not by slug: a listing has no slug column, and unlike a shop nobody
// reads a product URL out loud. Adding one later does not break this route.
router.get("/:id", controllers.products.get);

// Public, because the answers are part of what the listing tells you. Asking
// one needs a session and lives under /user/questions.
router.get("/:id/questions", controllers.products.questions);

module.exports = router;
