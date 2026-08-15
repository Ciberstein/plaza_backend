const { Op, fn, col } = require("sequelize");
const catchAsync = require("../../utils/catchAsync.util");
const AppError = require("../../utils/appError.util");
const Market = require("../../models/market.models");

// Only what a storefront needs. The owner's account id is not part of it.
const PUBLIC_ATTRS = ["id", "name", "slug", "description", "logo", "cityId", "shipping"];

exports.list = catchAsync(async (req, res) => {
  // The category strip and the city filter narrow this list; absent, it is the
  // whole square.
  const where = { status: "active" };

  if (req.query.cityId) where.cityId = req.query.cityId;

  // iLike rather than like: nobody types a shop name with its capitals in the
  // right places. Escaped so a % in the query searches for a percent sign
  // instead of matching everything.
  const q = req.query.q?.trim();

  if (q) {
    const term = `%${q.replace(/[%_\\]/g, (c) => "\\" + c)}%`;
    where[Op.or] = [
      { name: { [Op.iLike]: term } },
      { description: { [Op.iLike]: term } },
    ];
  }

  const shops = await Market.Shop.findAll({
    where,
    attributes: PUBLIC_ATTRS,
    order: [["createdAt", "DESC"]],
  });

  return res.status(200).json(shops);
});

exports.get = catchAsync(async (req, res, next) => {
  const shop = await Market.Shop.findOne({
    // Reached by slug, not by id: the id is an internal detail and the slug is
    // what a person copied out of the address bar.
    where: { slug: req.params.slug, status: "active" },
    attributes: PUBLIC_ATTRS,
  });

  if (!shop) return next(new AppError("Shop not found", 404));

  // What buyers thought of dealing with this shop. Grouped on `shopId`, so it
  // is the brand's average and not the sum of whoever happened to answer —
  // which is the whole reason a shop may have more than one person in it.
  const rated = await Market.SellerRating.findAll({
    where: { shopId: shop.id },
    attributes: [
      [fn("AVG", col("stars")), "average"],
      [fn("COUNT", col("stars")), "count"],
    ],
    raw: true,
  });

  const count = Number(rated[0]?.count ?? 0);

  return res.status(200).json({
    ...shop.toJSON(),
    rating: count
      ? { average: Math.round(Number(rated[0].average) * 10) / 10, count }
      : { average: null, count: 0 },
  });
});
