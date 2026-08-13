const express = require("express");
const rateLimit = require("express-rate-limit");

const controllers = {
  accounts: require("../../controllers/user/accounts.controllers"),
};

const upload = require("../../middlewares/upload.middlewares");

const router = express.Router();

// The endpoints that take a password or mail a code. Tighter than the rest,
// because these are the ones worth attacking on an account someone left open.
const sensitive = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: "fail", message: "Too many attempts, please try again later." },
});

router.get("/", controllers.accounts.me);

router.patch("/", controllers.accounts.updateProfile);

router.post("/email", sensitive, controllers.accounts.requestEmailChange);
router.post("/email/confirm", sensitive, controllers.accounts.confirmEmailChange);

router.patch("/password", sensitive, controllers.accounts.updatePassword);

router.post("/avatar", upload.single("image"), controllers.accounts.uploadAvatar);
router.delete("/avatar", controllers.accounts.deleteAvatar);

module.exports = router;
