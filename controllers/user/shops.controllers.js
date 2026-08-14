const catchAsync = require("../../utils/catchAsync.util");
const AppError = require("../../utils/appError.util");
const Market = require("../../models/market.models");
const Accounts = require("../../models/accounts.models");
const cloudinary = require("../../utils/cloudinary.util");
const { randomUUID } = require("crypto");

const SHOP_ATTRS = [
  "id", "name", "slug", "description", "logo",
  "cityId", "shipping", "status", "submittedAt", "approvedAt", "reviewNote", "createdAt",
];

exports.list = catchAsync(async (req, res) => {
  const shops = await Market.Shop.findAll({
    where: { accountId: req.sessionAccount.id },
    attributes: SHOP_ATTRS,
    order: [["createdAt", "DESC"]],
  });

  return res.status(200).json(shops);
});

exports.get = catchAsync(async (req, res) => {
  return res.status(200).json(req.shop);
});

exports.create = catchAsync(async (req, res) => {
  const { name, slug, description, cityId, shipping } = req.body;

  const shop = await Market.Shop.create({
    accountId: req.sessionAccount.id,
    name,
    slug,
    description: description?.trim() || null,
    cityId: cityId ?? null,
    shipping: shipping || "seller",
    // Draft, not active: the seller sees the storefront before the square does.
    status: "draft",
  });

  // Opening a shop is what turns a buyer into a seller. The role is widened,
  // never narrowed — an admin who opens a shop stays an admin.
  if (req.sessionAccount.role === "buyer") {
    await req.sessionAccount.update({ role: "seller" });
  }

  return res.status(201).json(shop);
});

exports.update = catchAsync(async (req, res, next) => {
  const { name, description, cityId, shipping } = req.body;

  // A shop under review cannot be edited: an administrator is looking at a
  // specific set of details, and letting them change underneath is how a
  // benign shop gets approved and a different one goes live.
  if (req.shop.status === "pending") {
    return next(new AppError("This shop is being reviewed. Withdraw it first to make changes.", 409));
  }

  if (req.shop.status === "suspended") {
    return next(new AppError("This shop is suspended", 403));
  }

  const updates = {};

  if (name?.trim()) updates.name = name.trim();
  if (description !== undefined) updates.description = description?.trim() || null;
  if (cityId !== undefined) updates.cityId = cityId || null;

  if (shipping) {
    if (!Market.SHIPPING_MODE.includes(shipping)) {
      return next(new AppError("Pick a delivery option from the list", 406));
    }
    updates.shipping = shipping;
  }

  // `status` is deliberately absent. It is not the owner's to set — that is the
  // whole point of the review. The transitions they are allowed live in their
  // own endpoints below, each with its own rule.
  await req.shop.update(updates);

  return res.status(200).json(req.shop);
});

/* ─── the logo ────────────────────────────────────────────────────────────── */

/**
 * A shop's mark.
 *
 * The columns existed from the start and nothing ever filled them, which is why
 * every shop on Plaza shows the generated tile: not because no one uploaded a
 * logo, but because there was no way to.
 *
 * Contained rather than cropped to a square. A wordmark is most shop logos, and
 * a square crop cuts the ends off the name.
 */
exports.uploadLogo = catchAsync(async (req, res, next) => {
  const shop = req.shop;

  if (!cloudinary.configured()) {
    return next(new AppError("Image uploads are not configured on this server", 503));
  }

  if (!req.file) return next(new AppError("Choose an image first", 406));

  // Same rule as editing the details: an administrator is looking at a specific
  // shop, and letting it change underneath them is how one thing gets approved
  // and a different one goes live.
  if (shop.status === "pending") {
    return next(new AppError("This shop is being reviewed. Withdraw it first to make changes.", 409));
  }

  const result = await cloudinary.upload(req.file.buffer, {
    folder: cloudinary.folders.shop(shop.id),
    public_id: randomUUID(),
    transformation: [{ width: 512, height: 512, crop: "limit" }],
  });

  // The old file goes after the new one is stored, not before: a failed upload
  // must leave the shop with the logo it had.
  const previous = shop.logo_id;

  await shop.update({ logo: result.secure_url, logo_id: result.public_id });

  if (previous) {
    await cloudinary.remove(previous).catch(err =>
      console.error("CLOUDINARY: could not remove old logo:", err.message)
    );
  }

  return res.status(200).json(shop);
});

/** Removing it, not replacing it. The folder goes too. */
exports.deleteLogo = catchAsync(async (req, res) => {
  const shop = req.shop;

  await shop.update({ logo: null, logo_id: null });

  await cloudinary
    .removeFolder(cloudinary.folders.shop(shop.id))
    .catch(err => console.error("CLOUDINARY: could not clear shop folder:", err.message));

  return res.status(200).json(shop);
});

/* ─── the transitions an owner is allowed ────────────────────────────────── */

// Hands the shop to an administrator. Allowed from draft and from rejected, so
// a refusal can be fixed and sent back.
exports.submit = catchAsync(async (req, res, next) => {
  const shop = req.shop;

  if (!["draft", "rejected"].includes(shop.status)) {
    return next(new AppError(`A shop that is ${shop.status} cannot be submitted`, 409));
  }

  if (!shop.cityId) {
    return next(new AppError("Add the city the shop operates from before submitting", 406));
  }

  await shop.update({
    status: "pending",
    submittedAt: new Date(),
    // Cleared so an old refusal is not shown against a fresh submission.
    reviewNote: null,
  });

  return res.status(200).json(shop);
});

// Takes it back out of the queue, which is what makes editing possible again.
exports.withdraw = catchAsync(async (req, res, next) => {
  const shop = req.shop;

  if (shop.status !== "pending") {
    return next(new AppError("This shop is not waiting for review", 409));
  }

  await shop.update({ status: shop.approvedAt ? "active" : "draft", submittedAt: null });

  return res.status(200).json(shop);
});

exports.close = catchAsync(async (req, res, next) => {
  const shop = req.shop;

  if (shop.status !== "active") {
    return next(new AppError("Only an open shop can be closed", 409));
  }

  await shop.update({ status: "closed" });

  return res.status(200).json(shop);
});

// Reopening skips review, but only for a shop that was approved once. Without
// that check, closing and reopening would be a way around the queue.
exports.reopen = catchAsync(async (req, res, next) => {
  const shop = req.shop;

  if (shop.status !== "closed") {
    return next(new AppError("This shop is not closed", 409));
  }

  if (!shop.approvedAt) {
    return next(new AppError("This shop has never been approved", 409));
  }

  await shop.update({ status: "active" });

  return res.status(200).json(shop);
});
