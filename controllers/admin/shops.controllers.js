const catchAsync = require("../../utils/catchAsync.util");
const AppError = require("../../utils/appError.util");
const Market = require("../../models/market.models");
const Accounts = require("../../models/accounts.models");
const Geo = require("../../models/geo.models");
const { mail } = require("../../mail");
const templates = require("../../mail/templates");

// The queue an administrator works through. Defaults to what is waiting on
// them, because that is the only reason to open this screen.
exports.list = catchAsync(async (req, res) => {
  const status = req.query.status || "pending";

  const where = Market.SHOP_STATUS.includes(status) ? { status } : {};

  const shops = await Market.Shop.findAll({
    where,
    include: [
      { model: Accounts.Account, as: "owner", attributes: ["id", "username", "email", "verified"] },
      { model: Geo.City, as: "city", attributes: ["id", "name", "region"] },
    ],
    order: [["submittedAt", "ASC"], ["createdAt", "ASC"]],
  });

  return res.status(200).json(shops);
});

const load = async (id) =>
  Market.Shop.findByPk(id, {
    include: [{ model: Accounts.Account, as: "owner", attributes: ["id", "username", "email"] }],
  });

exports.approve = catchAsync(async (req, res, next) => {
  const shop = await load(req.params.id);

  if (!shop) return next(new AppError("Shop not found", 404));

  if (shop.status !== "pending") {
    return next(new AppError(`This shop is ${shop.status}, not waiting for review`, 409));
  }

  await shop.update({
    status: "active",
    // Stamped once. Its presence is what later lets the owner reopen a closed
    // shop without queueing again.
    approvedAt: shop.approvedAt ?? new Date(),
    reviewedBy: req.sessionAccount.id,
    reviewNote: null,
  });

  if (shop.owner) {
    const notice = templates.shopApproved({ username: shop.owner.username, shop: shop.name });
    await mail(shop.owner.email, notice.subject, notice.html);
  }

  return res.status(200).json(shop);
});

exports.reject = catchAsync(async (req, res, next) => {
  const shop = await load(req.params.id);

  if (!shop) return next(new AppError("Shop not found", 404));

  if (shop.status !== "pending") {
    return next(new AppError(`This shop is ${shop.status}, not waiting for review`, 409));
  }

  const note = String(req.body.note || "").trim();

  // Required, because a refusal without a reason gives the owner nothing to act
  // on and guarantees they resubmit the same thing.
  if (note.length < 10) {
    return next(new AppError("Say what needs fixing, in at least 10 characters", 406));
  }

  await shop.update({
    status: "rejected",
    reviewedBy: req.sessionAccount.id,
    reviewNote: note,
  });

  if (shop.owner) {
    const notice = templates.shopRejected({
      username: shop.owner.username,
      shop: shop.name,
      note,
    });
    await mail(shop.owner.email, notice.subject, notice.html);
  }

  return res.status(200).json(shop);
});

// Moderation after the fact. Separate from rejection because the shop was
// already trading and its listings have to come down.
exports.suspend = catchAsync(async (req, res, next) => {
  const shop = await load(req.params.id);

  if (!shop) return next(new AppError("Shop not found", 404));

  if (shop.status !== "active") {
    return next(new AppError("Only an open shop can be suspended", 409));
  }

  const note = String(req.body.note || "").trim();

  if (note.length < 10) {
    return next(new AppError("Say why, in at least 10 characters", 406));
  }

  await shop.update({ status: "suspended", reviewedBy: req.sessionAccount.id, reviewNote: note });

  return res.status(200).json(shop);
});

exports.restore = catchAsync(async (req, res, next) => {
  const shop = await load(req.params.id);

  if (!shop) return next(new AppError("Shop not found", 404));

  if (shop.status !== "suspended") {
    return next(new AppError("This shop is not suspended", 409));
  }

  await shop.update({ status: "active", reviewedBy: req.sessionAccount.id, reviewNote: null });

  return res.status(200).json(shop);
});
