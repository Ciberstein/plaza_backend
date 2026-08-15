const { Op } = require("sequelize");
const catchAsync = require("../../utils/catchAsync.util");
const AppError = require("../../utils/appError.util");
const Market = require("../../models/market.models");
const Accounts = require("../../models/accounts.models");
const { Category } = require("../../models/categories.models");

// Only what a listing needs to be shown. The seller's account id is not part
// of it, and neither is anything about how the row was made.
const PUBLIC_ATTRS = [
  "id", "shopId", "categoryId", "cityId",
  "title", "description", "price", "currency", "stock", "status",
  "condition", "delivery", "createdAt",
];

// Who is selling it. A listing carries a shop or it carries a person, never
// both, and the shopper is told which without having to work it out.
const SELLER = {
  model: Accounts.Account,
  as: "seller",
  attributes: ["id", "username", "avatar"],
};

const SHOP = {
  model: Market.Shop,
  as: "shop",
  attributes: ["id", "name", "slug", "logo", "status"],
  required: false,
};

// How many photographs a card carries. Enough to flick through on the grid
// without turning a page of results into a page of images: a listing may hold
// eight, and forty-eight listings holding eight is not a payload, it is a
// download.
const SHOTS_IN_GRID = 5;

// A page of results. Capped rather than trusted: `?limit=100000` is a way to
// ask the database to do the client's work.
const page = (query) => {
  const limit = Math.min(Math.max(Number(query.limit) || 48, 1), 96);
  const offset = Math.max(Number(query.offset) || 0, 0);
  return { limit, offset };
};

// A listing is only ever reachable at all if the brand behind it is open.
// Closing a shop has to take its listings off the square, and without this a
// suspended brand keeps selling.
const brandOpen = [{ shopId: null }, { "$shop.status$": "active" }];

/**
 * On the square: what browsing and searching can turn up.
 */
const listed = {
  status: "active",
  [Op.or]: brandOpen,
};

/**
 * Reachable by its own address, which is a wider door.
 *
 * A paused listing is not offered anywhere, but it is not gone either: someone
 * who bookmarked it or was sent the link should find it and be told it is
 * paused, rather than be told it never existed. Anything else — draft, out of
 * stock, archived — is not the public's business at all.
 */
const addressable = {
  status: { [Op.in]: ["active", "paused"] },
  [Op.or]: brandOpen,
};

// A parent category means its children too. Someone browsing "Home" expects
// the things filed under "Kitchen", and the seller filed them precisely.
const categoryIds = async (slug) => {
  const parent = await Category.findOne({ where: { slug, active: true } });
  if (!parent) return null;

  const children = await Category.findAll({
    where: { parentId: parent.id, active: true },
    attributes: ["id"],
  });

  return [parent.id, ...children.map(c => c.id)];
};

exports.list = catchAsync(async (req, res, next) => {
  const where = { ...listed };

  if (req.query.cityId) where.cityId = req.query.cityId;
  if (req.query.shopId) where.shopId = req.query.shopId;

  if (req.query.category) {
    const ids = await categoryIds(req.query.category);
    // An unknown category is an empty shelf, not an error: the URL may simply
    // be old, and a 404 on a browse page is a worse answer than "nothing here".
    if (!ids) return res.status(200).json([]);
    where.categoryId = { [Op.in]: ids };
  }

  // iLike rather than like: nobody types a product name with its capitals in
  // the right places. Escaped so a % in the query searches for a percent sign
  // instead of matching everything.
  const q = req.query.q?.trim();

  if (q) {
    const term = `%${q.replace(/[%_\\]/g, (c) => "\\" + c)}%`;
    where[Op.and] = [
      { [Op.or]: [{ title: { [Op.iLike]: term } }, { description: { [Op.iLike]: term } }] },
    ];
  }

  const products = await Market.Product.findAll({
    where,
    attributes: PUBLIC_ATTRS,
    include: [SHOP, SELLER],
    order: [["createdAt", "DESC"]],
    ...page(req.query),
    // Without this the limit is applied in a subquery that the `$shop.status$`
    // condition cannot see, and the filter silently stops working.
    subQuery: false,
  });

  // The photographs in one more query rather than joining a second hasMany onto
  // a limited select, which is what turns one page of results into a cartesian
  // product of rows.
  //
  // All of them now, not only the cover: a card you can flick through without
  // opening it is the difference between browsing and clicking back and forth.
  const shots = await Market.ProductImage.findAll({
    where: { productId: products.map(p => p.id) },
    attributes: ["id", "productId", "url"],
    order: [["productId", "ASC"], ["position", "ASC"]],
  });

  const byProduct = new Map();

  for (const shot of shots) {
    const held = byProduct.get(shot.productId) ?? [];
    if (held.length < SHOTS_IN_GRID) held.push({ id: shot.id, url: shot.url });
    byProduct.set(shot.productId, held);
  }

  return res.status(200).json(
    products.map(product => {
      const images = byProduct.get(product.id) ?? [];

      return {
        ...product.toJSON(),
        images,
        // Kept alongside the list so nothing that only wanted one photograph
        // has to learn about the other four.
        cover: images[0]?.url ?? null,
      };
    })
  );
});

/**
 * The questions on a listing, and whatever the seller answered.
 *
 * Public, and anonymous. `accountId` is on every row and is in none of these
 * responses: the column exists so an answer can find its way back to whoever
 * asked, not so the square can see who wanted to know whether something was
 * genuine. Listed explicitly rather than deleted from the object afterwards,
 * because a field that is never selected cannot be forgotten about later.
 *
 * Unanswered questions are public too. A question nobody has answered is
 * itself worth reading — three of them about the same thing say something the
 * description does not.
 */
exports.questions = catchAsync(async (req, res, next) => {
  // Only for a listing the visitor could be looking at in the first place. The
  // same door as the page itself, so a draft cannot be probed for questions.
  const product = await Market.Product.findOne({
    where: { id: req.params.id, ...addressable },
    attributes: ["id"],
    include: [SHOP],
    subQuery: false,
  });

  if (!product) return next(new AppError("Listing not found", 404));

  const questions = await Market.ProductQuestion.findAll({
    where: { productId: product.id },
    attributes: ["id", "productId", "body", "answer", "answeredAt", "createdAt"],
    order: [["createdAt", "DESC"]],
  });

  return res.status(200).json(questions);
});

exports.get = catchAsync(async (req, res, next) => {
  const product = await Market.Product.findOne({
    where: { id: req.params.id, ...addressable },
    attributes: PUBLIC_ATTRS,
    include: [
      SHOP,
      SELLER,
      { model: Market.ProductImage, as: "images", attributes: ["id", "url", "position"] },
    ],
    order: [[{ model: Market.ProductImage, as: "images" }, "position", "ASC"]],
    subQuery: false,
  });

  if (!product) return next(new AppError("Listing not found", 404));

  return res.status(200).json(product);
});
