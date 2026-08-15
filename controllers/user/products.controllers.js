const catchAsync = require("../../utils/catchAsync.util");
const AppError = require("../../utils/appError.util");
const cloudinary = require("../../utils/cloudinary.util");
const Market = require("../../models/market.models");
const { db } = require("../../database/config");
const { Op } = require("sequelize");
const { shopIdsFor } = require("../../utils/shopAccess.util");

const PRODUCT_ATTRS = [
  "id", "kind", "shopId", "categoryId", "cityId",
  "title", "description", "price", "rateUnit", "currency", "stock", "status",
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

// Everything a property is that a listing has no column for. The whole row
// goes to its owner unedited — the trimming of the address and the phone is
// the public endpoint's job, and this is the seller looking at their own.
const PROPERTY_ATTRS = [
  "operation", "condition", "builtArea", "privateArea", "lotArea",
  "bedrooms", "bathrooms", "halfBaths", "parking", "stratum", "floor",
  "builtYear", "adminFee", "adminIncluded", "features", "neighborhood",
  "address", "addressVisibility", "phonePublic", "latitude", "longitude",
];

// Joined on every read rather than only when the listing is a property. It is
// a LEFT JOIN on a primary key against a table with one row per property, and
// the alternative is two code paths that can disagree about the shape they
// answer with.
const withImages = {
  include: [
    { model: Market.ProductImage, as: "images", attributes: IMAGE_ATTRS },
    { model: Market.Property, as: "property", attributes: PROPERTY_ATTRS, required: false },
  ],
};

// Returns the listing the way every endpoint here answers with it, so a caller
// never has to guess whether images came back on this one.
const reload = (id) =>
  Market.Product.findByPk(id, {
    attributes: PRODUCT_ATTRS,
    ...withImages,
    order: [IMAGE_ORDER],
  });

// A number, or null, from a form field that may arrive as "", null or absent.
// Written once because there are fifteen of them on a property and `?? null`
// alone turns an empty input into the string "" and then into NaN in Postgres.
const num = (value) => (value === undefined || value === null || value === "" ? null : Number(value));

// The property columns out of a request body. `condition` is deliberately the
// same field name the goods form uses: to a seller it is the same question,
// and which set of answers is valid follows from the kind. The two live in
// different tables, so nothing collides.
const propertyFrom = (body) => ({
  operation: body.operation,
  condition: body.condition,
  builtArea: num(body.builtArea),
  privateArea: num(body.privateArea),
  lotArea: num(body.lotArea),
  bedrooms: num(body.bedrooms) ?? 0,
  bathrooms: num(body.bathrooms) ?? 0,
  halfBaths: num(body.halfBaths) ?? 0,
  parking: num(body.parking) ?? 0,
  stratum: num(body.stratum),
  floor: num(body.floor),
  builtYear: num(body.builtYear),
  adminFee: num(body.adminFee),
  adminIncluded: Boolean(body.adminIncluded),
  features: body.features ?? [],
  neighborhood: body.neighborhood?.trim() || null,
  address: body.address?.trim(),
  addressVisibility: body.addressVisibility || "exact",
  phonePublic: Boolean(body.phonePublic),
  latitude: num(body.latitude),
  longitude: num(body.longitude),
});

/**
 * Running out of stock is not a decision, so it is not a transition the seller
 * makes. A listing at zero stops being offered and starts again when there is
 * something to sell, and either way the seller only ever edited a number.
 *
 * Draft and archived are left alone: they are deliberate states, and a seller
 * who archived something does not want it back because a number moved.
 */
const stockStatus = (status, stock, kind = "good") => {
  // Nobody keeps four caregivers in reserve, and nobody keeps four of the same
  // flat. Neither a service nor a property has a shelf to run empty, and their
  // stock column sits at whatever the default was — reading it would take
  // every one of them off the square the moment it was published.
  if (kind !== "good") return status;

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

// Everything this person may act on: what they listed themselves, and
// everything listed under a shop they work in. One clause, because every inbox
// in this project asks the same question and answering it differently in each
// is how one of them ends up showing a colleague's work and another does not.
const mineOrMyShops = async (accountId) => {
  const shopIds = await shopIdsFor(accountId);

  return shopIds.length
    ? { [Op.or]: [{ accountId }, { shopId: { [Op.in]: shopIds } }] }
    : { accountId };
};

exports.list = catchAsync(async (req, res) => {
  const products = await Market.Product.findAll({
    where: await mineOrMyShops(req.sessionAccount.id),
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
    kind, title, description, price, stock, categoryId, cityId, shopId, currency,
    condition, delivery, rateUnit,
  } = req.body;

  const isService = kind === "service";
  const isProperty = kind === "property";

  // Both rows or neither. A listing that says it is a property and has no
  // property row is a shape nothing downstream is written to survive, and
  // without a transaction that is exactly what a failed second insert leaves
  // behind.
  const product = await db.transaction(async (transaction) => {
    const created = await Market.Product.create({
      accountId: req.sessionAccount.id,
      kind: kind ?? "good",
      shopId: shopId ?? null,
      categoryId: categoryId ?? null,
      cityId: cityId ?? null,
      title,
      description: description?.trim() || null,
      // Null means quoted, and only a service may be. `?? 0` would turn "on
      // request" into free, which is a different offer entirely.
      price: isService ? (price ?? null) : (price ?? 0),
      rateUnit: isService ? (rateUnit ?? null) : null,
      currency: currency || "COP",
      // One flat is one flat. Left at zero it would read as out of stock and
      // never reach the square.
      stock: isProperty ? 1 : isService ? 0 : (stock ?? 0),
      // The goods vocabulary. A property's condition is a different question
      // with different answers and lives on its own row.
      condition: isService || isProperty ? null : (condition ?? null),
      delivery: delivery ?? [],
      // Draft, not active: nothing reaches the square before its photographs do.
      status: "draft",
    }, { transaction });

    if (isProperty) {
      await Market.Property.create(
        { ...propertyFrom(req.body), productId: created.id },
        { transaction },
      );
    }

    return created;
  });

  return res.status(201).json(await reload(product.id));
});

exports.update = catchAsync(async (req, res, next) => {
  const {
    title, description, price, stock, categoryId, cityId, shopId, currency,
    condition, delivery, availability, rateUnit,
  } = req.body;
  const updates = {};
  const isService = req.product.kind === "service";
  const isProperty = req.product.kind === "property";

  // Sent as null by the form when the seller switches to "on request", so
  // `!== undefined` rather than a truthiness check: null is the answer here,
  // not the absence of one.
  if (isService && price !== undefined) {
    updates.price = price === null || price === "" ? null : price;
    updates.rateUnit = updates.price === null ? null : (rateUnit ?? req.product.rateUnit);
  } else if (isService && rateUnit !== undefined) {
    updates.rateUnit = rateUnit;
  }

  if (title?.trim()) updates.title = title.trim();
  if (description !== undefined) updates.description = description?.trim() || null;
  // A service's price was already settled above, together with its rate unit,
  // because for a service the two are one answer.
  if (!isService && price !== undefined) updates.price = price;
  if (currency) updates.currency = currency;
  if (categoryId !== undefined) updates.categoryId = categoryId || null;
  if (cityId !== undefined) updates.cityId = cityId || null;
  if (shopId !== undefined) updates.shopId = shopId || null;

  if (delivery !== undefined) updates.delivery = delivery;

  // Neither belongs to a service, and neither belongs to a property: one has
  // no shelf and no second-hand hour, the other has one of itself and answers
  // a different question about its condition on its own row.
  if (!isService && !isProperty) {
    if (condition !== undefined) updates.condition = condition || null;
    if (stock !== undefined) updates.stock = stock;
  }

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
    req.product.kind,
  );

  await req.product.update(updates);

  // The other half of the row, when there is one. Only the keys the form
  // actually sent are written, so a partial save — the seller editing the
  // description alone — cannot blank fifteen columns it never asked about.
  if (isProperty) {
    const sent = Object.fromEntries(
      Object.entries(propertyFrom(req.body))
        .filter(([key]) => req.body[key] !== undefined),
    );

    // Loaded and updated as an instance rather than by `Model.update`, which
    // validates a bare object: the model-level rules compare two columns —
    // private area against built area, administration against the operation —
    // and against a partial patch they would be reading undefined and passing
    // everything.
    if (Object.keys(sent).length) {
      const property = await Market.Property.findByPk(req.product.id);
      if (property) await property.update(sent);
    }
  }

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

  await product.update({ status: stockStatus("active", product.stock, product.kind) });

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
