const catchAsync = require("../../utils/catchAsync.util");
const AppError = require("../../utils/appError.util");
const cloudinary = require("../../utils/cloudinary.util");
const Market = require("../../models/market.models");

const PRODUCT_ATTRS = [
  "id", "shopId", "categoryId", "cityId",
  "title", "description", "price", "currency", "stock", "status", "createdAt",
];

const IMAGE_ATTRS = ["id", "url", "position"];

const withImages = {
  include: [{ model: Market.ProductImage, as: "images", attributes: IMAGE_ATTRS }],
  order: [[{ model: Market.ProductImage, as: "images" }, "position", "ASC"]],
};

// Returns the listing the way every endpoint here answers with it, so a caller
// never has to guess whether images came back on this one.
const reload = (id) =>
  Market.Product.findByPk(id, { attributes: PRODUCT_ATTRS, ...withImages });

/**
 * Running out of stock is not a decision, so it is not a transition the seller
 * makes. A listing at zero stops being offered and starts again when there is
 * something to sell, and either way the seller only ever edited a number.
 *
 * Draft and archived are left alone: they are deliberate states, and a seller
 * who archived something does not want it back because a number moved.
 */
const stockStatus = (status, stock) => {
  if (status === "active" && Number(stock) === 0) return "out_of_stock";
  if (status === "out_of_stock" && Number(stock) > 0) return "active";
  return status;
};

exports.list = catchAsync(async (req, res) => {
  const products = await Market.Product.findAll({
    where: { accountId: req.sessionAccount.id },
    attributes: PRODUCT_ATTRS,
    order: [["createdAt", "DESC"]],
    ...withImages,
  });

  return res.status(200).json(products);
});

exports.get = catchAsync(async (req, res) => {
  return res.status(200).json(await reload(req.product.id));
});

exports.create = catchAsync(async (req, res) => {
  const { title, description, price, stock, categoryId, cityId, shopId, currency } = req.body;

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
    // Draft, not active: nothing reaches the square before its photographs do.
    status: "draft",
  });

  return res.status(201).json(await reload(product.id));
});

exports.update = catchAsync(async (req, res) => {
  const { title, description, price, stock, categoryId, cityId, shopId, currency } = req.body;
  const updates = {};

  if (title?.trim()) updates.title = title.trim();
  if (description !== undefined) updates.description = description?.trim() || null;
  if (price !== undefined) updates.price = price;
  if (currency) updates.currency = currency;
  if (categoryId !== undefined) updates.categoryId = categoryId || null;
  if (cityId !== undefined) updates.cityId = cityId || null;
  if (shopId !== undefined) updates.shopId = shopId || null;

  if (stock !== undefined) {
    updates.stock = stock;
    updates.status = stockStatus(req.product.status, stock);
  }

  // `status` is deliberately absent from what a body may set. The transitions a
  // seller is allowed live in their own endpoints, each with its own rule.
  await req.product.update(updates);

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

  return res.status(200).json(await reload(product.id));
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
    folder: `plaza/products/${req.product.id}`,
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
