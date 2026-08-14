const { Op } = require("sequelize");
const AppError = require("../../utils/appError.util");
const catchAsync = require("../../utils/catchAsync.util");
const Market = require("../../models/market.models");

const MAX_LINES = 20;

/**
 * Turns a list of `{ productId, quantity }` into the rows the order will be
 * built from.
 *
 * Nothing about money comes off the request. The client says what it wants and
 * how many; the price, the title and the seller are read here, from the same
 * table the listing page reads, because a basket is a claim about intent and
 * never a claim about cost.
 */
exports.basket = catchAsync(async (req, res, next) => {
  const { items } = req.body;

  if (!Array.isArray(items) || !items.length) {
    return next(new AppError("Your basket is empty", 406));
  }

  if (items.length > MAX_LINES) {
    return next(new AppError(`One order can hold ${MAX_LINES} listings`, 406));
  }

  const wanted = new Map();

  for (const line of items) {
    const id = Number(line?.productId);
    const quantity = Number(line?.quantity ?? 1);

    if (!Number.isInteger(id) || id < 1) {
      return next(new AppError("That basket has a listing we cannot read", 406));
    }
    if (!Number.isInteger(quantity) || quantity < 1) {
      return next(new AppError("Ask for at least one of each", 406));
    }

    // The same listing twice is one line. Sent that way it would pass the stock
    // check once per line and oversell the difference.
    wanted.set(id, (wanted.get(id) ?? 0) + quantity);
  }

  const products = await Market.Product.findAll({
    where: {
      id: { [Op.in]: [...wanted.keys()] },
      status: "active",
      [Op.or]: [{ shopId: null }, { "$shop.status$": "active" }],
    },
    include: [{ model: Market.Shop, as: "shop", attributes: ["id", "status"], required: false }],
    subQuery: false,
  });

  // Named, not counted. "One item is unavailable" sends someone back to compare
  // a basket against a grid; the title tells them which one to take out.
  const found = new Map(products.map(p => [p.id, p]));
  const gone = [...wanted.keys()].filter(id => !found.has(id));

  if (gone.length) {
    return next(new AppError("Something in your basket is no longer for sale", 409));
  }

  const short = products.filter(p => p.stock < wanted.get(p.id));

  if (short.length) {
    const names = short.map(p => `${p.title} (${p.stock} left)`).join(", ");
    return next(new AppError(`Not enough left: ${names}`, 409));
  }

  const own = products.filter(p => p.accountId === req.sessionAccount.id);

  if (own.length) {
    return next(new AppError("You cannot buy your own listing", 409));
  }

  const currencies = new Set(products.map(p => p.currency));

  if (currencies.size > 1) {
    return next(new AppError("Everything in one order has to be in one currency", 409));
  }

  req.basket = products.map(product => ({ product, quantity: wanted.get(product.id) }));

  next();
});

/** An order this person placed. Resolved from the session, never from the body. */
exports.purchased = catchAsync(async (req, res, next) => {
  const order = await Market.Order.findOne({
    where: { id: req.params.id, accountId: req.sessionAccount.id },
  });

  // Not found rather than forbidden: someone else's order should not be
  // distinguishable from one that does not exist.
  if (!order) return next(new AppError("Order not found", 404));

  req.order = order;

  next();
});

/** A suborder this person is the seller of. */
exports.sold = catchAsync(async (req, res, next) => {
  const suborder = await Market.SubOrder.findOne({
    where: { id: req.params.id, accountId: req.sessionAccount.id },
  });

  if (!suborder) return next(new AppError("Order not found", 404));

  req.suborder = suborder;

  next();
});
