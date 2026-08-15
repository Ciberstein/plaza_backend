const express = require("express");

const controllers = {
  members: require("../../controllers/user/members.controllers"),
};

const router = express.Router();

// The other side of the roster, and a group of its own because it is not a
// property of any one shop: it is a list of shops asking after you, and until
// you answer one of them none of them are yours to look inside.
router.get("/", controllers.members.invitations);

router.post("/:id/accept", controllers.members.accept);
router.post("/:id/decline", controllers.members.decline);

module.exports = router;
