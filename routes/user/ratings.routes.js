const express = require("express");

const controllers = {
  ratings: require("../../controllers/user/ratings.controllers"),
};

const router = express.Router();

// What this person has already said, so the purchases screen knows which cards
// still need a button.
router.get("/mine", controllers.ratings.mine);

// Two different judgements, so two endpoints. One is about how a person
// behaved, the other about whether a thing is any good, and neither is a
// special case of the other.
router.post("/seller", controllers.ratings.rateSeller);
router.post("/product", controllers.ratings.reviewProduct);

module.exports = router;
