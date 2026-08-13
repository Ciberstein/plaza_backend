const catchAsync = require("../../utils/catchAsync.util");
const AppError = require("../../utils/appError.util");
const Market = require("../../models/market.models");
const Accounts = require("../../models/accounts.models");

const SHOP_ATTRS = [
  "id", "name", "slug", "description", "logo",
  "category", "city", "shipping", "status", "createdAt",
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
  const { name, slug, description, category, city, shipping } = req.body;

  const shop = await Market.Shop.create({
    accountId: req.sessionAccount.id,
    name,
    slug,
    description: description?.trim() || null,
    category,
    city,
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
  const { name, description, status, category, city, shipping } = req.body;

  const updates = {};

  if (name?.trim()) updates.name = name.trim();
  if (description !== undefined) updates.description = description?.trim() || null;

  if (category) {
    if (!Market.SHOP_CATEGORY.includes(category))
      return next(new AppError("Pick a category from the list", 406));
    updates.category = category;
  }

  if (city) updates.city = city;

  if (shipping) {
    if (!Market.SHIPPING_MODE.includes(shipping))
      return next(new AppError("Pick a delivery option from the list", 406));
    updates.shipping = shipping;
  }

  if (status) {
    if (!Market.SHOP_STATUS.includes(status)) {
      return next(new AppError(`Status must be one of: ${Market.SHOP_STATUS.join(", ")}`, 406));
    }
    // Suspension is a moderation decision, not something a seller grants
    // themselves back.
    if (status === "suspended") {
      return next(new AppError("A shop cannot suspend itself", 403));
    }
    if (req.shop.status === "suspended") {
      return next(new AppError("This shop is suspended", 403));
    }
    updates.status = status;
  }

  // The slug is deliberately absent: it is the address people saved.

  await req.shop.update(updates);

  return res.status(200).json(req.shop);
});
