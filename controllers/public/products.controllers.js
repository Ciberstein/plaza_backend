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
  "title", "description", "price", "currency", "stock", "createdAt",
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

// A page of results. Capped rather than trusted: `?limit=100000` is a way to
// ask the database to do the client's work.
const page = (query) => {
  const limit = Math.min(Math.max(Number(query.limit) || 48, 1), 96);
  const offset = Math.max(Number(query.offset) || 0, 0);
  return { limit, offset };
};

/**
 * A listing is visible when it is active AND either it is sold by a person or
 * the shop it is branded with is open.
 *
 * The second half is the part that is easy to forget: closing a shop has to
 * take its listings off the square, and without this a suspended brand keeps
 * selling.
 */
const visible = {
  status: "active",
  [Op.or]: [{ shopId: null }, { "$shop.status$": "active" }],
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
  const where = { ...visible };

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

  // The covers in one more query rather than joining a second hasMany onto a
  // limited select, which is what turns one page of results into a cartesian
  // product of rows.
  const covers = await Market.ProductImage.findAll({
    where: { productId: products.map(p => p.id), position: 0 },
    attributes: ["productId", "url"],
  });

  const coverOf = new Map(covers.map(c => [c.productId, c.url]));

  return res.status(200).json(
    products.map(product => ({
      ...product.toJSON(),
      cover: coverOf.get(product.id) ?? null,
    }))
  );
});

exports.get = catchAsync(async (req, res, next) => {
  const product = await Market.Product.findOne({
    where: { id: req.params.id, ...visible },
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
