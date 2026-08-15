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

// What is being sold. A listing is a thing or it is somebody's time, and
// almost everything else about it follows from which.
//
//   good     an object. It has a condition, a shelf, and a way of travelling.
//   service  work. It has a rate, no shelf, and a place it is carried out.
//
// One column on one table rather than two tables: a basket line, a favourite,
// a photograph, an order line and a question all point at a listing, and
// making that pointer mean two things would make five relationships
// polymorphic to spare four columns.
// A property joins them for the same reason and is the case that tests it: of
// this table's fifteen columns it uses ten unchanged, and of the six tables
// pointing at a listing it wants three — photographs, favourites and
// questions. Giving it a table of its own would have meant duplicating the
// upload pipeline and the question thread to spare five null columns.
//
// What it does not share lives in `market.properties`, one row to one listing.
const LISTING_KIND = ["good", "service", "property"];

// What the price of a service buys. `job` is the fixed quote — a bathroom
// retiled, a portrait shot — where hours are the provider's problem and not
// something the buyer is billed for.
const RATE_UNIT = ["hour", "day", "job"];

// How the seller is willing to hand the thing over. Several at once, because
// most people who will post a parcel will also meet you in a cafe.
const DELIVERY_OPTION = ["shipping", "door_delivery", "door_pickup", "public_meetup"];

// The same question asked of a service: not how it travels, because it does
// not, but where the two of you are when the work happens.
const SERVICE_OPTION = ["at_client", "at_provider", "remote"];

// Which set a listing's `delivery` column is checked against. The column holds
// one answer to one question — how the two of you meet — and what counts as a
// valid answer depends on whether there is a parcel or a person.
// A property answers no such question: nothing is handed over and nobody
// travels to deliver it. The empty set is the only valid answer, which is
// stricter than leaving the column unchecked.
const handoverOptions = (kind) =>
  kind === "service" ? SERVICE_OPTION : kind === "property" ? [] : DELIVERY_OPTION;

/* ─── property vocabulary ─────────────────────────────────────────────────── */

// The axis. It decides what `price` means — an asking price or a month's rent
// — which is what lets one range filter compare like with like. A listing is
// one or the other, never both; an owner offering both publishes twice.
const PROPERTY_OPERATION = ["sale", "rent"];

// Not the same question as a good's condition. `off_plan` is sobre planos:
// sold before it exists, which is a large part of what is on sale here and has
// no equivalent among second-hand objects.
const PROPERTY_CONDITION = ["new", "used", "off_plan"];

// What the building and the flat come with. A Postgres array for the same
// reason `delivery` is one: a fixed, short set that is never queried on its
// own.
const PROPERTY_FEATURE = [
  "elevator", "concierge", "gated_community", "visitor_parking",
  "pool", "gym", "communal_room", "bbq_area", "playground", "sports_court",
  "balcony", "terrace", "patio", "garden", "storage_room",
  "fitted_kitchen", "closets", "fireplace", "air_conditioning", "natural_gas",
  "furnished", "pets_allowed",
];

// How much of the address the listing shows. The column always holds the whole
// thing — a map cannot be drawn from half an address, and an accepted visitor
// has to be told where to go — so this governs display and never storage.
//
//   exact   as written
//   street  up to the '#': "Calle 45 # 12-34" reads "Calle 45"
//   hidden  neighbourhood and city only
//
// Three levels rather than a private/public switch because that is what the
// owner of an empty house actually needs: enough for a buyer to place the
// block, not enough to find the door.
const ADDRESS_VISIBILITY = ["exact", "street", "hidden"];

// Colombia's socioeconomic strata. Not a rating of the place — it is what
// determines the utility bills, which is why every local portal asks for it
// and why a buyer filters on it.
const MIN_STRATUM = 1;
const MAX_STRATUM = 6;

// Asking to see a property, and the owner's answer. There is no "cancelled":
// a request that was never accepted has nothing to call off, and one that was
// has already put two people in touch.
const VISIT_STATUS = ["pending", "accepted", "declined"];
const VISIT_MESSAGE_MAX = 500;
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

// A question is one question. The answer gets more room because it is the one
// that has to explain something.
const QUESTION_MAX = 500;
const ANSWER_MAX = 1000;

// One to five. Not zero: a rating of nothing is indistinguishable from not
// having rated, and the difference between those two is the whole point of
// counting them.
const MIN_STARS = 1;
const MAX_STARS = 5;
const COMMENT_MAX = 1000;

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
    // A thing or somebody's time. Defaulted rather than required, because
    // every row that existed before services did is a good, and a default is
    // the honest answer for all of them.
    kind: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "good",
      validate: { isIn: [LISTING_KIND] },
      field: "kind",
    },
    // Money is DECIMAL, never FLOAT: a rounding drift on a price is not a
    // cosmetic bug.
    //
    // Nullable only because a service may be quoted rather than priced: a
    // contractor pricing a renovation cannot put a number on it before seeing
    // the room. A good always carries one, which the validation enforces —
    // without that, "price on request" becomes a way to publish an object with
    // no price at all.
    price: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
      field: "price",
    },
    // What the price buys, for a service: an hour, a day, or the whole job.
    // Null on a good, where the price buys the thing itself.
    rateUnit: {
      type: DataTypes.STRING,
      allowNull: true,
      validate: { isIn: [RATE_UNIT] },
      field: "rateUnit",
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
    // How the two of you meet: where a parcel goes, or where the work happens.
    // One question, and which answers are valid depends on the kind.
    //
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
          const allowed = handoverOptions(this.kind);
          const bad = value.filter(v => !allowed.includes(v));
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
    // Which account confirmed it, and so who the buyer deals with from then
    // on. Before shops had more than one person, `accountId` answered that; it
    // no longer does, because a shop's suborder belongs to the shop and any
    // member may confirm it. Null on everything that predates this and on
    // every shopless seller, where the two are the same person anyway.
    handledBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "handledBy",
    },
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
    // Copied at the moment of ordering so that what someone agreed to pay keeps
    // reading the same after the seller edits the price or deletes the listing.
    //
    // Null only for a service that was quoted rather than priced: the request
    // is the start of the conversation about what it will cost, and writing 0
    // there would record an agreement to do the work for nothing.
    unitPrice: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
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

/**
 * A public question on a listing, and the seller's one answer to it.
 *
 * The answer is columns on the question rather than a second row pointing back
 * at it. A self-referencing table would model a thread — any row answering any
 * other — and the controller would then have to forbid, one rule at a time,
 * everything the schema still allowed: two answers to one question, an answer
 * to an answer, a stranger answering in the seller's place. There is exactly
 * one answer and it always comes from the same person, so it is not another
 * question. It is a field of this one, and "answered once, by the seller" is a
 * fact of the table instead of a rule someone has to remember.
 *
 * `accountId` is stored and never published. It is how an answer finds its way
 * back to whoever asked, and how a seller is kept from asking on their own
 * listing — but the question is shown to everyone without a name on it, so
 * that asking whether something is genuine does not put your name under it in
 * public.
 */
const ProductQuestion = db.define(
  "product_questions",
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
    // Who asked. Never sent to a browser, by anyone, for any reason.
    accountId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "accountId",
    },
    body: {
      type: DataTypes.TEXT,
      allowNull: false,
      validate: { len: [1, QUESTION_MAX] },
      field: "body",
    },
    // Null means nobody has answered yet, which is the state the seller's
    // inbox is built to find.
    answer: {
      type: DataTypes.TEXT,
      allowNull: true,
      validate: { len: [1, ANSWER_MAX] },
      field: "answer",
    },
    // Kept beside the answer rather than derived from updatedAt, which moves
    // for reasons that have nothing to do with answering.
    answeredAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "answeredAt",
    },
  },
  {
    tableName: "product_questions",
    schema: "market",
    // Both reads are "this listing's questions, newest first" and "mine, still
    // unanswered". The first is the one that runs on every listing view.
    indexes: [{ fields: ["productId", "createdAt"] }],
  }
);

/**
 * What a buyer thought of the person who sold to them.
 *
 * Anchored to the suborder, uniquely. That single column does three jobs: it
 * proves the transaction happened, it names which one is being rated, and it
 * is what stops the same purchase being rated twice. A seller with a hundred
 * completed sales can hold a hundred ratings and not one more.
 *
 * There is no way to change one once it is left. That is not an oversight and
 * it is not laziness: an editable rating is something a seller can lean on a
 * buyer to revise, and the person a reputation system has to protect first is
 * the one telling the truth about a bad experience.
 *
 * `sellerId` is copied from the suborder rather than read through it. It is
 * the column every average groups by, it can never change for a given
 * suborder, and joining a table to reach it on every listing page is a cost
 * paid for nothing.
 */
const SellerRating = db.define(
  "seller_ratings",
  {
    id: {
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
      type: DataTypes.INTEGER,
      field: "id",
    },
    // One transaction, one rating. Unique, so the rule is the database's and
    // not something a controller has to remember on every path.
    subOrderId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      unique: true,
      field: "subOrderId",
    },
    // Who is being rated.
    sellerId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "sellerId",
    },
    // And under which brand, when there was one. A shop's reputation belongs
    // to the shop: an agency that loses an agent does not lose its stars, and
    // a colleague's bad month is not something the person who answered the
    // phone carries personally.
    //
    // Both columns are always written, so a rating is never orphaned by a shop
    // closing — the average simply falls back to the person it was left for.
    shopId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "shopId",
    },
    // Who left it. Shown, unlike a question's author: a review nobody can be
    // held to is a review anybody can invent, and the buyer is not anonymous
    // to this seller anyway — they have already dealt with each other.
    accountId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "accountId",
    },
    stars: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: { min: MIN_STARS, max: MAX_STARS },
      field: "stars",
    },
    // Optional. Stars are the rating; words are a courtesy, and demanding them
    // is how a rating box turns into something people skip entirely.
    comment: {
      type: DataTypes.TEXT,
      allowNull: true,
      validate: { len: [1, COMMENT_MAX] },
      field: "comment",
    },
  },
  {
    tableName: "seller_ratings",
    schema: "market",
    // Only the one sync can build. `shopId` was added to a table that already
    // existed, and sync creates indexes before the migrations add columns — so
    // its index lives in database/migrations.js, which runs in the right order.
    indexes: [{ fields: ["sellerId"] }],
  }
);

/**
 * What a buyer thought of the thing itself.
 *
 * A different judgement from the one above and kept in a different table: a
 * seller rating is about conduct — did they answer, did they show up, was it
 * as described — and this is about whether the object is any good. They
 * aggregate onto different things, so they are counted separately.
 *
 * Unique per account and product, not per purchase. Somebody who buys the same
 * coffee four times has one opinion of it, and letting them file four would
 * let one voice outweigh four other people's.
 *
 * Having bought it is checked when the review is written, against a delivered
 * order, and is not recorded here: the order is the proof and it already
 * exists. What this table holds is the opinion.
 */
const ProductReview = db.define(
  "product_reviews",
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
    accountId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "accountId",
    },
    stars: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: { min: MIN_STARS, max: MAX_STARS },
      field: "stars",
    },
    body: {
      type: DataTypes.TEXT,
      allowNull: true,
      validate: { len: [1, COMMENT_MAX] },
      field: "body",
    },
  },
  {
    tableName: "product_reviews",
    schema: "market",
    indexes: [
      { unique: true, fields: ["accountId", "productId"] },
      { fields: ["productId"] },
    ],
  }
);

/**
 * What a listing is, when the listing is a property.
 *
 * One row to one listing, keyed on the listing itself rather than on an id of
 * its own. That is not a saving of one column: it is the constraint. A
 * property cannot exist without the listing it describes, cannot be attached
 * to two, and goes when it goes — none of which a separate key would say.
 *
 * The listing keeps everything a property shares with a shirt: who is selling,
 * under which shop, in which city, the title, the photographs, the price and
 * the status. What lives here is only what a shirt has no answer to.
 */
const Property = db.define(
  "properties",
  {
    productId: {
      primaryKey: true,
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "productId",
    },
    operation: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: { isIn: [PROPERTY_OPERATION] },
      field: "operation",
    },
    condition: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: { isIn: [PROPERTY_CONDITION] },
      field: "condition",
    },
    // Square metres are DECIMAL for the same reason money is: a flat measured
    // at 62.5 m² is not 62, and rounding somebody's home is not cosmetic.
    //
    // Built area is the one measurement every property has, so it is the one
    // that is required. Private area is what the buyer actually lives in and
    // is the classic complaint when the two differ; lot area only means
    // something for a house, a finca or bare land.
    builtArea: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      validate: { min: 1 },
      field: "builtArea",
    },
    privateArea: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      validate: { min: 1 },
      field: "privateArea",
    },
    lotArea: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      validate: { min: 1 },
      field: "lotArea",
    },
    // Zero is a real answer for all four: a studio has no separate bedroom, a
    // lot has no bathroom, and most flats have neither a half bath nor a
    // parking space. Required with a default rather than nullable, because
    // "none" and "not said" are worth telling apart and the form always asks.
    bedrooms: {
      type: DataTypes.SMALLINT,
      allowNull: false,
      defaultValue: 0,
      validate: { min: 0, max: 50 },
      field: "bedrooms",
    },
    bathrooms: {
      type: DataTypes.SMALLINT,
      allowNull: false,
      defaultValue: 0,
      validate: { min: 0, max: 50 },
      field: "bathrooms",
    },
    halfBaths: {
      type: DataTypes.SMALLINT,
      allowNull: false,
      defaultValue: 0,
      validate: { min: 0, max: 50 },
      field: "halfBaths",
    },
    parking: {
      type: DataTypes.SMALLINT,
      allowNull: false,
      defaultValue: 0,
      validate: { min: 0, max: 50 },
      field: "parking",
    },
    // Nullable because a lot outside a municipal boundary has none, and
    // guessing one would be inventing a utility bill.
    stratum: {
      type: DataTypes.SMALLINT,
      allowNull: true,
      validate: { min: MIN_STRATUM, max: MAX_STRATUM },
      field: "stratum",
    },
    // Which floor it is on. Zero is the ground floor and negative is a
    // basement, both of which exist and neither of which is "unknown".
    floor: {
      type: DataTypes.SMALLINT,
      allowNull: true,
      validate: { min: -5, max: 200 },
      field: "floor",
    },
    builtYear: {
      type: DataTypes.SMALLINT,
      allowNull: true,
      validate: { min: 1500, max: 2100 },
      field: "builtYear",
    },
    // The monthly administración. Separate from the price because it is paid
    // separately, forever, by whoever lives there — a buyer comparing two
    // flats at the same price is comparing the wrong number without it.
    adminFee: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
      validate: { min: 0 },
      field: "adminFee",
    },
    // Whether the rent already covers it. Meaningless on a sale, and the
    // model-level validation below says so rather than letting it sit there
    // quietly true.
    adminIncluded: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: "adminIncluded",
    },
    features: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: false,
      defaultValue: [],
      validate: {
        known(value) {
          if (!Array.isArray(value)) throw new Error("Features must be a list");
          const bad = value.filter(v => !PROPERTY_FEATURE.includes(v));
          if (bad.length) throw new Error(`Unknown feature: ${bad.join(", ")}`);
        },
      },
      field: "features",
    },
    // The barrio. Always public, and in Colombia it is what people search by
    // before they search by anything else.
    neighborhood: {
      type: DataTypes.STRING,
      allowNull: true,
      field: "neighborhood",
    },
    // Always stored whole. `addressVisibility` decides how much of it a
    // stranger is shown, and an accepted visitor is shown all of it whatever
    // the setting says — otherwise accepting them would tell them nothing.
    address: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: { len: [4, 255] },
      field: "address",
    },
    addressVisibility: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "exact",
      validate: { isIn: [ADDRESS_VISIBILITY] },
      field: "addressVisibility",
    },
    // Off by default, because a number that goes public cannot be called back.
    // On, it shows on the listing as well; it never shows less than it would
    // have shown without it.
    phonePublic: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: "phonePublic",
    },
    // Empty until there is a map to put them on. Here from the start so that
    // drawing one later is a feature and not a migration across every row.
    latitude: {
      type: DataTypes.DECIMAL(9, 6),
      allowNull: true,
      validate: { min: -90, max: 90 },
      field: "latitude",
    },
    longitude: {
      type: DataTypes.DECIMAL(9, 6),
      allowNull: true,
      validate: { min: -180, max: 180 },
      field: "longitude",
    },
  },
  {
    tableName: "properties",
    schema: "market",
    validate: {
      // Two measurements of the same building, so one cannot exceed the other.
      // Caught here rather than in the form because it is a fact about
      // buildings and not about this month's interface.
      privateFitsInside() {
        if (this.privateArea && Number(this.privateArea) > Number(this.builtArea)) {
          throw new Error("Private area cannot exceed built area");
        }
      },
      // "Administration included" is an answer to a question only a tenant is
      // asked. Left set on a sale it would print a line the buyer cannot act
      // on, so it is refused rather than ignored.
      adminOnlyWhenRented() {
        if (this.operation !== "rent" && this.adminIncluded) {
          throw new Error("Administration is only included in a rent");
        }
      },
    },
    indexes: [
      { fields: ["operation", "bedrooms"] },
      { fields: ["builtArea"] },
    ],
  }
);

/**
 * Somebody asking to come and see it.
 *
 * This is what replaces the order. Everywhere else in Plaza the two sides
 * reach each other because a suborder was confirmed; a property has no
 * suborder to confirm, so the request is the event that opens the door. Until
 * the owner accepts, neither side is given the other's email, phone or full
 * address — and that filtering happens on the server, never by a browser
 * choosing not to draw what it was sent.
 *
 * Unique per person per listing. That is what stops one account filling an
 * owner's inbox, and it is the database's rule rather than something the
 * controller has to remember on every path that can create one.
 */
const VisitRequest = db.define(
  "visit_requests",
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
    // Who wants to see it. Unlike a question's author, this name is shown —
    // to the owner alone, who is being asked to let a stranger into a
    // building and is entitled to know which stranger.
    accountId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "accountId",
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: false,
      validate: { len: [1, VISIT_MESSAGE_MAX] },
      field: "message",
    },
    // When they would like to come. A wish, not a booking: nothing is reserved
    // and the owner is free to answer with another day.
    preferredAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "preferredAt",
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "pending",
      validate: { isIn: [VISIT_STATUS] },
      field: "status",
    },
    respondedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "respondedAt",
    },
  },
  {
    tableName: "visit_requests",
    schema: "market",
    indexes: [
      { unique: true, fields: ["accountId", "productId"] },
      { fields: ["productId", "createdAt"] },
    ],
  }
);

/**
 * Somebody who works in a shop that is not theirs.
 *
 * The owner is not here. They are `Shop.accountId`, which is where they have
 * always been, and keeping them there means every shop that already exists
 * needs no backfill and nobody can be removed from their own shop by the
 * endpoint that removes everybody else. Two roles, encoded structurally: owner
 * is a column on the shop, collaborator is a row in this table. An enum with
 * two values would only be a second place for them to disagree.
 *
 * `acceptedAt` is the whole invitation. Null means asked and not yet answered,
 * and a pending row grants nothing at all — joining a shop makes you its public
 * representative, and an owner who could add somebody without their agreement
 * could put a stranger's name behind their brand.
 */
const ShopMember = db.define(
  "shop_members",
  {
    id: {
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
      type: DataTypes.INTEGER,
      field: "id",
    },
    shopId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "shopId",
    },
    accountId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "accountId",
    },
    // Who sent it. Nullable and SET NULL: an invitation outlives the account
    // that sent it, and losing the sender is not a reason to lose the
    // membership.
    invitedBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "invitedBy",
    },
    invitedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "invitedAt",
    },
    acceptedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "acceptedAt",
    },
  },
  {
    tableName: "shop_members",
    schema: "market",
    indexes: [
      // One membership per person per shop, which is also what stops the same
      // invitation being sent twice.
      { unique: true, fields: ["shopId", "accountId"] },
      // "my shops" and "my invitations" are the same read with the null
      // checked the other way round.
      { fields: ["accountId", "acceptedAt"] },
    ],
  }
);

const Market = {
  Shop, Product, ProductImage, Favourite, CartItem, Order, SubOrder, OrderItem,
  ProductQuestion, SellerRating, ProductReview, Property, VisitRequest,
  ShopMember,
  MIN_STARS, MAX_STARS, COMMENT_MAX,
  MAX_PRODUCT_IMAGES, QUESTION_MAX, ANSWER_MAX,
  SHOP_STATUS, PRODUCT_STATUS, ORDER_STATUS, SUBORDER_STATUS,
  PRODUCT_CONDITION, DELIVERY_OPTION, CANCELLED_BY,
  SHIPPING_MODE,
  LISTING_KIND, RATE_UNIT, SERVICE_OPTION, handoverOptions,
  PROPERTY_OPERATION, PROPERTY_CONDITION, PROPERTY_FEATURE,
  ADDRESS_VISIBILITY, MIN_STRATUM, MAX_STRATUM,
  VISIT_STATUS, VISIT_MESSAGE_MAX,
};

module.exports = Market;
