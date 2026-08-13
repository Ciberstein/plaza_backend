const catchAsync = require("../../utils/catchAsync.util");
const AppError = require("../../utils/appError.util");
const Market = require("../../models/market.models");

// Only what a storefront needs. The owner's account id is not part of it.
const PUBLIC_ATTRS = ["id", "name", "slug", "description", "logo"];

exports.list = catchAsync(async (req, res) => {
  const shops = await Market.Shop.findAll({
    where: { status: "active" },
    attributes: PUBLIC_ATTRS,
    order: [["createdAt", "DESC"]],
  });

  return res.status(200).json(shops);
});

exports.get = catchAsync(async (req, res, next) => {
  const shop = await Market.Shop.findOne({
    // Reached by slug, not by id: the id is an internal detail and the slug is
    // what a person copied out of the address bar.
    where: { slug: req.params.slug, status: "active" },
    attributes: PUBLIC_ATTRS,
  });

  if (!shop) return next(new AppError("Shop not found", 404));

  return res.status(200).json(shop);
});
