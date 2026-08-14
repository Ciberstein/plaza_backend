const catchAsync = require("../../utils/catchAsync.util");
const AppError = require("../../utils/appError.util");
const Market = require("../../models/market.models");
const Accounts = require("../../models/accounts.models");

const PRODUCT = {
  model: Market.Product,
  as: "product",
  attributes: ["id", "title", "price", "currency", "stock", "status", "condition", "shopId"],
  include: [
    // The shop's status comes along because a listing is only really on sale
    // when its brand is open too.
    { model: Market.Shop, as: "shop", attributes: ["id", "name", "slug", "status"], required: false },
    { model: Accounts.Account, as: "seller", attributes: ["id", "username"] },
  ],
};

/**
 * What a saved listing is allowed to be, from the outside.
 *
 * Paused survives the list: it is the seller saying "not right now", the page
 * can still be opened, and dropping the bookmark on their behalf would be
 * deciding for the person who saved it. Anything else — drafted, out of stock,
 * archived, or behind a shop that closed — is not the public's business, so the
 * row is left out entirely rather than shown as a ghost.
 */
const stateOf = (product) => {
  if (!product) return null;
  if (product.shopId && product.shop?.status !== "active") return null;
  if (!["active", "paused"].includes(product.status)) return null;

  return product.status;
};

/**
 * Just the ids.
 *
 * Every grid on the site needs to know which hearts are filled, and it needs to
 * know before it paints. Sending the whole favourite list for that would be a
 * page of joins to answer a question that fits in an array of numbers.
 */
exports.ids = catchAsync(async (req, res) => {
  const rows = await Market.Favourite.findAll({
    where: { accountId: req.sessionAccount.id },
    attributes: ["productId"],
  });

  return res.status(200).json(rows.map(row => row.productId));
});

exports.list = catchAsync(async (req, res) => {
  const rows = await Market.Favourite.findAll({
    where: { accountId: req.sessionAccount.id },
    attributes: ["id", "productId", "createdAt"],
    include: [PRODUCT],
    order: [["createdAt", "DESC"]],
  });

  // The covers in one more query. A hasMany joined onto this would multiply
  // every favourite by its photographs.
  const covers = await Market.ProductImage.findAll({
    where: { productId: rows.map(row => row.productId), position: 0 },
    attributes: ["productId", "url"],
  });

  const coverOf = new Map(covers.map(cover => [cover.productId, cover.url]));

  return res.status(200).json(
    rows
      .map(row => ({ row, state: stateOf(row.product) }))
      // Gone for everyone but its seller, so gone from here too. The favourite
      // row stays in the table: if the seller brings the listing back, so does
      // this, without anyone having to save it twice.
      .filter(({ state }) => state !== null)
      .map(({ row, state }) => ({
        ...row.toJSON(),
        state,
        product: {
          ...row.product.toJSON(),
          cover: coverOf.get(row.productId) ?? null,
        },
      }))
  );
});

/**
 * Idempotent on purpose. A heart that is already filled and gets clicked again
 * by a double tap or a retried request should stay filled, not error.
 */
exports.add = catchAsync(async (req, res, next) => {
  const product = await Market.Product.findByPk(req.params.productId, {
    attributes: ["id", "accountId"],
  });

  if (!product) return next(new AppError("Listing not found", 404));

  if (product.accountId === req.sessionAccount.id) {
    return next(new AppError("You cannot favourite your own listing", 409));
  }

  await Market.Favourite.findOrCreate({
    where: { accountId: req.sessionAccount.id, productId: product.id },
  });

  return res.status(201).json({ productId: product.id });
});

/** Also idempotent: removing something that is not there is the state asked for. */
exports.remove = catchAsync(async (req, res) => {
  await Market.Favourite.destroy({
    where: { accountId: req.sessionAccount.id, productId: req.params.productId },
  });

  return res.status(204).send();
});
