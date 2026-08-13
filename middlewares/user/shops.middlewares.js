const AppError = require("../../utils/appError.util");
const catchAsync = require("../../utils/catchAsync.util");
const Market = require("../../models/market.models");
const { uniqueSlug } = require("../../utils/slug.util");

exports.validate = catchAsync(async (req, res, next) => {
  const { name } = req.body;

  if (!name?.trim()) return next(new AppError("Shop name is required", 406));
  if (name.trim().length < 3) return next(new AppError("Shop name is too short", 406));

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
