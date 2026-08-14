const { DataTypes } = require("sequelize");
const { db } = require("../database/config");

// Vocabulary the controllers and the frontend both read from here, so a status
// is never a loose string typed twice. Plain validated strings rather than a
// Postgres ENUM: adding a state to an ENUM needs an ALTER TYPE migration and
// these will grow.
// A shop is a brand other people are asked to trust, so it does not go live
// because its owner said so. Anyone can sell under their own name without any
// of this; opening a shop is the step that needs a human to approve it.
//
//   draft     being set up, only the owner sees it
//   pending   submitted, waiting on an administrator
//   rejected  refused, with a note saying what to fix; can be resubmitted
//   active    approved and listed
//   suspended moderation decision taken after approval
//   closed    the owner took it down
const SHOP_STATUS = ["draft", "pending", "rejected", "active", "suspended", "closed"];
const PRODUCT_STATUS = ["draft", "active", "out_of_stock", "archived"];
const ORDER_STATUS = ["pending", "paid", "fulfilled", "cancelled", "refunded"];
const SUBORDER_STATUS = ["pending", "paid", "shipped", "delivered", "cancelled", "refunded"];

// How this seller gets an order to a buyer by default. Set per shop rather than
// per product because it follows from how the seller works, not from the item.
const SHIPPING_MODE = ["seller", "plaza", "pickup"];

const Shop = db.define(
  "shops",
  {
    id: {
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
      type: DataTypes.INTEGER,
      field: "id",
    },
    // The seller. A buyer becomes one by opening a shop, so there is no second
    // account table — the same person does both and duplicating them would
    // mean two sessions.
    accountId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "accountId",
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      field: "name",
    },
    // What the storefront is reached by. Unique across the marketplace, which
    // is why it is a column and not derived from the name at read time.
    slug: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      field: "slug",
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "description",
    },
    logo: {
      type: DataTypes.STRING,
      allowNull: true,
      field: "logo",
    },
    logo_id: {
      type: DataTypes.STRING,
      allowNull: true,
      field: "logo_id",
    },
    // Where the shop is based. A reference to geo.cities rather than a string:
    // two sellers typing "Bogota" and "Bogotá" would otherwise land in
    // different filters. Optional, because a shop that only ships nationally
    // has no useful address to show.
    cityId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "cityId",
    },
    shipping: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "seller",
      validate: { isIn: [SHIPPING_MODE] },
      field: "shipping",
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "draft",
      validate: { isIn: [SHOP_STATUS] },
      field: "status",
    },
    submittedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "submittedAt",
    },
    // Set the first time an administrator approves it. Its presence is what
    // lets a closed shop reopen without going back through review.
    approvedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "approvedAt",
    },
    // Why it was refused. Shown to the owner, because "rejected" with no reason
    // gives them nothing to act on and guarantees they resubmit it unchanged.
    reviewNote: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "reviewNote",
    },
    reviewedBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "reviewedBy",
    },
  },
  {
    tableName: "shops",
    schema: "market",
  }
);

const Product = db.define(
  "products",
  {
    id: {
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
      type: DataTypes.INTEGER,
      field: "id",
    },
    // The seller. An account is enough to list something — a shop is a brand a
    // seller may choose to trade under, not a requirement to trade at all.
    // This is the column that keeps one seller's catalogue out of another's.
    accountId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "accountId",
    },
    // Null means the listing is sold by the person directly, under their
    // username and avatar. Set means it is sold under a shop's name and logo.
    shopId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "shopId",
    },
    categoryId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "categoryId",
    },
    // Where it ships from. On the product rather than the seller, because the
    // same person can list something they are storing in another city.
    cityId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "cityId",
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false,
      field: "title",
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "description",
    },
    // Money is DECIMAL, never FLOAT: a rounding drift on a price is not a
    // cosmetic bug.
    price: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      field: "price",
    },
    currency: {
      type: DataTypes.STRING(3),
      allowNull: false,
      defaultValue: "COP",
      field: "currency",
    },
    stock: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: "stock",
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "draft",
      validate: { isIn: [PRODUCT_STATUS] },
      field: "status",
    },
  },
  {
    tableName: "products",
    schema: "market",
  }
);

const Order = db.define(
  "orders",
  {
    id: {
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
      type: DataTypes.INTEGER,
      field: "id",
    },
    accountId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "accountId",
    },
    // Sum of its suborders, stored rather than recomputed: what the buyer was
    // charged must not change because a seller edited a price afterwards.
    total: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
      field: "total",
    },
    currency: {
      type: DataTypes.STRING(3),
      allowNull: false,
      defaultValue: "COP",
      field: "currency",
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "pending",
      validate: { isIn: [ORDER_STATUS] },
      field: "status",
    },
    paidAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "paidAt",
    },
  },
  {
    tableName: "orders",
    schema: "market",
  }
);

// A cart crossing three sellers is three fulfilments and three payouts. Keeping
// them as one flat order works until the first partial refund, and after that
// it is very hard to unpick.
const SubOrder = db.define(
  "suborders",
  {
    id: {
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
      type: DataTypes.INTEGER,
      field: "id",
    },
    orderId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "orderId",
    },
    shopId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "shopId",
    },
    subtotal: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
      field: "subtotal",
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "pending",
      validate: { isIn: [SUBORDER_STATUS] },
      field: "status",
    },
    shippedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "shippedAt",
    },
  },
  {
    tableName: "suborders",
    schema: "market",
  }
);

const OrderItem = db.define(
  "order_items",
  {
    id: {
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
      type: DataTypes.INTEGER,
      field: "id",
    },
    subOrderId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "subOrderId",
    },
    productId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "productId",
    },
    // Title and price are copied, not joined. A product renamed or repriced
    // later must not rewrite an order that was already placed, and a deleted
    // product must still show what was bought.
    title: {
      type: DataTypes.STRING,
      allowNull: false,
      field: "title",
    },
    unitPrice: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      field: "unitPrice",
    },
    quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
      field: "quantity",
    },
  },
  {
    tableName: "order_items",
    schema: "market",
  }
);

// A listing's photographs, in the order the seller arranged them.
//
// Its own table rather than a column on the product: a listing needs several
// photographs, the seller reorders them, and each one is a file in Cloudinary
// that has to be destroyed individually when it goes. None of that survives
// being an array inside a row.
const ProductImage = db.define(
  "product_images",
  {
    id: {
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
      type: DataTypes.INTEGER,
      field: "id",
    },
    productId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "productId",
    },
    url: {
      type: DataTypes.STRING,
      allowNull: false,
      field: "url",
    },
    // Cloudinary's handle for the file. Kept so removing the row can destroy
    // the asset with it, the same way a shop logo does.
    publicId: {
      type: DataTypes.STRING,
      allowNull: false,
      field: "publicId",
    },
    // Zero is the cover. Explicit rather than "whichever row comes back first",
    // because without an ORDER BY the database returns them in whatever order
    // suits it, and the cover would change between requests.
    position: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: "position",
    },
  },
  {
    tableName: "product_images",
    schema: "market",
  }
);

// How many photographs one listing may carry. Enforced in the middleware; kept
// here so the limit is stated next to the thing it limits.
const MAX_PRODUCT_IMAGES = 8;

const Market = {
  Shop, Product, ProductImage, Order, SubOrder, OrderItem,
  MAX_PRODUCT_IMAGES,
  SHOP_STATUS, PRODUCT_STATUS, ORDER_STATUS, SUBORDER_STATUS,
  SHIPPING_MODE,
};

module.exports = Market;
