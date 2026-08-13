const express = require("express");

const controllers = {
  meta: require("../../controllers/public/meta.controllers"),
};

const router = express.Router();

router.get("/", controllers.meta.index);

module.exports = router;
