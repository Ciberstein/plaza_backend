const { DataTypes } = require("sequelize");
const { db } = require("../database/config");

// Vocabulary the controllers and the frontend both read from here, so a status
// is never a loose string typed twice. Plain validated strings rather than a
// Postgres ENUM: adding a state to an ENUM needs an ALTER TYPE migration and
// these will grow.
const SHOP_STATUS = ["draft", "active", "suspended", "closed"];
const PRODUCT_STATUS = ["draft", "active", "out_of_stock", "archived"];
const ORDER_STATUS = ["pending", "paid", "fulfilled", "cancelled", "refunded"];
const SUBORDER_STATUS = ["pending", "paid", "shipped", "delivered", "cancelled", "refunded"];

// What a shopper browses by. A shop declares the one most of its stock belongs
// to; a product can still sit in another.
const SHOP_CATEGORY = ["home", "tech", "fashion", "beauty", "sports", "tools", "food"];

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
    category: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: { isIn: [SHOP_CATEGORY] },
      field: "category",
    },
    // Stored as a slug rather than a free string so that two sellers cannot
    // write "Bogota" and "Bogotá" and end up in different filters.
    city: {
      type: DataTypes.STRING,
      allowNull: false,
      field: "city",
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
    // Every row in this schema carries the shop it belongs to. It is the line
    // that keeps one seller's catalogue out of another's.
    shopId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "shopId",
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

const Market = {
  Shop, Product, Order, SubOrder, OrderItem,
  SHOP_STATUS, PRODUCT_STATUS, ORDER_STATUS, SUBORDER_STATUS,
  SHOP_CATEGORY, SHIPPING_MODE,
};

module.exports = Market;
