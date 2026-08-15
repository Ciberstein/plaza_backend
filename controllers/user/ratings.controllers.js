const { Op } = require("sequelize");
const catchAsync = require("../../utils/catchAsync.util");
const AppError = require("../../utils/appError.util");
const Market = require("../../models/market.models");

/**
 * Reputation, written only by people who actually dealt with the other side.
 *
 * Every check here is against an order that reached `delivered`. Nothing is
 * taken on the client's word: not who was rated, not whether the thing was
 * bought, not whether the transaction is over. A review system whose entry
 * condition can be asserted by the reviewer is a review system with no
 * information in it.
 */

// What comes back to a browser. The author's id is not on the list: their name
// is shown, and their account id is nobody's business.
const RATING_FIELDS = ["id", "subOrderId", "sellerId", "stars", "comment", "createdAt"];
const REVIEW_FIELDS = ["id", "productId", "stars", "body", "createdAt"];

const publicly = (row, fields) => {
  const plain = row.toJSON();
  return Object.fromEntries(fields.map(f => [f, plain[f]]));
};

/**
 * One to five, and a whole number.
 *
 * Parsed rather than trusted: `stars: "4"` from a form and `stars: 4.7` from a
 * script both have to land on the same column, and the column is an integer.
 */
const starsFrom = (value) => {
  const stars = Number(value);
  if (!Number.isInteger(stars)) return null;
  if (stars < Market.MIN_STARS || stars > Market.MAX_STARS) return null;
  return stars;
};

const wordsFrom = (value) => {
  const text = String(value ?? "").trim();
  if (!text) return null;
  return text.slice(0, Market.COMMENT_MAX);
};

/**
 * Rating the person who sold to you.
 *
 * The suborder is the whole permission: it names the seller, it proves the
 * transaction, and being unique on the rating means this one cannot be rated
 * twice. All three come from one lookup that also checks the caller is the
 * buyer on it.
 */
exports.rateSeller = catchAsync(async (req, res, next) => {
  const stars = starsFrom(req.body.stars);

  if (stars === null) {
    return next(
      new AppError(`Give it between ${Market.MIN_STARS} and ${Market.MAX_STARS} stars`, 406)
    );
  }

  const suborder = await Market.SubOrder.findByPk(req.body.subOrderId, {
    attributes: ["id", "orderId", "accountId", "shopId", "status"],
    include: [
      {
        model: Market.Order,
        as: "order",
        attributes: ["id", "accountId"],
      },
    ],
  });

  // 404 for "no such part" and for "not yours" alike, so this cannot be used to
  // find out what other people bought.
  if (!suborder || suborder.order?.accountId !== req.sessionAccount.id) {
    return next(new AppError("That order does not exist", 404));
  }

  if (suborder.status !== "delivered") {
    return next(
      new AppError("You can rate a seller once the order is complete", 409)
    );
  }

  // Cannot happen through the site, and is worth refusing anyway: an account
  // that could rate itself is a reputation anybody can write.
  if (suborder.accountId === req.sessionAccount.id) {
    return next(new AppError("You cannot rate yourself", 409));
  }

  const existing = await Market.SellerRating.findOne({
    where: { subOrderId: suborder.id },
    attributes: ["id"],
  });

  // Refused rather than overwritten. A rating that can be revised is one a
  // seller can lean on the buyer to revise.
  if (existing) {
    return next(new AppError("You already rated this order", 409));
  }

  // Both columns, always. `sellerId` is who was rated; `shopId` is the brand
  // they were trading under, when there was one, and it is what the shop's
  // average groups by. Writing both means a rating survives a shop closing —
  // the average falls back to the person it was left for rather than vanishing.
  const rating = await Market.SellerRating.create({
    subOrderId: suborder.id,
    sellerId: suborder.accountId,
    shopId: suborder.shopId ?? null,
    accountId: req.sessionAccount.id,
    stars,
    comment: wordsFrom(req.body.comment),
  });

  return res.status(201).json(publicly(rating, RATING_FIELDS));
});

/**
 * Reviewing a thing you bought.
 *
 * "Bought" means an order line for this listing, in a part that reached
 * delivered, on an order belonging to this account. Which purchase it was does
 * not matter and is not recorded — the review is one person's opinion of one
 * listing, so buying it four times still leaves one.
 */
exports.reviewProduct = catchAsync(async (req, res, next) => {
  const stars = starsFrom(req.body.stars);

  if (stars === null) {
    return next(
      new AppError(`Give it between ${Market.MIN_STARS} and ${Market.MAX_STARS} stars`, 406)
    );
  }

  const productId = Number(req.body.productId);

  if (!Number.isInteger(productId)) {
    return next(new AppError("That listing does not exist", 404));
  }

  const bought = await Market.OrderItem.findOne({
    where: { productId },
    attributes: ["id"],
    include: [
      {
        model: Market.SubOrder,
        as: "suborder",
        attributes: ["id"],
        required: true,
        where: { status: "delivered" },
        include: [
          {
            model: Market.Order,
            as: "order",
            attributes: ["id"],
            required: true,
            where: { accountId: req.sessionAccount.id },
          },
        ],
      },
    ],
  });

  if (!bought) {
    return next(
      new AppError("You can only review something you bought and received", 403)
    );
  }

  const existing = await Market.ProductReview.findOne({
    where: { productId, accountId: req.sessionAccount.id },
    attributes: ["id"],
  });

  if (existing) {
    return next(new AppError("You already reviewed this listing", 409));
  }

  const review = await Market.ProductReview.create({
    productId,
    accountId: req.sessionAccount.id,
    stars,
    body: wordsFrom(req.body.body),
  });

  return res.status(201).json(publicly(review, REVIEW_FIELDS));
});

/**
 * What this person still owes an opinion on.
 *
 * The purchases screen needs to know which of its cards to put a button on,
 * and asking it to work that out from the orders alone would mean shipping it
 * every rating anyone ever left. Two arrays of ids answer it.
 */
exports.mine = catchAsync(async (req, res) => {
  const orders = await Market.Order.findAll({
    where: { accountId: req.sessionAccount.id },
    attributes: ["id"],
  });

  const orderIds = orders.map(o => o.id);

  if (!orderIds.length) return res.status(200).json({ ratedParts: [], reviewed: [] });

  const parts = await Market.SubOrder.findAll({
    where: { orderId: { [Op.in]: orderIds } },
    attributes: ["id"],
    include: [{ model: Market.SellerRating, as: "rating", attributes: ["id"], required: true }],
  });

  const reviews = await Market.ProductReview.findAll({
    where: { accountId: req.sessionAccount.id },
    attributes: ["productId"],
  });

  return res.status(200).json({
    ratedParts: parts.map(p => p.id),
    reviewed: reviews.map(r => r.productId),
  });
});
