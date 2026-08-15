const express = require("express");

const controllers = {
  products: require("../../controllers/public/products.controllers"),
};

const router = express.Router();

router.get("/", controllers.products.list);

// By id, not by slug: a listing has no slug column, and unlike a shop nobody
// reads a product URL out loud. Adding one later does not break this route.
router.get("/:id", controllers.products.get);

// Public, because the answers are part of what the listing tells you. Asking
// one needs a session and lives under /user/questions.
router.get("/:id/questions", controllers.products.questions);

module.exports = router;
