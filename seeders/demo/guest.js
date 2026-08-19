const { Op } = require("sequelize");
const Market = require("../../models/market.models");
const Accounts = require("../../models/accounts.models");
const { hash } = require("../../utils/hash.util");
const { check } = require("../../utils/password.util");
const { DEMO_DOMAIN, assertDemoAllowed, demoAllowed } = require("./guard");

/**
 * The account whose password is printed on the login screen.
 *
 * Somebody opening Plaza for the first time should be able to look around from
 * the inside without inventing an address and waiting for a code. So there is
 * one account anybody may use, and it is wiped and rebuilt every day.
 *
 * The daily rebuild is not housekeeping. A shared account collects whatever
 * everybody did to it — half-written listings, a shop mid-review, a basket
 * with somebody else's order in it — and within a week it stops resembling a
 * new account at all. Rebuilding it means the next person to sign in sees what
 * the first one saw.
 *
 * The password rotates with it, which is why it must be shown rather than
 * documented: anything written down about this account is wrong by tomorrow.
 */

const GUEST_EMAIL = `invitado${DEMO_DOMAIN}`;
const GUEST_USERNAME = "invitado";

// The word the password is built on. Not "invitado" and not "plaza": the
// project's own password rules refuse a password built out of the username or
// the email, and refusing to seed a password the app itself would reject is
// the difference between a demo account and a demo account that cannot change
// its password.
const GUEST_WORD = "Mercado";

/**
 * Today's password.
 *
 * Derived from the date rather than stored, so that anything asking — the
 * login screen, the seeder, a person reading the logs — computes the same
 * answer without a shared secret to keep in step.
 *
 * Dots between the numbers on purpose. The rules refuse runs like `1111`, and
 * the eleventh of November would produce exactly that without them.
 */
const passwordFor = (date = new Date()) => {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${GUEST_WORD}.${day}.${month}`;
};

/** What the login screen shows. Absent outside development, which is the point. */
const guest = () =>
  demoAllowed() ? { email: GUEST_EMAIL, password: passwordFor() } : null;

/**
 * Everything this one account owns, in the order the foreign keys allow.
 *
 * Deliberately not a helper shared with the demo wipe. That one clears a whole
 * cast by email domain; this one clears exactly one address, and keeping them
 * apart means neither can be widened by accident while editing the other.
 */
const clear = async () => {
  const account = await Accounts.Account.findOne({
    where: { email: GUEST_EMAIL },
    attributes: ["id", "createdAt"],
  });

  if (!account) return null;

  // Orders first — a suborder points at a shop that is about to go.
  const bought = await Market.Order.findAll({ where: { accountId: account.id }, attributes: ["id"] });
  const sold = await Market.SubOrder.findAll({ where: { accountId: account.id }, attributes: ["orderId"] });

  const orderIds = [...new Set([...bought.map(o => o.id), ...sold.map(s => s.orderId)])];
  if (orderIds.length) await Market.Order.destroy({ where: { id: orderIds } });

  // Then the listings, which take their photographs, questions, visits and
  // reviews with them by cascade.
  await Market.Product.destroy({ where: { accountId: account.id } });

  // Then the shops it opened, which nothing points at any more.
  await Market.Shop.destroy({ where: { accountId: account.id } });

  await Accounts.Account.destroy({ where: { id: account.id } });

  return account.createdAt;
};

const DAY = 24 * 60 * 60 * 1000;

/**
 * Rebuilds the guest if it is missing or a day old.
 *
 * Checked by age rather than trusted to a schedule, because a laptop is asleep
 * at four in the morning more often than not. The cron below is what makes it
 * happen on a machine that stays up; this is what makes it happen on one that
 * does not.
 */
const resetGuest = async ({ force = false } = {}) => {
  if (!demoAllowed()) return null;
  assertDemoAllowed("rebuild the guest account");

  const existing = await Accounts.Account.findOne({
    where: { email: GUEST_EMAIL },
    attributes: ["id", "createdAt"],
  });

  const stale = existing && Date.now() - new Date(existing.createdAt).getTime() > DAY;

  if (existing && !stale && !force) return null;

  await clear();

  const password = passwordFor();

  // Checked against the project's own rules before it is stored. A generated
  // password that the app would refuse is a trap the first person to try
  // changing it walks into, and the date is what generates it — so this is the
  // kind of thing that breaks on one day of the year and no others.
  const weak = check(password, { email: GUEST_EMAIL, username: GUEST_USERNAME });
  if (weak) throw new Error(`The generated guest password is not allowed: ${weak}`);

  await Accounts.Account.create({
    username: GUEST_USERNAME,
    email: GUEST_EMAIL,
    password: await hash(password),
    role: "seller",
    // Verified, because everything worth showing is behind a confirmed email
    // and there is no mailbox at a .test domain to confirm it with.
    verified: true,
    phone: "3001112233",
  });

  console.log(
    "\x1b[34mDEMO:\x1b[0m",
    "\x1b[32mguest ready\x1b[0m",
    `\x1b[90m${GUEST_EMAIL} · ${password}\x1b[0m`,
  );

  return password;
};

module.exports = { guest, resetGuest, GUEST_EMAIL, passwordFor };
