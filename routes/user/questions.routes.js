const express = require("express");

const controllers = {
  questions: require("../../controllers/user/questions.controllers"),
};

const throttle = require("../../middlewares/throttle.middlewares");

const router = express.Router();

// What has been asked of me, as a seller.
router.get("/", controllers.questions.inbox);

// Both of these mail a person. Limited by account rather than by address,
// because the mailbox on the other end does not care which network the sender
// was on, and neither does the sending domain's reputation.
//
// Asking carries the listing in the body rather than the path: this is the
// question resource, and the same group holds both sides of it.
router.post("/", throttle.mailing, controllers.questions.ask);

router.post("/:id/answer", throttle.mailing, controllers.questions.answer);

module.exports = router;
