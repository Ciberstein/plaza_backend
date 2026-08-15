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
  const {
    title, price, stock, categoryId, cityId, shopId, condition, delivery, rateUnit,
  } = req.body;
  // A new listing has to arrive complete. A patch may carry one field, so
  // absence means "leave it" there and "missing" only here.
  const creating = req.method === "POST";

  // What is being published decides which of the rules below apply. On a
  // create it comes off the request; on an edit it comes off the row, because
  // a listing does not change from a thing into somebody's time.
  const kind = creating ? (req.body.kind ?? "good") : req.product.kind;

  if (creating && !Market.LISTING_KIND.includes(kind)) {
    return next(new AppError("A listing is either a product or a service", 406));
  }

  // Fixed here rather than trusted from the body: an edit that carried a
  // different kind would otherwise rewrite what the row is.
  req.body.kind = kind;

  const isService = kind === "service";

  if (!title?.trim()) return next(new AppError("Give the listing a title", 406));
  if (title.trim().length < 3) return next(new AppError("The title is too short", 406));

  /* ── what it costs ────────────────────────────────────────────────────── */

  // A service may be quoted instead of priced, and says so by sending no
  // price at all. A good always carries one: without this, "on request" would
  // be a way to publish an object with no price.
  const quoted = isService && (price === null || price === "");

  if (quoted) {
    req.body.price = null;
    req.body.rateUnit = null;
  } else if (price !== undefined) {
    if (!PRICE.test(String(price)))
      return next(new AppError("Enter a price like 45000 or 45000.50", 406));
    if (Number(price) <= 0)
      return next(new AppError("The price has to be more than zero", 406));
  } else if (creating && !isService) {
    return next(new AppError("Say what it costs", 406));
  }

  // A rate without its unit is a number nobody can read: 45000 an hour and
  // 45000 a day are different offers.
  if (isService && !quoted) {
    const unit = rateUnit ?? (creating ? null : undefined);

    if (creating && !unit) return next(new AppError("Say what the rate covers", 406));

    if (unit !== undefined && unit !== null && !Market.RATE_UNIT.includes(unit)) {
      return next(new AppError("Pick an hour, a day or the whole job", 406));
    }
  }

  if (!isService && rateUnit !== undefined && rateUnit !== null) {
    return next(new AppError("A product is priced, not charged by the hour", 406));
  }

  /* ── the shelf, which only a thing has ────────────────────────────────── */

  if (isService) {
    // Nobody holds four caregivers in reserve. Stock is not asked for and not
    // accepted, so it cannot be set to a number that would later take the
    // listing off the square for being empty.
    if (stock !== undefined) delete req.body.stock;
    if (condition !== undefined && condition !== null) {
      return next(new AppError("A service has no condition", 406));
    }
    req.body.condition = null;
  } else {
    if (stock !== undefined && (!Number.isInteger(Number(stock)) || Number(stock) < 0))
      return next(new AppError("Stock has to be zero or a whole number", 406));

    // Never defaulted, so it has to be asked for. Everything second-hand would
    // otherwise be published as new by whoever did not scroll to this field.
    if (creating && !condition) return next(new AppError("Say what condition it is in", 406));

    if (condition !== undefined && !Market.PRODUCT_CONDITION.includes(condition))
      return next(new AppError("Pick a condition from the list", 406));
  }

  /* ── how the two of you meet ──────────────────────────────────────────── */

  const handover = Market.handoverOptions(kind);

  if (creating && (!Array.isArray(delivery) || !delivery.length)) {
    return next(new AppError(
      isService ? "Say where you carry the work out" : "Pick at least one way to hand it over",
      406
    ));
  }

  if (delivery !== undefined) {
    if (!Array.isArray(delivery))
      return next(new AppError("Pick at least one way to hand it over", 406));

    const unknown = delivery.filter(option => !handover.includes(option));
    if (unknown.length)
      return next(new AppError(
        isService ? "Pick where you work from the list" : "Pick delivery options from the list",
        406
      ));

    // Deduplicated here so the column never holds the same answer twice.
    req.body.delivery = [...new Set(delivery)];
  }

  // Checked against the same rows /public/meta serves the form, so a value the
  // form could not have offered is rejected before it reaches the model.
  // The category has to come from the same aisle as the listing. Nothing in
  // the form offers the other tree, so anything that arrives from it was not
  // typed by a person — and a caregiver filed under Televisores is a listing
  // no shopper will ever find.
  if (categoryId !== undefined && categoryId !== null) {
    const category = await Category.findOne({ where: { id: categoryId, active: true } });
    if (!category) return next(new AppError("Pick a category from the list", 406));

    if (category.kind !== kind) {
      return next(new AppError(
        isService
          ? "Pick a category from the services list"
          : "Pick a category from the products list",
        406
      ));
    }
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

  const isService = product.kind === "service";

  // A photograph proves the object is real and is what the description says.
  // Work has nothing to photograph before it is done, so a service may go up
  // without one — a plumber has no picture of your pipe yet.
  if (!isService && !product.images?.length) {
    problems.push("add at least one photo");
  }

  if (!product.categoryId) problems.push("pick a category");
  if (!product.cityId) problems.push("say where it is");

  if (isService) {
    // A quoted service carries neither, and that is a complete answer. A
    // priced one has to say what the price buys.
    if (product.price !== null && !product.rateUnit) problems.push("say what the rate covers");
    if (!product.delivery?.length) problems.push("say where you carry the work out");
  } else {
    if (product.price === null) problems.push("say what it costs");
    if (!product.condition) problems.push("say what condition it is in");
    if (!product.delivery?.length) problems.push("pick at least one way to hand it over");
  }

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
