const catchAsync = require("../../utils/catchAsync.util");
const AppError = require("../../utils/appError.util");
const Market = require("../../models/market.models");
const Accounts = require("../../models/accounts.models");

const MAX_LINES = 20;

const PRODUCT = {
  model: Market.Product,
  as: "product",
  attributes: ["id", "title", "price", "currency", "stock", "status", "condition", "shopId"],
  include: [
    { model: Market.Shop, as: "shop", attributes: ["id", "name", "slug", "status"], required: false },
    { model: Accounts.Account, as: "seller", attributes: ["id", "username"] },
  ],
};

/** On sale right now, which is the only thing a basket may hold. */
const buyable = (product) =>
  Boolean(product) &&
  product.status === "active" &&
  (!product.shopId || product.shop?.status === "active");

/**
 * Everything in this person's basket, with the covers.
 *
 * Anything no longer on sale is deleted on the way out rather than returned
 * greyed out. The rule is that a listing leaving the square leaves every basket
 * holding it, and this is the sweep for whatever slipped through — an order
 * that emptied the shelf, a shop that closed, a row written before the rule
 * existed.
 */
exports.list = catchAsync(async (req, res) => {
  const rows = await Market.CartItem.findAll({
    where: { accountId: req.sessionAccount.id },
    attributes: ["id", "productId", "quantity", "createdAt"],
    include: [PRODUCT],
    order: [["createdAt", "ASC"]],
  });

  const stale = rows.filter(row => !buyable(row.product));

  if (stale.length) {
    await Market.CartItem.destroy({ where: { id: stale.map(row => row.id) } });
  }

  const live = rows.filter(row => buyable(row.product));

  const covers = await Market.ProductImage.findAll({
    where: { productId: live.map(row => row.productId), position: 0 },
    attributes: ["productId", "url"],
  });

  const coverOf = new Map(covers.map(cover => [cover.productId, cover.url]));

  return res.status(200).json({
    items: live.map(row => ({
      ...row.toJSON(),
      product: { ...row.product.toJSON(), cover: coverOf.get(row.productId) ?? null },
    })),
    // Said rather than inferred, so the page can explain a basket that shrank
    // between one visit and the next.
    removed: stale.length,
  });
});

/** Only the count, for the badge in the header. */
exports.count = catchAsync(async (req, res) => {
  const rows = await Market.CartItem.findAll({
    where: { accountId: req.sessionAccount.id },
    attributes: ["quantity"],
  });

  return res.status(200).json({ count: rows.reduce((sum, row) => sum + row.quantity, 0) });
});

/**
 * Putting something in, or asking for more of it.
 *
 * `quantity` is added to whatever is already there, so pressing the button
 * twice means two, which is what pressing it twice looks like it should mean.
 */
exports.add = catchAsync(async (req, res, next) => {
  const quantity = Number(req.body.quantity ?? 1);

  if (!Number.isInteger(quantity) || quantity < 1) {
    return next(new AppError("Ask for at least one", 406));
  }

  const product = await Market.Product.findByPk(req.params.productId, {
    include: [{ model: Market.Shop, as: "shop", attributes: ["status"], required: false }],
  });

  if (!buyable(product)) return next(new AppError("That listing is not for sale", 409));

  // A basket is for things that get packed together and carried away. A
  // service is an arrangement with one person about their time, and it is
  // asked for directly rather than collected — there is no version of "three
  // caregivers and a pair of headphones" that means anything to anybody.
  if (product.kind === "service") {
    return next(new AppError("A service is requested directly, not added to a basket", 409));
  }

  if (product.accountId === req.sessionAccount.id) {
    return next(new AppError("You cannot buy your own listing", 409));
  }

  const [line, fresh] = await Market.CartItem.findOrCreate({
    where: { accountId: req.sessionAccount.id, productId: product.id },
    defaults: { quantity: Math.min(quantity, product.stock) },
  });

  if (!fresh) {
    await line.update({ quantity: Math.min(line.quantity + quantity, product.stock) });
  }

  const lines = await Market.CartItem.count({ where: { accountId: req.sessionAccount.id } });

  if (lines > MAX_LINES) {
    await line.destroy();
    return next(new AppError(`A basket holds ${MAX_LINES} listings`, 409));
  }

  return res.status(201).json({ productId: product.id, quantity: line.quantity });
});

/** Setting the number outright, which is what a stepper does. */
exports.setQuantity = catchAsync(async (req, res, next) => {
  const quantity = Number(req.body.quantity);

  if (!Number.isInteger(quantity) || quantity < 0) {
    return next(new AppError("Give a whole number", 406));
  }

  const line = await Market.CartItem.findOne({
    where: { accountId: req.sessionAccount.id, productId: req.params.productId },
    include: [PRODUCT],
  });

  if (!line) return next(new AppError("That is not in your basket", 404));

  // Zero is how a stepper says remove, and refusing it would make the person
  // find another button for something they already asked for.
  if (quantity === 0) {
    await line.destroy();
    return res.status(200).json({ productId: Number(req.params.productId), quantity: 0 });
  }

  if (quantity > line.product.stock) {
    return next(new AppError(`Only ${line.product.stock} left`, 409));
  }

  await line.update({ quantity });

  return res.status(200).json({ productId: line.productId, quantity });
});

exports.remove = catchAsync(async (req, res) => {
  await Market.CartItem.destroy({
    where: { accountId: req.sessionAccount.id, productId: req.params.productId },
  });

  return res.status(204).send();
});

exports.clear = catchAsync(async (req, res) => {
  await Market.CartItem.destroy({ where: { accountId: req.sessionAccount.id } });

  return res.status(204).send();
});
