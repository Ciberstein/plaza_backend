const AppError = require("../../utils/appError.util");
const catchAsync = require("../../utils/catchAsync.util");
const Market = require("../../models/market.models");
const { uniqueSlug } = require("../../utils/slug.util");
const Geo = require("../../models/geo.models");

exports.validate = catchAsync(async (req, res, next) => {
  const { name, cityId, shipping } = req.body;

  if (!name?.trim()) return next(new AppError("Shop name is required", 406));
  if (name.trim().length < 3) return next(new AppError("Shop name is too short", 406));

  // Checked against the same rows /public/meta serves the form, so a value the
  // form could not have offered is rejected here rather than reaching the model
  // and coming back as a generic constraint error.
  if (cityId !== undefined && cityId !== null) {
    const city = await Geo.City.findOne({ where: { id: cityId, active: true } });
    if (!city) return next(new AppError("Pick a city from the list", 406));
  }

  if (shipping !== undefined && !Market.SHIPPING_MODE.includes(shipping))
    return next(new AppError("Pick a delivery option from the list", 406));

  req.body.name = name.trim();

  next();
});

// Ownership is resolved from the session, never from the body. A shopId in the
// request would let anyone edit a shop by guessing a number.
exports.owned = catchAsync(async (req, res, next) => {
  const shop = await Market.Shop.findOne({
    where: { id: req.params.id, accountId: req.sessionAccount.id },
  });

  // Not found rather than forbidden: someone else's shop should not be
  // distinguishable from one that does not exist.
  if (!shop) return next(new AppError("Shop not found", 404));

  req.shop = shop;

  next();
});

exports.slug = catchAsync(async (req, res, next) => {
  req.body.slug = await uniqueSlug(req.body.name, async (candidate) => {
    const existing = await Market.Shop.findOne({ where: { slug: candidate } });
    return Boolean(existing);
  });

  next();
});
