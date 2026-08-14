const catchAsync = require("../../utils/catchAsync.util");
const AppError = require("../../utils/appError.util");
const cloudinary = require("../../utils/cloudinary.util");
const Market = require("../../models/market.models");

const PRODUCT_ATTRS = [
  "id", "shopId", "categoryId", "cityId",
  "title", "description", "price", "currency", "stock", "status",
  "condition", "delivery", "createdAt",
];

// The two states a seller may choose between. Out of stock is not among them:
// it is a fact about the shelf, not a decision, and letting someone select it
// while holding stock would make the word mean nothing.
const CHOOSABLE = ["active", "paused"];

// A listing that has been published at least once, and so has an availability
// worth setting. A draft has nowhere to be available.
const LISTED = ["active", "paused", "out_of_stock"];

const IMAGE_ATTRS = ["id", "url", "position"];

// The order of a listing's photographs is the order the seller arranged them
// in, and the first is the one every grid shows. Kept apart from the include so
// a caller can ask for both this and an ordering of its own: spreading a shape
// that carries `order` on top of a query that already had one silently threw
// the query's away, which is how "your listings, newest first" quietly became
// "your listings, by whichever photo happens to be first".
const IMAGE_ORDER = [{ model: Market.ProductImage, as: "images" }, "position", "ASC"];

const withImages = {
  include: [{ model: Market.ProductImage, as: "images", attributes: IMAGE_ATTRS }],
};

// Returns the listing the way every endpoint here answers with it, so a caller
// never has to guess whether images came back on this one.
const reload = (id) =>
  Market.Product.findByPk(id, {
    attributes: PRODUCT_ATTRS,
    ...withImages,
    order: [IMAGE_ORDER],
  });

/**
 * Running out of stock is not a decision, so it is not a transition the seller
 * makes. A listing at zero stops being offered and starts again when there is
 * something to sell, and either way the seller only ever edited a number.
 *
 * Draft and archived are left alone: they are deliberate states, and a seller
 * who archived something does not want it back because a number moved.
 */
const stockStatus = (status, stock) => {
  // Drafts and archived listings are deliberate states. A number moving is not
  // a reason to drag something back out of a drawer someone put it in.
  if (!LISTED.includes(status)) return status;

  if (Number(stock) === 0) return "out_of_stock";

  return status === "out_of_stock" ? "active" : status;
};

/**
 * A listing that stops being on sale leaves every basket holding it.
 *
 * The seller's decision reaches other people's baskets, which is the whole
 * reason the basket is a table and not something in their browser. Nobody gets
 * to the last step of an order and is told the thing was withdrawn an hour ago.
 *
 * Silent when there is nothing to remove, which is the common case.
 */
const dropFromBaskets = (productId) =>
  Market.CartItem.destroy({ where: { productId } });

exports.list = catchAsync(async (req, res) => {
  const products = await Market.Product.findAll({
    where: { accountId: req.sessionAccount.id },
    attributes: PRODUCT_ATTRS,
    ...withImages,
    // Newest listing first, and inside each one the photographs as arranged.
    order: [["createdAt", "DESC"], IMAGE_ORDER],
  });

  return res.status(200).json(products);
});

exports.get = catchAsync(async (req, res) => {
  return res.status(200).json(await reload(req.product.id));
});

exports.create = catchAsync(async (req, res) => {
  const {
    title, description, price, stock, categoryId, cityId, shopId, currency,
    condition, delivery,
  } = req.body;

  const product = await Market.Product.create({
    accountId: req.sessionAccount.id,
    shopId: shopId ?? null,
    categoryId: categoryId ?? null,
    cityId: cityId ?? null,
    title,
    description: description?.trim() || null,
    price: price ?? 0,
    currency: currency || "COP",
    stock: stock ?? 0,
    condition: condition ?? null,
    delivery: delivery ?? [],
    // Draft, not active: nothing reaches the square before its photographs do.
    status: "draft",
  });

  return res.status(201).json(await reload(product.id));
});

exports.update = catchAsync(async (req, res, next) => {
  const {
    title, description, price, stock, categoryId, cityId, shopId, currency,
    condition, delivery, availability,
  } = req.body;
  const updates = {};

  if (title?.trim()) updates.title = title.trim();
  if (description !== undefined) updates.description = description?.trim() || null;
  if (price !== undefined) updates.price = price;
  if (currency) updates.currency = currency;
  if (categoryId !== undefined) updates.categoryId = categoryId || null;
  if (cityId !== undefined) updates.cityId = cityId || null;
  if (shopId !== undefined) updates.shopId = shopId || null;

  if (condition !== undefined) updates.condition = condition || null;
  if (delivery !== undefined) updates.delivery = delivery;
  if (stock !== undefined) updates.stock = stock;

  // Pausing and unpausing is the one status change that belongs on the form,
  // because to the seller it is a property of the listing rather than an event.
  // Publishing and archiving stay endpoints of their own: each has a rule.
  if (availability !== undefined) {
    if (!CHOOSABLE.includes(availability)) {
      return next(new AppError("A listing is either available or paused", 406));
    }

    if (!LISTED.includes(req.product.status)) {
      return next(new AppError("Publish the listing before setting its availability", 409));
    }

    updates.status = availability;
  }

  // The shelf has the last word. Whatever the seller chose, nothing with zero
  // stock is available, and this runs after their choice rather than instead
  // of it so the refusal is the stock's and not a silently ignored field.
  updates.status = stockStatus(
    updates.status ?? req.product.status,
    updates.stock ?? req.product.stock,
  );

  await req.product.update(updates);

  // Paused, out of stock, or anything else that is not on sale.
  if (updates.status !== "active") await dropFromBaskets(req.product.id);

  return res.status(200).json(await reload(req.product.id));
});

/* ─── the transitions a seller is allowed ────────────────────────────────── */

// Guarded by `publishable`, which is where every reason this could fail lives.
exports.publish = catchAsync(async (req, res, next) => {
  const product = req.product;

  if (!["draft", "archived", "out_of_stock"].includes(product.status)) {
    return next(new AppError(`A listing that is ${product.status} cannot be published`, 409));
  }

  await product.update({ status: stockStatus("active", product.stock) });

  // Listing something is what turns a buyer into a seller. The role is widened,
  // never narrowed — an admin who lists something stays an admin.
  if (req.sessionAccount.role === "buyer") {
    await req.sessionAccount.update({ role: "seller" });
  }

  return res.status(200).json(await reload(product.id));
});

exports.archive = catchAsync(async (req, res, next) => {
  const product = req.product;

  if (product.status === "archived") {
    return next(new AppError("This listing is already archived", 409));
  }

  await product.update({ status: "archived" });
  await dropFromBaskets(product.id);

  return res.status(200).json(await reload(product.id));
});

/**
 * Gone, not put away.
 *
 * Archiving is for something that might come back; this is for something that
 * should not exist. Both are offered because a seller means one or the other
 * and one word cannot cover both.
 *
 * Safe to do even to something that sold: OrderItem keeps the title and the
 * price it was bought at, and its productId is SET NULL rather than cascaded,
 * so a buyer's history still reads after the listing is gone.
 */
exports.remove = catchAsync(async (req, res) => {
  const folder = cloudinary.folders.product(req.product.id);

  await req.product.destroy();

  // The whole folder, not the files one by one. Same result for the rows we
  // know about, and it also takes anything the database lost track of — an
  // upload that succeeded on the way to a request that failed afterwards.
  //
  // After the delete and never allowed to fail it: if Cloudinary refuses, the
  // seller has still deleted the listing, and what is left is a file nothing
  // links to rather than a listing that would not go away.
  await cloudinary
    .removeFolder(folder)
    .catch(err => console.error("CLOUDINARY: could not clear product folder:", err.message));

  return res.status(204).send();
});

/* ─── photographs ─────────────────────────────────────────────────────────── */

exports.addImage = catchAsync(async (req, res, next) => {
  if (!cloudinary.configured()) {
    return next(new AppError("Image uploads are not configured on this server", 503));
  }

  if (!req.file) return next(new AppError("Choose an image to upload", 400));

  const count = await Market.ProductImage.count({ where: { productId: req.product.id } });

  if (count >= Market.MAX_PRODUCT_IMAGES) {
    return next(
      new AppError(`A listing can hold ${Market.MAX_PRODUCT_IMAGES} photos. Remove one first.`, 409)
    );
  }

  const result = await cloudinary.upload(req.file.buffer, {
    folder: cloudinary.folders.product(req.product.id),
    resource_type: "image",
  });

  await Market.ProductImage.create({
    productId: req.product.id,
    url: result.secure_url,
    publicId: result.public_id,
    // Appended, never inserted: a seller who wants it first says so by
    // reordering, and guessing costs them the arrangement they had.
    position: count,
  });

  return res.status(201).json(await reload(req.product.id));
});

exports.removeImage = catchAsync(async (req, res, next) => {
  const image = await Market.ProductImage.findOne({
    where: { id: req.params.imageId, productId: req.product.id },
  });

  if (!image) return next(new AppError("Photo not found", 404));

  // The row goes first. If Cloudinary refuses, the seller has still removed the
  // photo they asked to remove, and what is left behind is a file nobody links
  // to rather than a photo that would not go away.
  await image.destroy();

  await cloudinary.remove(image.publicId).catch(err =>
    console.error("Cloudinary delete failed:", err?.message)
  );

  // Closing the hole, so positions stay 0..n-1 and the cover is always 0.
  const rest = await Market.ProductImage.findAll({
    where: { productId: req.product.id },
    order: [["position", "ASC"]],
  });

  await Promise.all(rest.map((row, index) => row.update({ position: index })));

  return res.status(200).json(await reload(req.product.id));
});

// The whole arrangement at once, as a list of ids in the order the seller put
// them. One id at a time would need a rule for what happens to the others.
exports.reorderImages = catchAsync(async (req, res, next) => {
  const { order } = req.body;

  if (!Array.isArray(order) || !order.length) {
    return next(new AppError("Send the photo ids in the order you want them", 406));
  }

  const images = await Market.ProductImage.findAll({
    where: { productId: req.product.id },
  });

  const ids = images.map(image => image.id);

  // Every photo, exactly once. A partial list would leave the rest with
  // positions that collide with the ones just written.
  const complete =
    order.length === ids.length && ids.every(id => order.includes(id));

  if (!complete) {
    return next(new AppError("Send every photo of this listing exactly once", 406));
  }

  await Promise.all(
    order.map((id, index) =>
      images.find(image => image.id === id).update({ position: index })
    )
  );

  return res.status(200).json(await reload(req.product.id));
});
