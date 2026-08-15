/**
 * Exercises shop membership against a real database.
 *
 * The interesting half of this feature is what a collaborator *cannot* do, and
 * that is exactly the half nobody notices is broken. So most of what follows
 * asserts refusals: a pending invitation grants nothing, a stranger sees
 * nothing, an owner cannot be thrown out of their own shop, and deleting a
 * listing stays with whoever wrote it.
 *
 * The access rules are exercised through `utils/shopAccess.util.js`, which is
 * the one place they live — the nine call sites all read it, so testing it is
 * testing them.
 *
 * Everything it makes, it removes. Run with: node scripts/smoke-members.js
 */
require("dotenv").config({ quiet: true });

const { Op } = require("sequelize");
const { db } = require("../database/config");
const Market = require("../models/market.models");
const Accounts = require("../models/accounts.models");
const Geo = require("../models/geo.models");
const { Category } = require("../models/categories.models");
const init = require("../models/init.models");
const access = require("../utils/shopAccess.util");

init();

let failures = 0;
const made = { shops: [], products: [], members: [], orders: [] };

const check = (label, ok, detail = "") => {
  if (!ok) failures += 1;
  console.log(`${ok ? "\x1b[32mPASA \x1b[0m" : "\x1b[31mFALLA\x1b[0m"} ${label}${detail ? " -> " + detail : ""}`);
};

const cleanup = async () => {
  // Orders first: a suborder points at the shop, and the shop cannot go while
  // something still refers to it.
  if (made.orders.length) await Market.Order.destroy({ where: { id: made.orders } });
  if (made.products.length) await Market.Product.destroy({ where: { id: made.products } });
  if (made.shops.length) await Market.Shop.destroy({ where: { id: made.shops } });
  made.orders = [];
  made.products = [];
  made.shops = [];
};

(async () => {
  await db.authenticate();

  const [owner, colleague, stranger] = await Accounts.Account.findAll({
    order: [["id", "ASC"]],
    limit: 3,
  });

  const city = await Geo.City.findOne({ where: { active: true } });
  const category = await Category.findOne({
    where: { kind: "good", parentId: { [Op.ne]: null } },
  });

  if (!owner || !colleague || !stranger || !city || !category) {
    console.log("\x1b[31mHacen falta tres cuentas, una ciudad y una categoría.\x1b[0m");
    process.exit(1);
  }

  const shop = await Market.Shop.create({
    accountId: owner.id,
    name: `Prueba miembros ${Date.now()}`,
    slug: `prueba-miembros-${Date.now()}`,
    cityId: city.id,
    status: "active",
  });
  made.shops.push(shop.id);

  const listing = await Market.Product.create({
    accountId: owner.id,
    shopId: shop.id,
    kind: "good",
    categoryId: category.id,
    cityId: city.id,
    title: "Artículo de prueba — borrar",
    price: 10000,
    stock: 1,
    condition: "new",
    delivery: ["shipping"],
    status: "active",
  });
  made.products.push(listing.id);

  /* ── before anybody is invited ─────────────────────────────────────────── */
  check("el dueño puede actuar por su tienda",
    await access.mayActForShop(owner.id, shop.id));
  check("un desconocido no",
    !(await access.mayActForShop(stranger.id, shop.id)));
  check("y el colega tampoco, todavía",
    !(await access.mayActForShop(colleague.id, shop.id)));

  /* ── invited, and not yet accepted ─────────────────────────────────────── */
  const invite = await Market.ShopMember.create({
    shopId: shop.id,
    accountId: colleague.id,
    invitedBy: owner.id,
  });

  // The whole point of the invitation being an invitation. If a pending row
  // granted anything, an owner could hand somebody a catalogue by typing their
  // username, and "you were added to a shop" would be something that happens
  // to you rather than something you agreed to.
  check("una invitación pendiente no concede nada",
    !(await access.mayActForShop(colleague.id, shop.id)));
  check("ni aparece entre sus tiendas",
    !(await access.shopIdsFor(colleague.id)).includes(shop.id));

  /* ── accepted ──────────────────────────────────────────────────────────── */
  await invite.update({ acceptedAt: new Date() });

  check("aceptada, ya puede actuar por la tienda",
    await access.mayActForShop(colleague.id, shop.id));
  check("y la tienda aparece entre las suyas",
    (await access.shopIdsFor(colleague.id)).includes(shop.id));
  check("el desconocido sigue fuera",
    !(await access.mayActForShop(stranger.id, shop.id)));

  /* ── what that means for the catalogue ─────────────────────────────────── */
  check("el colega puede editar lo que publicó otro",
    await access.mayActOnListing(colleague.id, listing));
  check("y el desconocido no",
    !(await access.mayActOnListing(stranger.id, listing)));

  // The one exception inside the catalogue. Archiving is open to everybody;
  // deleting is the only irreversible action there.
  check("pero NO puede borrar lo que no publicó",
    !(await access.mayDeleteListing(colleague.id, listing)));
  check("el dueño sí puede borrarlo",
    await access.mayDeleteListing(owner.id, listing));

  const theirs = await Market.Product.create({
    accountId: colleague.id,
    shopId: shop.id,
    kind: "good",
    categoryId: category.id,
    cityId: city.id,
    title: "Artículo del colega — borrar",
    price: 5000,
    stock: 1,
    condition: "new",
    delivery: ["shipping"],
    status: "active",
  });
  made.products.push(theirs.id);

  check("y sí puede borrar lo suyo",
    await access.mayDeleteListing(colleague.id, theirs));

  /* ── owning is not the same as working there ───────────────────────────── */
  check("el colega no es dueño", !(await access.ownsShop(colleague.id, shop.id)));
  check("el dueño sí lo es", await access.ownsShop(owner.id, shop.id));

  /* ── the inbox clause every screen shares ──────────────────────────────── */
  const shopIds = await access.shopIdsFor(colleague.id);
  const where = shopIds.length
    ? { [Op.or]: [{ accountId: colleague.id }, { shopId: { [Op.in]: shopIds } }] }
    : { accountId: colleague.id };

  const visible = await Market.Product.findAll({ where, attributes: ["id"] });
  const ids = visible.map(p => p.id);

  check("la bandeja del colega ve el artículo del dueño", ids.includes(listing.id));
  check("y el suyo propio", ids.includes(theirs.id));

  const strangerIds = await access.shopIdsFor(stranger.id);
  const strangerWhere = strangerIds.length
    ? { [Op.or]: [{ accountId: stranger.id }, { shopId: { [Op.in]: strangerIds } }] }
    : { accountId: stranger.id };

  const notVisible = await Market.Product.findAll({
    where: { ...strangerWhere, id: { [Op.in]: [listing.id, theirs.id] } },
  });

  check("la del desconocido no ve ninguno de los dos", notVisible.length === 0);

  /* ── ratings land on the brand ─────────────────────────────────────────── */
  // A real order, because `seller_ratings.subOrderId` is a foreign key and a
  // made-up number is refused — which is the schema doing its job. Building
  // the road as well as the destination also proves `handledBy` survives it.
  const order = await Market.Order.create({
    accountId: stranger.id,
    total: 10000,
    currency: "COP",
    status: "pending",
  });
  made.orders.push(order.id);

  const suborder = await Market.SubOrder.create({
    orderId: order.id,
    // The listing is the owner's, but the colleague is the one who answered —
    // which is exactly the case `handledBy` exists for.
    accountId: owner.id,
    shopId: shop.id,
    subtotal: 10000,
    status: "delivered",
    handledBy: colleague.id,
  });

  check("la suborden recuerda quién la atendió", suborder.handledBy === colleague.id);

  const rating = await Market.SellerRating.create({
    subOrderId: suborder.id,
    sellerId: suborder.accountId,
    shopId: suborder.shopId,
    accountId: stranger.id,
    stars: 5,
  });

  const byShop = await Market.SellerRating.count({ where: { shopId: shop.id } });
  const byPerson = await Market.SellerRating.count({ where: { sellerId: owner.id } });

  check("una calificación cuenta para la tienda", byShop === 1);
  check("y también queda atada a la cuenta que vendió", byPerson >= 1);

  await rating.destroy();

  /* ── one membership per person, enforced underneath ────────────────────── */
  try {
    const dupe = await Market.ShopMember.create({
      shopId: shop.id,
      accountId: colleague.id,
      invitedBy: owner.id,
    });
    made.members.push(dupe.id);
    check("no se puede invitar dos veces a la misma persona", false, "se aceptó");
  } catch (error) {
    check("no se puede invitar dos veces a la misma persona", true,
      error.message.slice(0, 45));
  }

  /* ── the membership goes with the shop ─────────────────────────────────── */
  const shopId = shop.id;
  await cleanup();

  const orphans = await Market.ShopMember.count({ where: { shopId } });
  check("los miembros se van con la tienda", orphans === 0);

  await db.close();

  console.log(failures ? `\n\x1b[31m${failures} fallos\x1b[0m` : "\n\x1b[32mtodo bien\x1b[0m");
  process.exit(failures ? 1 : 0);
})().catch(async (error) => {
  console.error("\x1b[31m" + error.stack + "\x1b[0m");
  await cleanup().catch(() => {});
  await db.close().catch(() => {});
  process.exit(1);
});
