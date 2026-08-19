/**
 * The two rules everything in this folder obeys.
 *
 * What lives here creates accounts with published passwords and deletes them
 * again on a timer. Both are fine on a laptop and neither is fine anywhere
 * else, so the gate is not a convention or a comment — it is a function every
 * entry point calls first, and it is written to fail closed.
 */

// The domain every demo account is created under. It is the whole safety
// story for the delete: a cleanup matched on "accounts older than a day"
// would eventually meet a real account having a bad day, and one matched on
// this domain cannot.
//
// `.test` is reserved by RFC 2606 precisely so it can never be a real domain,
// which means these addresses can never receive mail and can never collide
// with somebody's actual address.
const DEMO_DOMAIN = "@demo.plaza.test";

/**
 * Whether this process may create or destroy demo data.
 *
 * Two conditions, and the second is not redundant. `NODE_ENV === "development"`
 * is the switch the brief asked for; the explicit refusal on "production" is
 * there because the most likely way this ends up somewhere it should not is a
 * deployment with NODE_ENV unset, where a single positive check would be
 * ambiguous and this one is not.
 */
const demoAllowed = () =>
  process.env.NODE_ENV === "development" && process.env.NODE_ENV !== "production";

/**
 * Refuses loudly rather than returning false.
 *
 * Used by the destructive paths. A seeder that quietly does nothing in the
 * wrong environment is fine; a delete that quietly does nothing is a delete
 * somebody will assume ran.
 */
const assertDemoAllowed = (what) => {
  if (demoAllowed()) return;

  throw new Error(
    `Refusing to ${what}: demo data only exists when NODE_ENV is development ` +
    `(it is ${process.env.NODE_ENV || "unset"}).`,
  );
};

// Everything the cleanup is allowed to match, as a Sequelize condition. Kept
// here rather than written at each call site, because it is the one expression
// standing between a demo reset and somebody's real catalogue.
const demoEmails = (Op) => ({ [Op.like]: `%${DEMO_DOMAIN}` });

module.exports = { DEMO_DOMAIN, demoAllowed, assertDemoAllowed, demoEmails };
