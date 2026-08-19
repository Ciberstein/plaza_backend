const { Op, fn, col } = require("sequelize");
const catchAsync = require("../../utils/catchAsync.util");
const AppError = require("../../utils/appError.util");
const Market = require("../../models/market.models");
const Accounts = require("../../models/accounts.models");
const Geo = require("../../models/geo.models");
const { Category } = require("../../models/categories.models");

// Only what a listing needs to be shown. The seller's account id is not part
// of it, and neither is anything about how the row was made.
const PUBLIC_ATTRS = [
  "id", "kind", "shopId", "categoryId", "cityId",
  "title", "description", "price", "rateUnit", "currency", "stock", "status",
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

/**
 * Stars, averaged, for a set of listings or a set of sellers.
 *
 * One grouped query rather than one per row: a page of forty-eight cards each
 * asking for its own average is forty-eight round trips to answer something
 * the database can total in a single pass.
 *
 * Rounded to one decimal on the way out. A rating of 4.33333 is not more
 * truthful than 4.3, it is only longer, and nobody chooses between sellers on
 * the second decimal place.
 */
const averages = async (model, key, ids) => {
  if (!ids.length) return new Map();

  const rows = await model.findAll({
    where: { [key]: { [Op.in]: ids } },
    attributes: [key, [fn("AVG", col("stars")), "average"], [fn("COUNT", col("stars")), "count"]],
    group: [key],
    raw: true,
  });

  return new Map(
    rows.map(row => [
      row[key],
      {
        average: Math.round(Number(row.average) * 10) / 10,
        count: Number(row.count),
      },
    ])
  );
};

// Nobody has rated it yet, said as a shape rather than as null, so a caller
// can read `.count` without checking whether there is anything to read.
const UNRATED = { average: null, count: 0 };

/* ─── properties ──────────────────────────────────────────────────────────── */

// Read whole from the database and trimmed here. The raw address is needed to
// derive the shortened one, and the shortening has to happen on this side of
// the wire: an address sent in full and hidden by a stylesheet is not hidden.
const PROPERTY_ATTRS = [
  "productId", "operation", "condition", "builtArea", "privateArea", "lotArea",
  "bedrooms", "bathrooms", "halfBaths", "parking", "stratum", "floor",
  "builtYear", "adminFee", "adminIncluded", "features", "neighborhood",
  "address", "addressVisibility", "phonePublic", "latitude", "longitude",
];

/**
 * As much of the address as the owner chose to show.
 *
 * The split is on '#', which is where a Colombian address stops naming the
 * street and starts naming the door: "Calle 45 # 12-34" is a block anybody can
 * find and a flat only the owner should hand out. Stripping trailing digits
 * would be the European rule and would turn "Calle 45" into "Calle".
 */
const publicAddress = (property) => {
  if (!property?.address) return null;

  switch (property.addressVisibility) {
    case "exact": return property.address;
    case "street": return property.address.split("#")[0].trim() || null;
    default: return null;
  }
};

// How far the shown point may sit from the real one, and the circle drawn
// around it. The circle is the larger of the two so the true location is
// always somewhere inside what the reader is being shown — a circle smaller
// than the offset would be a map that lies in the other direction.
const BLUR_METRES = 300;
const CIRCLE_METRES = 400;

// One degree of latitude, near enough anywhere. Longitude narrows towards the
// poles, which is why it is scaled by the cosine below.
const METRES_PER_DEGREE = 111320;

/**
 * A number in [0, 1) from an integer, stable forever.
 *
 * The stability is the point. A random offset per request looks fuzzy and is
 * not: ask for the same listing two hundred times and average the answers, and
 * the noise cancels out to the exact address. Derived from the id instead, the
 * displaced point is the same on every request, and averaging returns the
 * displaced point.
 */
const jitter = (id, salt) => {
  let hash = (id * 2654435761 + salt * 40503) >>> 0;
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 2246822507) >>> 0;
  hash ^= hash >>> 13;
  // `>>> 0` again, and it is load-bearing: `^=` yields a *signed* 32-bit
  // integer, so without this the hash comes back negative for about half of
  // all ids, and the square root of a negative distance is NaN — a listing
  // with no coordinates at all rather than a blurred one.
  return (hash >>> 0) / 4294967296;
};

/**
 * Where a stranger is told the property is.
 *
 * The address decision governs the map, or it governs nothing: a pin on the
 * exact address publishes the address whatever the owner chose about the text.
 *
 * So `exact` gets the real point, and everything else gets a displaced one
 * with a circle around it — enough to answer "is this the neighbourhood I
 * want", not enough to answer "which door". The displacement happens here and
 * not in the browser, because a circle drawn client-side around a true point
 * requires sending the true point, and a coordinate in a payload is public
 * however it is later rendered.
 */
const publicPoint = (property) => {
  if (!property?.latitude || !property?.longitude) {
    return { latitude: null, longitude: null, blurred: false, radius: null };
  }

  const latitude = Number(property.latitude);
  const longitude = Number(property.longitude);

  if (property.addressVisibility === "exact") {
    return { latitude, longitude, blurred: false, radius: null };
  }

  // A direction and a distance, both drawn from the id. The distance is
  // square-rooted so the points land evenly over the disc rather than
  // clustering in the middle, which would make the centre the best guess.
  const angle = jitter(property.productId, 1) * 2 * Math.PI;
  const distance = Math.sqrt(jitter(property.productId, 2)) * BLUR_METRES;

  const north = (distance * Math.sin(angle)) / METRES_PER_DEGREE;
  const east =
    (distance * Math.cos(angle)) /
    (METRES_PER_DEGREE * Math.cos((latitude * Math.PI) / 180));

  return {
    latitude: Number((latitude + north).toFixed(6)),
    longitude: Number((longitude + east).toFixed(6)),
    blurred: true,
    radius: CIRCLE_METRES,
  };
};

/**
 * The property block as a stranger may see it.
 *
 * `address` is replaced rather than removed, so the shape is the same whatever
 * the owner chose and the interface has one field to read instead of a
 * condition to evaluate. `phone` is present only when the owner asked for it
 * to be.
 */
const publicProperty = (property, seller) => {
  if (!property) return null;

  return {
    ...property.toJSON(),
    ...publicPoint(property),
    address: publicAddress(property),
    phone: property.phonePublic ? dialable(seller) : null,
  };
};

// The seller's number, assembled the way the orders endpoints assemble it, so
// a number reads the same wherever it is shown.
const dialable = (account) =>
  account?.phone ? `${account.phoneCountry?.dialCode ?? ""}${account.phone}` : null;

// A whole number from a query string, or null. `Number("")` is 0, which as a
// minimum-bedrooms filter would quietly mean "at least none".
const whole = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

/* ─── searching by an area of the map ─────────────────────────────────────── */

// A drawn shape has to stay a shape somebody drew, not a thousand-vertex
// polygon pasted into a query string to make the server walk it per row.
const MAX_VERTICES = 200;

/** "minLat,minLng,maxLat,maxLng" — what the map can currently see. */
const parseBounds = (value) => {
  const parts = String(value ?? "").split(",").map(Number);
  if (parts.length !== 4 || parts.some(n => !Number.isFinite(n))) return null;

  const [minLat, minLng, maxLat, maxLng] = parts;
  if (minLat > maxLat || minLng > maxLng) return null;

  return { minLat, minLng, maxLat, maxLng };
};

/** "lat,lng;lat,lng;…" — the zone somebody drew by hand. */
const parsePolygon = (value) => {
  const ring = String(value ?? "")
    .split(";")
    .map(pair => pair.split(",").map(Number))
    .filter(pair => pair.length === 2 && pair.every(Number.isFinite));

  // Fewer than three points is not an area, and past the cap it is not a
  // drawing either.
  if (ring.length < 3 || ring.length > MAX_VERTICES) return null;

  return ring;
};

/** The box a ring sits in, so the database can do the coarse pass. */
const boundsOf = (ring) => ({
  minLat: Math.min(...ring.map(p => p[0])),
  maxLat: Math.max(...ring.map(p => p[0])),
  minLng: Math.min(...ring.map(p => p[1])),
  maxLng: Math.max(...ring.map(p => p[1])),
});

/**
 * Ray casting: count the edges a ray from the point crosses going east.
 *
 * Odd means inside. No PostGIS for this — the extension would have to be
 * installed and the geometry columns maintained to answer a question about a
 * few hundred rows that the database has already narrowed to a box.
 */
const insidePolygon = ([lat, lng], ring) => {
  let inside = false;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [latI, lngI] = ring[i];
    const [latJ, lngJ] = ring[j];

    const straddles = latI > lat !== latJ > lat;
    if (!straddles) continue;

    const crossing = ((lngJ - lngI) * (lat - latI)) / (latJ - latI) + lngI;
    if (lng < crossing) inside = !inside;
  }

  return inside;
};

/**
 * A box grown by the blur, in degrees.
 *
 * The coarse pass runs in SQL against the *true* coordinate, because that is
 * the column the database has. The precise pass below runs against the
 * displaced one. So the SQL box has to be wider than the drawn one by the most
 * the displacement can move a point, or a property whose blurred pin sits
 * inside the zone would be dropped before anybody looked at it.
 */
const widen = (bounds) => {
  const lat = BLUR_METRES / METRES_PER_DEGREE;
  // The worst case across the box, which is its highest latitude in absolute
  // terms — longitude degrees are shortest there.
  const worst = Math.max(Math.abs(bounds.minLat), Math.abs(bounds.maxLat));
  const lng = BLUR_METRES / (METRES_PER_DEGREE * Math.cos((worst * Math.PI) / 180));

  return {
    minLat: bounds.minLat - lat,
    maxLat: bounds.maxLat + lat,
    minLng: bounds.minLng - lng,
    maxLng: bounds.maxLng + lng,
  };
};

/**
 * Whether a listing falls in the drawn area — judged on the point the map is
 * showing, never on the one in the database.
 *
 * This is the security decision, and it is easy to get backwards. Filtering on
 * the true coordinate would make the search an oracle against the blur: draw a
 * small enough zone, watch whether the listing appears, move the zone, and the
 * exact address falls out in a dozen guesses. Filtering on the displaced point
 * means the map answers questions about the map.
 *
 * It also happens to be what the reader expects. A pin drawn inside the zone
 * and excluded from the results reads as a broken filter.
 */
const inZone = (property, zone) => {
  if (!zone) return true;

  const { latitude, longitude } = publicPoint(property);
  if (latitude === null || longitude === null) return false;

  if (zone.ring) return insidePolygon([latitude, longitude], zone.ring);

  return (
    latitude >= zone.minLat && latitude <= zone.maxLat &&
    longitude >= zone.minLng && longitude <= zone.maxLng
  );
};

/** The area asked for, if any: a drawn ring wins over the visible box. */
const zoneFrom = (query) => {
  const ring = parsePolygon(query.polygon);
  if (ring) return { ring, ...boundsOf(ring) };

  const bounds = parseBounds(query.bbox);
  return bounds ? { ring: null, ...bounds } : null;
};

/**
 * The filters that only mean something for a property.
 *
 * Written onto a `where` for the joined table rather than the listing, except
 * price, which lives on the listing because it is the same column a shirt uses.
 */
const propertyWhere = (query) => {
  const where = {};

  // One or the other, never several: with two values, choosing both is the
  // same as choosing neither, and a filter whose "all" state has two spellings
  // is a filter that reads as broken.
  if (Market.PROPERTY_OPERATION.includes(query.operation)) where.operation = query.operation;

  // The condition is different — new and off-plan are a pair somebody means
  // together, and being made to search twice for them is what stops the filter
  // being used at all.
  const conditions = list(query.propertyCondition)
    .filter(value => Market.PROPERTY_CONDITION.includes(value));

  if (conditions.length) where.condition = { [Op.in]: conditions };

  // Minimums, not exact matches. Somebody who needs three bedrooms is not
  // turned away from a four-bedroom flat, which is what `= 3` would do.
  const atLeast = { bedrooms: "bedrooms", bathrooms: "bathrooms", parking: "parking" };

  for (const [param, column] of Object.entries(atLeast)) {
    const min = whole(query[param]);
    if (min !== null) where[column] = { [Op.gte]: min };
  }

  const minArea = whole(query.minArea);
  const maxArea = whole(query.maxArea);

  if (minArea !== null || maxArea !== null) {
    where.builtArea = {
      ...(minArea !== null && { [Op.gte]: minArea }),
      ...(maxArea !== null && { [Op.lte]: maxArea }),
    };
  }

  // Several strata at once: somebody looking at 3 is usually looking at 4 too.
  const strata = String(query.stratum ?? "")
    .split(",")
    .map(whole)
    .filter(s => s !== null && s >= Market.MIN_STRATUM && s <= Market.MAX_STRATUM);

  if (strata.length) where.stratum = { [Op.in]: strata };

  // All of them, not any: somebody who ticked lift and parking wants both.
  const features = String(query.features ?? "")
    .split(",")
    .map(f => f.trim())
    .filter(f => Market.PROPERTY_FEATURE.includes(f));

  if (features.length) where.features = { [Op.contains]: features };

  return where;
};

// A comma-separated query parameter, as a list. One value and several are the
// same shape, so nothing downstream has to ask which it got.
const list = (value) =>
  String(value ?? "")
    .split(",")
    .map(item => item.trim())
    .filter(Boolean);

/**
 * The categories a browse should look in.
 *
 * A parent means its children too: someone browsing "Vivienda" expects the
 * things filed under "Apartamento", and the seller filed them precisely.
 *
 * Several at once, because narrowing a property search is not the same job as
 * browsing a shop. Somebody who will live in a flat will usually also live in
 * an apartaestudio, and being made to choose one and search twice is how a
 * filter stops being used.
 *
 * An unknown slug contributes nothing rather than failing the whole query: a
 * stale link with one dead slug among four should return the other three.
 */
const categoryIds = async (slugs) => {
  const wanted = list(slugs);
  if (!wanted.length) return null;

  const parents = await Category.findAll({
    where: { slug: wanted, active: true },
    attributes: ["id"],
  });

  if (!parents.length) return [];

  const ids = parents.map(c => c.id);

  const children = await Category.findAll({
    where: { parentId: ids, active: true },
    attributes: ["id"],
  });

  return [...ids, ...children.map(c => c.id)];
};

// Exported for the smoke script, alongside publicPoint: the zone filter and
// the blur are one mechanism, and the thing worth proving about them is that
// the filter judges the displaced point rather than the real one.
exports.zoneFrom = zoneFrom;
exports.inZone = inZone;
exports.widen = widen;

// Exported for the smoke script. The displacement is the only piece of this
// file with a security property worth checking from outside, and checking a
// copy of it would prove nothing about the copy that runs.
exports.publicPoint = publicPoint;

exports.list = catchAsync(async (req, res, next) => {
  const where = { ...listed };

  // Which aisle. Absent means goods, because that is what every caller asking
  // for "products" before services existed meant, and a browse that quietly
  // started returning plumbers to them would be a breaking change.
  where.kind = Market.LISTING_KIND.includes(req.query.kind) ? req.query.kind : "good";

  // Several towns at once. Somebody moving for work looks at the city they
  // will work in and the two they could commute from, and one at a time makes
  // that three searches whose results cannot be compared side by side.
  const cityIds = list(req.query.cityId);
  if (cityIds.length) where.cityId = { [Op.in]: cityIds };
  if (req.query.shopId) where.shopId = req.query.shopId;

  // On the listing rather than on the property, because it is the same column
  // a shirt is priced in. What it means changes with the operation — an asking
  // price or a month's rent — which is exactly why a listing is one or the
  // other and never both.
  const minPrice = whole(req.query.minPrice);
  const maxPrice = whole(req.query.maxPrice);

  if (minPrice !== null || maxPrice !== null) {
    where.price = {
      ...(minPrice !== null && { [Op.gte]: minPrice }),
      ...(maxPrice !== null && { [Op.lte]: maxPrice }),
    };
  }

  if (req.query.category) {
    const ids = await categoryIds(req.query.category);
    // An unknown category is an empty shelf, not an error: the URL may simply
    // be old, and a 404 on a browse page is a worse answer than "nothing here".
    if (!ids || !ids.length) return res.status(200).json([]);
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

  const isProperty = where.kind === "property";
  const regions = list(req.query.region);
  const zone = isProperty ? zoneFrom(req.query) : null;

  // `required: true` when the aisle is properties, which makes the join do the
  // filtering: a listing whose property row does not match is not a result.
  // Searching by department goes through the city rather than a column of its
  // own — `geo.cities.region` already holds it for every city.
  const include = [SHOP, SELLER];

  if (isProperty) {
    const onProperty = propertyWhere(req.query);

    // The coarse pass. Widened by the blur, because this runs against the true
    // coordinate and the precise pass below runs against the displaced one —
    // without the margin, a property whose shown pin sits just inside the zone
    // would be dropped before anything looked at it.
    if (zone) {
      const box = widen(zone);
      onProperty.latitude = { [Op.between]: [box.minLat, box.maxLat] };
      onProperty.longitude = { [Op.between]: [box.minLng, box.maxLng] };
    }

    include.push({
      model: Market.Property,
      as: "property",
      attributes: PROPERTY_ATTRS,
      where: onProperty,
      required: true,
    });

    include.push({
      model: Geo.City,
      as: "city",
      attributes: ["id", "name", "region"],
      where: regions.length ? { region: { [Op.in]: regions } } : undefined,
      required: regions.length > 0,
    });
  }

  const products = await Market.Product.findAll({
    where,
    attributes: PUBLIC_ATTRS,
    include,
    order: [["createdAt", "DESC"]],
    ...page(req.query),
    // Without this the limit is applied in a subquery that the `$shop.status$`
    // condition cannot see, and the filter silently stops working.
    subQuery: false,
  });

  // The precise pass, against the point the map will actually draw. Run before
  // the photographs and the averages so nothing is fetched for a row that is
  // about to be dropped.
  const inside = zone
    ? products.filter(product => inZone(product.property, zone))
    : products;

  // The photographs in one more query rather than joining a second hasMany onto
  // a limited select, which is what turns one page of results into a cartesian
  // product of rows.
  //
  // All of them now, not only the cover: a card you can flick through without
  // opening it is the difference between browsing and clicking back and forth.
  const shots = await Market.ProductImage.findAll({
    where: { productId: inside.map(p => p.id) },
    attributes: ["id", "productId", "url"],
    order: [["productId", "ASC"], ["position", "ASC"]],
  });

  const byProduct = new Map();

  for (const shot of shots) {
    const held = byProduct.get(shot.productId) ?? [];
    if (held.length < SHOTS_IN_GRID) held.push({ id: shot.id, url: shot.url });
    byProduct.set(shot.productId, held);
  }

  const rated = await averages(Market.ProductReview, "productId", inside.map(p => p.id));

  return res.status(200).json(
    inside.map(product => {
      const images = byProduct.get(product.id) ?? [];

      return {
        ...product.toJSON(),
        images,
        // Kept alongside the list so nothing that only wanted one photograph
        // has to learn about the other four.
        cover: images[0]?.url ?? null,
        rating: rated.get(product.id) ?? UNRATED,
        // A card never shows a phone number, so none is assembled for one. The
        // address still goes through the same trimming: a grid is as public as
        // a page.
        ...(product.property && { property: publicProperty(product.property, null) }),
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
      { model: Market.Property, as: "property", attributes: PROPERTY_ATTRS, required: false },
      { model: Geo.City, as: "city", attributes: ["id", "name", "region"], required: false },
    ],
    order: [[{ model: Market.ProductImage, as: "images" }, "position", "ASC"]],
    subQuery: false,
  });

  if (!product) return next(new AppError("Listing not found", 404));

  /**
   * The seller's phone, fetched separately and only when it is going to be
   * shown.
   *
   * Not added to `SELLER`, which every listing uses: a phone column on that
   * include would travel with every product page whether or not anybody meant
   * to publish it, and one `toJSON()` spread would put it in the response. A
   * second small query by primary key is the cost of it being impossible to
   * leak by accident rather than merely unlikely.
   */
  const owner = product.property?.phonePublic && product.seller
    ? await Accounts.Account.findByPk(product.seller.id, {
        attributes: ["id", "phone"],
        include: [{ model: Geo.Country, as: "phoneCountry", attributes: ["dialCode"], required: false }],
      })
    : null;

  // Two different numbers, and a shopper reads them differently: one says
  // whether the thing is good, the other whether whoever is behind it is.
  //
  // "Whoever" is the shop when there is one. An agency's reputation is the
  // agency's — a buyer choosing between two of them is not choosing between
  // whichever agents happened to answer, and an agent who leaves does not take
  // the stars with them.
  const [listing, seller, brand] = await Promise.all([
    averages(Market.ProductReview, "productId", [product.id]),
    averages(Market.SellerRating, "sellerId", [product.seller?.id].filter(Boolean)),
    averages(Market.SellerRating, "shopId", [product.shop?.id].filter(Boolean)),
  ]);

  return res.status(200).json({
    ...product.toJSON(),
    rating: listing.get(product.id) ?? UNRATED,
    seller: product.seller && {
      ...product.seller.toJSON(),
      rating: seller.get(product.seller.id) ?? UNRATED,
    },
    shop: product.shop && {
      ...product.shop.toJSON(),
      rating: brand.get(product.shop.id) ?? UNRATED,
    },
    ...(product.property && { property: publicProperty(product.property, owner) }),
  });
});

/**
 * What people who bought it thought.
 *
 * Public, and named — unlike a question, whose author is hidden. A review
 * nobody can be held to is a review anybody can invent, and the buyer and
 * seller have already dealt with each other in any case.
 */
exports.reviews = catchAsync(async (req, res, next) => {
  const product = await Market.Product.findOne({
    where: { id: req.params.id, ...addressable },
    attributes: ["id"],
    include: [SHOP],
    subQuery: false,
  });

  if (!product) return next(new AppError("Listing not found", 404));

  const reviews = await Market.ProductReview.findAll({
    where: { productId: product.id },
    attributes: ["id", "productId", "stars", "body", "createdAt"],
    include: [{ model: Accounts.Account, as: "author", attributes: ["username", "avatar"] }],
    order: [["createdAt", "DESC"]],
  });

  return res.status(200).json(reviews);
});
