const express = require("express");

const controllers = {
  shops: require("../../controllers/admin/shops.controllers"),
};

const router = express.Router();

router.get("/", controllers.shops.list);

router.post("/:id/approve", controllers.shops.approve);
router.post("/:id/reject", controllers.shops.reject);
router.post("/:id/suspend", controllers.shops.suspend);
router.post("/:id/restore", controllers.shops.restore);

module.exports = router;
