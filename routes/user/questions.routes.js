const express = require("express");

const controllers = {
  questions: require("../../controllers/user/questions.controllers"),
};

const router = express.Router();

// What has been asked of me, as a seller.
router.get("/", controllers.questions.inbox);

// Asking carries the listing in the body rather than the path: this is the
// question resource, and the same group holds both sides of it.
router.post("/", controllers.questions.ask);

router.post("/:id/answer", controllers.questions.answer);

module.exports = router;
