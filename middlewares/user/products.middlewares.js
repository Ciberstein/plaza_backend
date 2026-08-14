const AppError = require("../../utils/appError.util");
const catchAsync = require("../../utils/catchAsync.util");
const Market = require("../../models/market.models");
const { Category } = require("../../models/categories.models");
const Geo = require("../../models/geo.models");

// Money arrives as a string so it never passes through a float on the way in.
// Anything that is not a plain positive decimal is refused here rather than
// reaching the column and coming back as a constraint error nobody can read.
const PRICE = /^\d{1,10}(\.\d{1,2})?$/;

exports.validate = catchAsync(async (req, res, next) => {
  const { title, price, stock, categoryId, cityId, shopId, condition, delivery } = req.body;
  // A new listing has to arrive complete. A patch may carry one field, so
  // absence means "leave it" there and "missing" only here.
  const creating = req.method === "POST";

  if (!title?.trim()) return next(new AppError("Give the listing a title", 406));
  if (title.trim().length < 3) return next(new AppError("The title is too short", 406));

  if (price !== undefined) {
    if (!PRICE.test(String(price)))
      return next(new AppError("Enter a price like 45000 or 45000.50", 406));
    if (Number(price) <= 0)
      return next(new AppError("The price has to be more than zero", 406));
  }

  if (stock !== undefined && (!Number.isInteger(Number(stock)) || Number(stock) < 0))
    return next(new AppError("Stock has to be zero or a whole number", 406));

  // Never defaulted, so it has to be asked for. Everything second-hand would
  // otherwise be published as new by whoever did not scroll to this field.
  if (creating && !condition) return next(new AppError("Say what condition it is in", 406));

  if (condition !== undefined && !Market.PRODUCT_CONDITION.includes(condition))
    return next(new AppError("Pick a condition from the list", 406));

  if (creating && (!Array.isArray(delivery) || !delivery.length))
    return next(new AppError("Pick at least one way to hand it over", 406));

  if (delivery !== undefined) {
    if (!Array.isArray(delivery))
      return next(new AppError("Pick at least one way to hand it over", 406));

    const unknown = delivery.filter(option => !Market.DELIVERY_OPTION.includes(option));
    if (unknown.length)
      return next(new AppError("Pick delivery options from the list", 406));

    // Deduplicated here so the column never holds the same answer twice.
    req.body.delivery = [...new Set(delivery)];
  }

  // Checked against the same rows /public/meta serves the form, so a value the
  // form could not have offered is rejected before it reaches the model.
  if (categoryId !== undefined && categoryId !== null) {
    const category = await Category.findOne({ where: { id: categoryId, active: true } });
    if (!category) return next(new AppError("Pick a category from the list", 406));
  }

  if (cityId !== undefined && cityId !== null) {
    const city = await Geo.City.findOne({ where: { id: cityId, active: true } });
    if (!city) return next(new AppError("Pick a city from the list", 406));
  }

  // Selling under a shop means selling under a brand, so the brand has to be
  // one this person actually holds. Its status is not checked here: a draft
  // listing may point at a shop that is still waiting for review. Whether it
  // may go live is a question for publish.
  if (shopId !== undefined && shopId !== null) {
    const shop = await Market.Shop.findOne({
      where: { id: shopId, accountId: req.sessionAccount.id },
    });
    if (!shop) return next(new AppError("That shop is not yours", 403));
  }

  req.body.title = title.trim();

  next();
});

// Ownership is resolved from the session, never from the body. A productId in
// the request would let anyone edit a listing by guessing a number.
exports.owned = catchAsync(async (req, res, next) => {
  const product = await Market.Product.findOne({
    where: { id: req.params.id, accountId: req.sessionAccount.id },
    include: [{ model: Market.ProductImage, as: "images" }],
    order: [[{ model: Market.ProductImage, as: "images" }, "position", "ASC"]],
  });

  // Not found rather than forbidden: someone else's listing should not be
  // distinguishable from one that does not exist.
  if (!product) return next(new AppError("Listing not found", 404));

  req.product = product;

  next();
});

// The three things that have to be true before a listing is shown to buyers.
//
// They are gathered here rather than inside the publish controller because a
// seller who fails two of them deserves to be told both, not sent round the
// loop once per problem.
exports.publishable = catchAsync(async (req, res, next) => {
  const product = req.product;
  const problems = [];

  // The promise /sell makes to every seller, enforced at the one moment it
  // actually matters.
  if (!req.sessionAccount.verified) {
    problems.push("confirm your email");
  }

  if (!product.images?.length) {
    problems.push("add at least one photo");
  }

  if (!product.categoryId) problems.push("pick a category");
  if (!product.cityId) problems.push("say where it is");
  if (!product.condition) problems.push("say what condition it is in");
  if (!product.delivery?.length) problems.push("pick at least one way to hand it over");

  // A listing cannot carry a brand that the square cannot see. Left until now
  // so a seller can prepare listings while their shop is still in review.
  if (product.shopId) {
    const shop = await Market.Shop.findOne({
      where: { id: product.shopId, accountId: req.sessionAccount.id },
    });

    if (!shop) problems.push("pick a shop you own, or none");
    else if (shop.status !== "active") problems.push(`open ${shop.name} first`);
  }

  if (problems.length) {
    return next(new AppError(`Before publishing: ${problems.join(", ")}.`, 409));
  }

  next();
});
