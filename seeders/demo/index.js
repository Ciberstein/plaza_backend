const { Op } = require("sequelize");
const { db } = require("../../database/config");
const Market = require("../../models/market.models");
const Accounts = require("../../models/accounts.models");
const Geo = require("../../models/geo.models");
const { Category } = require("../../models/categories.models");
const { hash } = require("../../utils/hash.util");
const { assertDemoAllowed, demoAllowed, demoEmails } = require("./guard");
const data = require("./data");
const { guest, resetGuest } = require("./guest");

/**
 * A marketplace with things in it, for a laptop.
 *
 * This is not the seeder in the folder above. That one plants reference data —
 * countries, cities, the category tree — which production needs and which is
 * written to be idempotent forever. This one invents people and their
 * belongings so that every screen has something on it, and it exists only
 * where NODE_ENV says development.
 *
 * It is destructive by design: the whole demo set is removed and rebuilt
 * rather than reconciled, because reconciling fictional data is work spent on
 * keeping a fiction consistent. What makes that safe is that everything it can
 * see is addressed at @demo.plaza.test, and nothing else is ever matched.
 */

const say = (label, detail = "") =>
  console.log("\x1b[34mDEMO:\x1b[0m", "\x1b[32m" + label + "\x1b[0m", detail ? "\x1b[90m" + detail + "\x1b[0m" : "");

/**
 * Everything the demo owns, in the order the foreign keys allow.
 *
 * Not a single `Account.destroy`. `Shop.accountId` is NOT NULL and its
 * association declares no `onDelete`, so Sequelize's default would try to null
 * it and the delete would fail — or worse, succeed on a database configured
 * differently and orphan a shop. The order below is the dependency order,
 * written out so it can be read and checked.
 */
const wipe = async () => {
  assertDemoAllowed("delete demo data");

  const accounts = await Accounts.Account.findAll({
    where: { email: demoEmails(Op) },
    attributes: ["id"],
  });

  if (!accounts.length) return 0;

  const ids = accounts.map(a => a.id);

  // Orders first: a suborder points at a shop and at a seller, and both are
  // about to go.
  const orders = await Market.Order.findAll({ where: { accountId: ids }, attributes: ["id"] });
  const sold = await Market.SubOrder.findAll({ where: { accountId: ids }, attributes: ["orderId"] });

  const orderIds = [...new Set([...orders.map(o => o.id), ...sold.map(s => s.orderId)])];
  if (orderIds.length) await Market.Order.destroy({ where: { id: orderIds } });

  // Then the catalogue, which takes its own images, questions, visits,
  // favourites and reviews with it by cascade.
  await Market.Product.destroy({ where: { accountId: ids } });

  // Then the brands, which no listing points at any more.
  await Market.Shop.destroy({ where: { accountId: ids } });

  // And finally the people.
  await Accounts.Account.destroy({ where: { id: ids } });

  return ids.length;
};

/** Looks up everything the data file refers to by name, once. */
const resolve = async () => {
  const cities = await Geo.City.findAll({ attributes: ["id", "name"] });
  const categories = await Category.findAll({ attributes: ["id", "slug"] });

  return {
    city: new Map(cities.map(c => [c.name, c.id])),
    category: new Map(categories.map(c => [c.slug, c.id])),
  };
};

const seedDemo = async () => {
  if (!demoAllowed()) return;

  const removed = await wipe();
  if (removed) say("cleared", `${removed} previous demo accounts`);

  const { city, category } = await resolve();
  const password = await hash(data.DEMO_PASSWORD);

  await db.transaction(async (transaction) => {
    /* ── people ────────────────────────────────────────────────────────── */
    const people = new Map();

    for (const entry of data.ACCOUNTS) {
      const account = await Accounts.Account.create({
        ...entry,
        password,
        // Verified, because every interesting path in this app is behind a
        // confirmed email and a demo that starts by asking you to check a
        // mailbox that does not exist is a demo of the sign-up form.
        verified: true,
        phone: "3001112233",
      }, { transaction });

      people.set(entry.email, account.id);
    }

    /* ── brands ────────────────────────────────────────────────────────── */
    const brands = new Map();

    for (const entry of data.SHOPS) {
      const shop = await Market.Shop.create({
        accountId: people.get(entry.owner),
        name: entry.name,
        slug: entry.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
        description: entry.description,
        cityId: city.get(entry.city) ?? null,
        shipping: entry.shipping,
        status: entry.status,
        approvedAt: entry.status === "active" ? new Date() : null,
        submittedAt: entry.status === "pending" ? new Date() : null,
      }, { transaction });

      brands.set(entry.name, shop.id);

      for (const email of entry.members ?? []) {
        await Market.ShopMember.create({
          shopId: shop.id,
          accountId: people.get(email),
          invitedBy: people.get(entry.owner),
          // Already accepted: a demo whose members are all pending shows the
          // invitation screen and none of the thing invitations are for.
          acceptedAt: new Date(),
        }, { transaction });
      }
    }

    /* ── the catalogue ─────────────────────────────────────────────────── */
    const listings = new Map();

    const publish = async (entry, kind, extra = {}) => {
      const product = await Market.Product.create({
        accountId: people.get(entry.seller),
        shopId: entry.shop ? brands.get(entry.shop) : null,
        kind,
        categoryId: category.get(entry.category),
        cityId: city.get(entry.city),
        title: entry.title,
        description: entry.description,
        price: entry.price,
        currency: "COP",
        rateUnit: entry.rateUnit ?? null,
        stock: kind === "good" ? entry.stock : 1,
        condition: kind === "good" ? entry.condition : null,
        delivery: entry.delivery ?? [],
        status: "active",
        ...extra,
      }, { transaction });

      listings.set(entry.title, product);
      return product;
    };

    for (const entry of data.GOODS) await publish(entry, "good");
    for (const entry of data.SERVICES) await publish(entry, "service");

    for (const entry of data.PROPERTIES) {
      const product = await publish(entry, "property");
      await Market.Property.create(
        { ...entry.property, productId: product.id },
        { transaction },
      );
    }

    /* ── purchases, and what people thought of them ────────────────────── */
    for (const entry of data.ORDERS) {
      const product = listings.get(entry.listing);
      if (!product) continue;

      const total = Number(product.price) * entry.quantity;

      const order = await Market.Order.create({
        accountId: people.get(entry.buyer),
        total,
        currency: "COP",
        status: entry.status === "delivered" ? "fulfilled" : "pending",
      }, { transaction });

      const suborder = await Market.SubOrder.create({
        orderId: order.id,
        accountId: product.accountId,
        shopId: product.shopId,
        subtotal: total,
        status: entry.status,
        // Whoever confirmed it is whoever holds the listing here. A demo does
        // not need a colleague to have answered, and pretending one did would
        // put a name on a screen with nothing behind it.
        handledBy: ["confirmed", "delivered"].includes(entry.status) ? product.accountId : null,
      }, { transaction });

      await Market.OrderItem.create({
        subOrderId: suborder.id,
        productId: product.id,
        title: product.title,
        unitPrice: product.price,
        quantity: entry.quantity,
      }, { transaction });

      // A rating needs a delivered suborder, which is why the states above are
      // not decoration.
      if (entry.rating) {
        await Market.SellerRating.create({
          subOrderId: suborder.id,
          sellerId: product.accountId,
          shopId: product.shopId,
          accountId: people.get(entry.buyer),
          stars: entry.rating.stars,
          comment: entry.rating.comment,
        }, { transaction });
      }

      if (entry.review) {
        await Market.ProductReview.create({
          productId: product.id,
          accountId: people.get(entry.buyer),
          stars: entry.review.stars,
          body: entry.review.body,
        }, { transaction });
      }
    }

    /* ── questions and visits ──────────────────────────────────────────── */
    for (const entry of data.QUESTIONS) {
      const product = listings.get(entry.listing);
      if (!product) continue;

      await Market.ProductQuestion.create({
        productId: product.id,
        accountId: people.get(entry.asker),
        body: entry.body,
        answer: entry.answer,
        answeredAt: entry.answer ? new Date() : null,
      }, { transaction });
    }

    for (const entry of data.VISITS) {
      const product = listings.get(entry.listing);
      if (!product) continue;

      await Market.VisitRequest.create({
        productId: product.id,
        accountId: people.get(entry.visitor),
        message: entry.message,
        status: entry.status,
        respondedAt: entry.status === "pending" ? null : new Date(),
      }, { transaction });
    }

    say("seeded", `${people.size} people · ${brands.size} shops · ${listings.size} listings`);
  });

  await resetGuest({ force: true });
};

module.exports = { seedDemo, wipe, guest, resetGuest };
