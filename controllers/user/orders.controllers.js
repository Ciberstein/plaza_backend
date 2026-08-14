const catchAsync = require("../../utils/catchAsync.util");
const AppError = require("../../utils/appError.util");
const { db } = require("../../database/config");
const Market = require("../../models/market.models");
const Accounts = require("../../models/accounts.models");
const Geo = require("../../models/geo.models");

/* ─── what an order looks like when it comes back ─────────────────────────── */

const ITEM = {
  model: Market.OrderItem,
  as: "items",
  attributes: ["id", "productId", "title", "unitPrice", "quantity"],
};

// Once the two of them have to meet, each has to be able to reach the other.
const REACHABLE = ["confirmed", "delivered"];

// Everything needed to reach the person, and nothing else about them. Reused
// by both sides, so neither can quietly grow a field the other does not have.
const CONTACT = (as) => ({
  model: Accounts.Account,
  as,
  // Fetched for every row and removed from the ones that have not earned it.
  // Filtering it out of the query would mean a query per status, and getting
  // that wrong leaks somebody's details; getting this wrong shows nothing.
  attributes: ["id", "username", "avatar", "email", "phone"],
  include: [{ model: Geo.Country, as: "phoneCountry", attributes: ["dialCode"], required: false }],
});

/**
 * The number, joined to its dialling code, or nothing.
 *
 * Joined here rather than stored joined, so an administrator editing a code in
 * geo.countries corrects every account at once.
 */
const dialable = (account) =>
  account?.phone ? `${account.phoneCountry?.dialCode ?? ""}${account.phone}` : null;

const BUYER_VIEW = [
  {
    model: Market.SubOrder,
    as: "suborders",
    attributes: ["id", "shopId", "subtotal", "status", "cancelledBy", "cancelReason"],
    include: [
      ITEM,
      { model: Market.Shop, as: "shop", attributes: ["id", "name", "slug", "logo"], required: false },
      CONTACT("seller"),
    ],
  },
];

/**
 * Contact details, once and only once there is a reason for them.
 *
 * A pending order is a request the seller has not answered; handing over a
 * number at that point would turn placing an order into a way of harvesting
 * them. A cancelled one is over. Between confirmed and delivered there are two
 * people who have to arrange a handover, and no way to do it.
 *
 * Both directions, because coordinating takes two: a seller who cannot warn
 * the buyer they are running late has half a phone line.
 */
const contact = (account, status) => {
  const open = REACHABLE.includes(status);

  return {
    ...(account ?? {}),
    // The email is the one everybody has, so it is the one that is always
    // there once there is a reason. The number is extra, and only some people
    // added one.
    email: open ? (account?.email ?? null) : null,
    phone: open ? dialable(account) : null,
    phoneCountry: undefined,
  };
};

const revealPhones = (order) => {
  const plain = order.toJSON();

  plain.suborders = (plain.suborders ?? []).map(part => ({
    ...part,
    seller: contact(part.seller, part.status),
  }));

  return plain;
};

/** The same, seen from the seller's side of the same row. */
const revealBuyer = (suborder) => {
  const plain = suborder.toJSON();

  return {
    ...plain,
    order: plain.order && {
      ...plain.order,
      buyer: contact(plain.order.buyer, plain.status),
    },
  };
};

const ORDER_ATTRS = ["id", "total", "currency", "status", "paidAt", "createdAt"];

const reload = async (id) =>
  revealPhones(
    await Market.Order.findByPk(id, { attributes: ORDER_ATTRS, include: BUYER_VIEW }),
  );

/**
 * An order is done when every part of it is, and called off when every part was.
 *
 * Kept as a derived value rather than a field the endpoints remember to set:
 * an order made of four sellers has four independent stories, and the one word
 * on the front of it can only ever be a summary of them.
 */
const rollUp = async (orderId) => {
  const parts = await Market.SubOrder.findAll({
    where: { orderId },
    attributes: ["status"],
  });

  const every = (s) => parts.length > 0 && parts.every(p => p.status === s);

  const status = every("cancelled")
    ? "cancelled"
    : every("delivered")
      ? "fulfilled"
      : "pending";

  await Market.Order.update({ status }, { where: { id: orderId } });
};

/* ─── buying ──────────────────────────────────────────────────────────────── */

/**
 * Placing an order.
 *
 * One order, split into one suborder per seller and storefront, because that is
 * who each half of it is actually with: they confirm separately, hand over
 * separately, and can call their own part off without touching the rest.
 *
 * Stock comes down now. No money moves online yet, so an order is a promise
 * rather than a receipt — but a promise that does not hold the item back lets
 * three people be promised the same one.
 */
exports.create = catchAsync(async (req, res) => {
  const basket = req.basket;
  const currency = basket[0].product.currency;

  const order = await db.transaction(async (tx) => {
    const total = basket.reduce(
      (sum, line) => sum + Number(line.product.price) * line.quantity,
      0,
    );

    const created = await Market.Order.create(
      {
        accountId: req.sessionAccount.id,
        total: total.toFixed(2),
        currency,
        status: "pending",
      },
      { transaction: tx },
    );

    // Grouped by seller *and* shop: one person selling under their own name and
    // under their shop is two counters, and a buyer deals with each separately.
    const groups = new Map();

    for (const line of basket) {
      const key = `${line.product.accountId}:${line.product.shopId ?? ""}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(line);
    }

    for (const lines of groups.values()) {
      const subtotal = lines.reduce(
        (sum, line) => sum + Number(line.product.price) * line.quantity,
        0,
      );

      const suborder = await Market.SubOrder.create(
        {
          orderId: created.id,
          accountId: lines[0].product.accountId,
          shopId: lines[0].product.shopId ?? null,
          subtotal: subtotal.toFixed(2),
          status: "pending",
        },
        { transaction: tx },
      );

      for (const { product, quantity } of lines) {
        // Title and price are copied, not referenced. What someone agreed to
        // buy has to keep reading the same after the seller edits the listing
        // or deletes it outright.
        await Market.OrderItem.create(
          {
            subOrderId: suborder.id,
            productId: product.id,
            title: product.title,
            unitPrice: product.price,
            quantity,
          },
          { transaction: tx },
        );

        const left = product.stock - quantity;

        await product.update(
          {
            stock: left,
            // The shelf rule, applied here too: nothing at zero stays offered.
            status: left === 0 && product.status === "active" ? "out_of_stock" : product.status,
          },
          { transaction: tx },
        );
      }
    }

    // What was just ordered leaves the basket. Buying now clears the line if
    // one happened to be there, and a basket checkout empties itself, without
    // the page having to remember to ask.
    await Market.CartItem.destroy({
      where: {
        accountId: req.sessionAccount.id,
        productId: basket.map(line => line.product.id),
      },
      transaction: tx,
    });

    return created;
  });

  return res.status(201).json(await reload(order.id));
});

exports.list = catchAsync(async (req, res) => {
  const orders = await Market.Order.findAll({
    where: { accountId: req.sessionAccount.id },
    attributes: ORDER_ATTRS,
    include: BUYER_VIEW,
    order: [["createdAt", "DESC"]],
  });

  return res.status(200).json(orders.map(revealPhones));
});

exports.get = catchAsync(async (req, res) => {
  return res.status(200).json(await reload(req.order.id));
});

/* ─── calling it off ──────────────────────────────────────────────────────── */

/**
 * Who may still call it off, and when.
 *
 * The two are not symmetric on purpose. Until the seller answers, nothing has
 * been committed to and the buyer may walk away. Once they accept, the seller
 * has set stock aside and may have turned down someone else for it, so the
 * buyer is held to it and only the seller can release them.
 *
 * A delivered part is history either way, and undoing history is a refund,
 * which is a different thing this does not do yet.
 */
const BUYER_MAY_CANCEL = ["pending"];
const SELLER_MAY_CANCEL = ["pending", "confirmed"];

/**
 * Putting the stock back.
 *
 * The listing may have been archived, deleted or edited since, so the quantity
 * is added to whatever is there now rather than assumed. A product that no
 * longer exists is skipped: the sale is off either way, and there is no shelf
 * left to return it to.
 */
const restock = async (subOrderId, tx) => {
  const items = await Market.OrderItem.findAll({
    where: { subOrderId },
    transaction: tx,
  });

  for (const item of items) {
    if (!item.productId) continue;

    const product = await Market.Product.findByPk(item.productId, { transaction: tx });
    if (!product) continue;

    const back = product.stock + item.quantity;

    await product.update(
      {
        stock: back,
        status: product.status === "out_of_stock" && back > 0 ? "active" : product.status,
      },
      { transaction: tx },
    );
  }
};

const cancel = async (suborder, by, reason) => {
  await db.transaction(async (tx) => {
    await restock(suborder.id, tx);
    await suborder.update(
      {
        status: "cancelled",
        cancelledBy: by,
        cancelReason: reason?.trim() || null,
      },
      { transaction: tx },
    );
  });

  await rollUp(suborder.orderId);
};

/**
 * The buyer calling off one seller's part of their order.
 *
 * Per suborder rather than per order: an order that reached four sellers is
 * four agreements, and backing out of one is not backing out of the others.
 */
exports.cancelAsBuyer = catchAsync(async (req, res, next) => {
  const suborder = await Market.SubOrder.findOne({
    where: { id: req.params.subOrderId, orderId: req.order.id },
  });

  if (!suborder) return next(new AppError("That part of the order does not exist", 404));

  if (suborder.status === "confirmed") {
    return next(
      new AppError(
        "The seller already accepted this order. Only they can cancel it now.",
        409,
      )
    );
  }

  if (!BUYER_MAY_CANCEL.includes(suborder.status)) {
    return next(new AppError(`This part is ${suborder.status} and cannot be cancelled`, 409));
  }

  await cancel(suborder, "buyer", req.body.reason);

  return res.status(200).json(await reload(req.order.id));
});

/* ─── selling ─────────────────────────────────────────────────────────────── */

const SELLER_VIEW = [
  ITEM,
  { model: Market.Shop, as: "shop", attributes: ["id", "name", "slug", "logo"], required: false },
  {
    model: Market.Order,
    as: "order",
    attributes: ["id", "currency", "createdAt"],
    include: [CONTACT("buyer")],
  },
];

const SUBORDER_ATTRS = [
  "id", "orderId", "shopId", "subtotal", "status", "cancelledBy", "cancelReason", "createdAt",
];

const reloadSale = async (id) =>
  revealBuyer(
    await Market.SubOrder.findByPk(id, { attributes: SUBORDER_ATTRS, include: SELLER_VIEW }),
  );

exports.sales = catchAsync(async (req, res) => {
  const sales = await Market.SubOrder.findAll({
    where: { accountId: req.sessionAccount.id },
    attributes: SUBORDER_ATTRS,
    include: SELLER_VIEW,
    order: [["createdAt", "DESC"]],
  });

  return res.status(200).json(sales.map(revealBuyer));
});

exports.confirm = catchAsync(async (req, res, next) => {
  if (req.suborder.status !== "pending") {
    return next(new AppError(`This order is ${req.suborder.status} already`, 409));
  }

  await req.suborder.update({ status: "confirmed" });
  await rollUp(req.suborder.orderId);

  return res.status(200).json(await reloadSale(req.suborder.id));
});

exports.deliver = catchAsync(async (req, res, next) => {
  if (req.suborder.status !== "confirmed") {
    return next(new AppError("Confirm the order before marking it delivered", 409));
  }

  await req.suborder.update({ status: "delivered" });
  await rollUp(req.suborder.orderId);

  return res.status(200).json(await reloadSale(req.suborder.id));
});

/** The seller backing out. Same rules, same stock returned, other name on it. */
exports.cancelAsSeller = catchAsync(async (req, res, next) => {
  if (!SELLER_MAY_CANCEL.includes(req.suborder.status)) {
    return next(new AppError(`This order is ${req.suborder.status} and cannot be cancelled`, 409));
  }

  await cancel(req.suborder, "seller", req.body.reason);

  return res.status(200).json(await reloadSale(req.suborder.id));
});
