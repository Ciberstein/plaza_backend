/**
 * Exercises property listings and visit requests against a real database.
 *
 * There are no tests in this project, and this is not one either — it is the
 * check that was written while building the feature, kept because throwing it
 * away means the next person changing this code has nothing to run.
 *
 * It answers the questions that cannot be answered by reading: whether the
 * tables the models describe actually exist, whether a property can be created
 * and read back through the same shaping the public endpoint uses, and — the
 * ones that matter — whether the address and the phone stay behind the rules
 * they are supposed to stay behind.
 *
 * Everything it makes, it removes. Run with: node scripts/smoke-properties.js
 */
require("dotenv").config({ quiet: true });

const { db } = require("../database/config");
const Market = require("../models/market.models");
const Accounts = require("../models/accounts.models");
const { Category } = require("../models/categories.models");
const Geo = require("../models/geo.models");
const init = require("../models/init.models");

init();

let failures = 0;
const made = { products: [], visits: [] };

const check = (label, ok, detail = "") => {
  if (!ok) failures += 1;
  console.log(`${ok ? "\x1b[32mPASA \x1b[0m" : "\x1b[31mFALLA\x1b[0m"} ${label}${detail ? " -> " + detail : ""}`);
};

const refused = async (label, run) => {
  try {
    await run();
    check(label, false, "se aceptó y no debía");
  } catch (error) {
    check(label, true, (error.errors?.[0]?.message ?? error.message).slice(0, 60));
  }
};

(async () => {
  await db.authenticate();

  /* ── the tables exist ──────────────────────────────────────────────────── */
  // Asked by counting rather than by reading the catalogue. What matters is
  // not that a name appears in information_schema, it is that Sequelize can
  // read the table through the model that claims it — which is the thing that
  // breaks when a model and a database disagree.
  let reachable = true;

  try {
    await Promise.all([Market.Property.count(), Market.VisitRequest.count()]);
  } catch (error) {
    reachable = false;
    check("las dos tablas existen", false, error.message.slice(0, 70));
  }

  if (reachable) check("las dos tablas existen", true);

  /* ── the category tree was seeded ──────────────────────────────────────── */
  const parents = await Category.count({ where: { kind: "property", parentId: null } });
  const children = await Category.count({ where: { kind: "property", parentId: { [require("sequelize").Op.ne]: null } } });

  check("el árbol de inmuebles está sembrado", parents === 4, `${parents} padres, ${children} hijos`);
  check("cada padre tiene su Otros", children >= parents * 2);

  /* ── something to hang a listing on ────────────────────────────────────── */
  const account = await Accounts.Account.findOne({ order: [["id", "ASC"]] });
  const city = await Geo.City.findOne({ where: { active: true } });
  const category = await Category.findOne({ where: { kind: "property", parentId: { [require("sequelize").Op.ne]: null } } });

  if (!account || !city || !category) {
    console.log("\x1b[31mSin cuenta, ciudad o categoría sembrada: no hay dónde colgar la prueba.\x1b[0m");
    process.exit(1);
  }

  /* ── a property, both rows, in one transaction ─────────────────────────── */
  const listing = await db.transaction(async (transaction) => {
    const product = await Market.Product.create({
      accountId: account.id,
      kind: "property",
      categoryId: category.id,
      cityId: city.id,
      title: "Apartamento de prueba — borrar",
      price: 2500000,
      stock: 1,
      status: "draft",
      delivery: [],
    }, { transaction });

    await Market.Property.create({
      productId: product.id,
      operation: "rent",
      condition: "used",
      builtArea: 62.5,
      privateArea: 58,
      bedrooms: 3,
      bathrooms: 2,
      parking: 1,
      stratum: 4,
      adminFee: 350000,
      adminIncluded: true,
      features: ["elevator", "gym"],
      neighborhood: "Laureles",
      address: "Calle 45 # 12-34",
      addressVisibility: "street",
    }, { transaction });

    return product;
  });

  made.products.push(listing.id);

  const stored = await Market.Product.findByPk(listing.id, {
    include: [{ model: Market.Property, as: "property" }],
  });

  check("la publicación y el inmueble se guardan juntos", Boolean(stored.property));
  check("un inmueble no tiene condición de producto", stored.condition === null);
  check("un inmueble no admite formas de entrega", stored.delivery.length === 0);
  check("las amenidades sobreviven el viaje", stored.property.features.join(",") === "elevator,gym");

  /* ── the address rule, which is the whole point ────────────────────────── */
  const publicAddress = (property) => {
    if (!property?.address) return null;
    switch (property.addressVisibility) {
      case "exact": return property.address;
      case "street": return property.address.split("#")[0].trim() || null;
      default: return null;
    }
  };

  check("street corta en el numeral",
    publicAddress({ address: "Calle 45 # 12-34", addressVisibility: "street" }) === "Calle 45");
  check("exact muestra todo",
    publicAddress({ address: "Calle 45 # 12-34", addressVisibility: "exact" }) === "Calle 45 # 12-34");
  check("hidden no muestra nada",
    publicAddress({ address: "Calle 45 # 12-34", addressVisibility: "hidden" }) === null);
  check("una dirección sin numeral sobrevive a street",
    publicAddress({ address: "Carrera 70", addressVisibility: "street" }) === "Carrera 70");

  /* ── what the validators refuse ────────────────────────────────────────── */
  await refused("área privada mayor que la construida", () =>
    Market.Property.build({
      productId: listing.id, operation: "sale", condition: "used",
      builtArea: 50, privateArea: 80, address: "Calle 1 # 2-3",
    }).validate());

  await refused("administración incluida en una venta", () =>
    Market.Property.build({
      productId: listing.id, operation: "sale", condition: "used",
      builtArea: 50, address: "Calle 1 # 2-3", adminIncluded: true,
    }).validate());

  await refused("una amenidad inventada", () =>
    Market.Property.build({
      productId: listing.id, operation: "rent", condition: "used",
      builtArea: 50, address: "Calle 1 # 2-3", features: ["helipuerto"],
    }).validate());

  await refused("un inmueble con forma de entrega", () =>
    Market.Product.build({
      accountId: account.id, kind: "property", categoryId: category.id,
      cityId: city.id, title: "x", delivery: ["shipping"],
    }).validate());

  await refused("dos solicitudes de la misma persona", async () => {
    const first = await Market.VisitRequest.create({
      productId: listing.id, accountId: account.id, message: "primera",
    });
    made.visits.push(first.id);

    const second = await Market.VisitRequest.create({
      productId: listing.id, accountId: account.id, message: "segunda",
    });
    made.visits.push(second.id);
  });

  /* ── a visit, and the contact rule ─────────────────────────────────────── */
  const visit = await Market.VisitRequest.findByPk(made.visits[0]);

  check("la solicitud nace pendiente", visit.status === "pending");
  check("y sin fecha de respuesta", visit.respondedAt === null);

  const contact = (account_, open) => ({
    email: open ? account_?.email ?? null : null,
    phone: open ? account_?.phone ?? null : null,
  });

  const pending = contact({ email: "a@b.c", phone: "3181112233" }, visit.status === "accepted");
  check("pendiente no entrega correo ni teléfono", pending.email === null && pending.phone === null);

  await visit.update({ status: "accepted", respondedAt: new Date() });
  const open = contact({ email: "a@b.c", phone: "3181112233" }, visit.status === "accepted");
  check("aceptada sí los entrega", open.email === "a@b.c" && open.phone === "3181112233");

  /* ── the filters the grid sends ────────────────────────────────────────── */
  // Published, so the public queries can see it at all.
  await listing.update({ status: "active" });

  const { Op } = require("sequelize");

  const grid = (propertyWhere) =>
    Market.Product.findAll({
      where: { kind: "property", status: "active" },
      include: [{
        model: Market.Property, as: "property",
        where: propertyWhere, required: true,
      }],
    });

  const found = async (label, where, expected) => {
    const rows = await grid(where);
    const hit = rows.some(r => r.id === listing.id);
    check(label, hit === expected, hit ? "aparece" : "no aparece");
  };

  // The listing is a 3-bedroom, 62.5 m², estrato 4 rent with a lift and a gym.
  await found("filtra por operación", { operation: "rent" }, true);
  await found("y descarta la otra", { operation: "sale" }, false);
  await found("habitaciones es un mínimo, no un igual", { bedrooms: { [Op.gte]: 2 } }, true);
  await found("y excluye lo que no llega", { bedrooms: { [Op.gte]: 4 } }, false);
  await found("rango de área", { builtArea: { [Op.gte]: 50, [Op.lte]: 80 } }, true);
  await found("estrato entre varios", { stratum: { [Op.in]: [3, 4] } }, true);
  await found("amenidades: todas, no cualquiera",
    { features: { [Op.contains]: ["elevator", "gym"] } }, true);
  await found("y una que no tiene lo descarta",
    { features: { [Op.contains]: ["elevator", "pool"] } }, false);

  /* ── several values per filter ─────────────────────────────────────────── */
  // Narrowing a search is not the same job as filling a form. Somebody who
  // will live in a flat will also live in an apartaestudio, and in this city
  // or the one they could commute from — so these have to be unions, and a
  // union that quietly behaves like an intersection returns nothing and looks
  // like an empty market.
  const inCities = async (label, ids, expected) => {
    const rows = await Market.Product.findAll({
      where: { kind: "property", status: "active", cityId: { [Op.in]: ids } },
    });
    check(label, rows.some(r => r.id === listing.id) === expected);
  };

  const other = await Geo.City.findOne({ where: { id: { [Op.ne]: city.id }, active: true } });

  await inCities("una ciudad", [city.id], true);
  await inCities("varias ciudades incluyen la suya", [city.id, other.id], true);
  await inCities("y varias que no, la excluyen", [other.id], false);

  // Two conditions at once: "used" is this one's, "new" is not, and asking for
  // either has to find it.
  const byCondition = async (label, values, expected) => {
    const rows = await Market.Product.findAll({
      where: { kind: "property", status: "active" },
      include: [{
        model: Market.Property, as: "property",
        where: { condition: { [Op.in]: values } }, required: true,
      }],
    });
    check(label, rows.some(r => r.id === listing.id) === expected);
  };

  await byCondition("dos estados a la vez", ["new", "used"], true);
  await byCondition("y uno que no es el suyo", ["new"], false);

  // A parent slug has to bring its children with it, which is what makes
  // "Vivienda" a useful thing to tick.
  const parent = await Category.findByPk(category.parentId);
  const family = await Category.findAll({
    where: { [Op.or]: [{ id: parent.id }, { parentId: parent.id }] },
    attributes: ["id"],
  });

  const byFamily = await Market.Product.findAll({
    where: {
      kind: "property", status: "active",
      categoryId: { [Op.in]: family.map(c => c.id) },
    },
  });

  check("un padre arrastra a sus hijos",
    byFamily.some(r => r.id === listing.id), `${family.length} categorías`);

  /* ── saved, but never in a basket ──────────────────────────────────────── */
  // A property is one of the three things a listing can be that a heart still
  // makes sense on: you cannot buy a house with a button, but "keep this one"
  // is exactly what somebody looking for one is doing all day.
  await Market.Favourite.create({ accountId: account.id, productId: listing.id });

  const saved = await Market.Favourite.findOne({
    where: { productId: listing.id },
    include: [{
      model: Market.Product,
      as: "product",
      attributes: ["id", "kind", "title", "price"],
      include: [{
        model: Market.Property,
        as: "property",
        attributes: ["operation", "bedrooms", "address", "addressVisibility"],
        required: false,
      }],
    }],
  });

  check("un inmueble se puede guardar en favoritos", Boolean(saved));
  check("y el favorito sabe que es un inmueble", saved?.product?.kind === "property");
  check("y trae con qué dibujar su tarjeta",
    saved?.product?.property?.bedrooms === 3 && saved?.product?.property?.operation === "rent");
  check("y la dirección guardada también va recortada",
    publicAddress(saved?.product?.property) === "Calle 45");

  /* ── the property leaves with its listing ──────────────────────────────── */
  await Market.Product.destroy({ where: { id: listing.id } });
  made.products = [];
  made.visits = [];

  const orphanProperty = await Market.Property.findByPk(listing.id);
  const orphanVisits = await Market.VisitRequest.count({ where: { productId: listing.id } });
  const orphanSaves = await Market.Favourite.count({ where: { productId: listing.id } });

  check("el inmueble se va con la publicación", orphanProperty === null);
  check("y las visitas también", orphanVisits === 0);
  check("y los favoritos que lo apuntaban", orphanSaves === 0);

  /* ── clean up anything a failure left behind ───────────────────────────── */
  if (made.products.length) await Market.Product.destroy({ where: { id: made.products } });

  await db.close();

  console.log(failures ? `\n\x1b[31m${failures} fallos\x1b[0m` : "\n\x1b[32mtodo bien\x1b[0m");
  process.exit(failures ? 1 : 0);
})().catch(async (error) => {
  console.error("\x1b[31m" + error.stack + "\x1b[0m");
  if (made.products.length) {
    await Market.Product.destroy({ where: { id: made.products } }).catch(() => {});
  }
  await db.close().catch(() => {});
  process.exit(1);
});
