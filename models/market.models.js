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
// paused is the seller's own decision to hide a listing; out_of_stock is not a
// decision at all. Keeping them apart is what lets the interface say which of
// the two happened instead of one word that could mean either.
//
//   draft         never published, only the seller sees it
//   active        on the square
//   paused        the seller took it down for now
//   out_of_stock  nothing left to sell, set and cleared by the stock alone
//   archived      put away, not expected back soon
const PRODUCT_STATUS = ["draft", "active", "paused", "out_of_stock", "archived"];

// How worn the thing is. Required of every listing and never defaulted: a
// default here would mark everything second-hand as new by inattention, which
// is precisely the lie the field exists to prevent.
const PRODUCT_CONDITION = ["new", "like_new", "good", "acceptable", "for_parts"];

// How the seller is willing to hand the thing over. Several at once, because
// most people who will post a parcel will also meet you in a cafe.
const DELIVERY_OPTION = ["shipping", "door_delivery", "door_pickup", "public_meetup"];
const ORDER_STATUS = ["pending", "paid", "fulfilled", "cancelled", "refunded"];
// No money changes hands online yet, so `paid` sits unused and `confirmed` is
// the event that matters: the seller saying yes. Both sides may cancel, and
// either way the stock goes back on the shelf.
//
//   pending    the buyer asked, the seller has not answered
//   confirmed  the seller accepted; they arrange the handover
//   delivered  done
//   cancelled  called off by either side
const SUBORDER_STATUS = [
  "pending", "confirmed", "paid", "shipped", "delivered", "cancelled", "refunded",
];

// Either side may call a purchase off, and which one did changes what the other
// should do about it. "Cancelled" on its own does not say whether the seller
// backed out or the buyer changed their mind.
const CANCELLED_BY = ["buyer", "seller"];

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
    // Nullable in the column, required by the form. Rows written before the
    // field existed have none, and backfilling them with a guess would be
    // inventing a fact about someone else's goods.
    condition: {
      type: DataTypes.STRING,
      allowNull: true,
      validate: { isIn: [PRODUCT_CONDITION] },
      field: "condition",
    },
    // A Postgres array rather than a join table: the set is fixed, short, and
    // never queried on its own. A table would be four rows of ceremony per
    // listing to store what is really one answer.
    delivery: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: false,
      defaultValue: [],
      validate: {
        known(value) {
          if (!Array.isArray(value)) throw new Error("Delivery must be a list");
          const bad = value.filter(v => !DELIVERY_OPTION.includes(v));
          if (bad.length) throw new Error(`Unknown delivery option: ${bad.join(", ")}`);
        },
      },
      field: "delivery",
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
    // The seller, and the only thing that has to be there. A suborder used to
    // hang off a shop, which quietly made every purchase require one — and on
    // Plaza most people sell under their own name. This mirrors how a product
    // is built for exactly the same reason.
    accountId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "accountId",
    },
    // The brand it was bought under, if there was one. One suborder per seller
    // *and* storefront: the same person selling one thing under their name and
    // another under their shop is two different counters to walk up to.
    shopId: {
      type: DataTypes.INTEGER,
      allowNull: true,
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
    cancelledBy: {
      type: DataTypes.STRING,
      allowNull: true,
      validate: { isIn: [CANCELLED_BY] },
      field: "cancelledBy",
    },
    // Optional, from either side. Nobody is made to justify themselves, but a
    // cancellation with a line of explanation is the difference between a dead
    // end and something the other person can act on.
    cancelReason: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "cancelReason",
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

/**
 * A basket, on the server.
 *
 * It lived in the browser first, which was wrong the moment pausing a listing
 * had to empty it out of every basket holding it: nothing on this side can
 * reach into someone else's localStorage. A row per person per listing can be
 * deleted by whoever needs it gone.
 *
 * Quantity lives here rather than being a row per unit, because a basket is a
 * statement of intent and "three of these" is one intent.
 */
const CartItem = db.define(
  "cart_items",
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
    productId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "productId",
    },
    quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
      field: "quantity",
    },
  },
  {
    tableName: "cart_items",
    schema: "market",
    indexes: [{ unique: true, fields: ["accountId", "productId"] }],
  }
);

/**
 * Something someone wants to come back to.
 *
 * A join table and nothing else: no note, no list name, no position. Wanting
 * something later is one bit of information, and the moment a favourite grows
 * fields it stops being a bookmark and becomes a feature nobody asked for.
 *
 * The pair is unique, so favouriting twice is the same as favouriting once and
 * the database says so rather than the endpoint remembering to.
 */
const Favourite = db.define(
  "favourites",
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
    productId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "productId",
    },
  },
  {
    tableName: "favourites",
    schema: "market",
    indexes: [{ unique: true, fields: ["accountId", "productId"] }],
  }
);

const Market = {
  Shop, Product, ProductImage, Favourite, CartItem, Order, SubOrder, OrderItem,
  MAX_PRODUCT_IMAGES,
  SHOP_STATUS, PRODUCT_STATUS, ORDER_STATUS, SUBORDER_STATUS,
  PRODUCT_CONDITION, DELIVERY_OPTION, CANCELLED_BY,
  SHIPPING_MODE,
};

module.exports = Market;
