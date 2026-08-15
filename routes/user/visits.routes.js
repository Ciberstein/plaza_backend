const express = require("express");

const controllers = {
  visits: require("../../controllers/user/visits.controllers"),
};

const throttle = require("../../middlewares/throttle.middlewares");

const router = express.Router();

// The two sides of the same resource, and two screens rather than one: what I
// asked to see, and what I have been asked to show. Somebody who both rents
// out a flat and is looking for one is not helped by a single list mixing the
// two.
router.get("/", controllers.visits.mine);
router.get("/received", controllers.visits.received);

// Mails the owner, so it is limited by account for the same reason asking a
// question is: the mailbox on the other end does not care which network the
// sender was on, and neither does the sending domain's reputation.
router.post("/", throttle.mailing, controllers.visits.request);

// Accepting mails the visitor; declining tells nobody. Both are limited
// anyway, because the limit is on the endpoint and not on the outcome.
router.post("/:id/accept", throttle.mailing, controllers.visits.accept);
router.post("/:id/decline", controllers.visits.decline);

module.exports = router;
