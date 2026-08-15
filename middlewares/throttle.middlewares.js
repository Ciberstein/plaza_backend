const { rateLimit, ipKeyGenerator } = require("express-rate-limit");

/**
 * How often anyone may ask for anything.
 *
 * These are the ceilings, not the expected traffic. Every number here is set
 * high enough that a person clicking as fast as they can never meets it, and
 * low enough that a script pointed at the API does — a limit a real user trips
 * is a limit that gets raised until it stops protecting anything.
 *
 * The credential endpoints keep their own tighter limiters where they are
 * mounted, next to the rules they enforce.
 *
 * Note for the day this runs on more than one instance: the default store is
 * this process's memory, so two instances mean two independent counts and
 * twice the real ceiling. That is the moment to put the counters in Redis,
 * which is a store swap and nothing else.
 */

const refuse = (text) => ({ status: "fail", message: text });

/**
 * Keyed by account rather than by address.
 *
 * An address is shared — everyone behind a mobile carrier's NAT looks like one
 * visitor — and it is rotated at will by anyone who cares enough to abuse
 * this. An account costs a verified email address, which is the point: the
 * cost of getting a fresh bucket should be higher than the cost of waiting.
 *
 * Falls back to the address when there is no session, which only happens if
 * one of these is ever mounted outside a protected router. `ipKeyGenerator`
 * rather than `req.ip` directly: it folds an IPv6 address down to its /56, so
 * that the trillions of addresses one subscriber is handed are one bucket.
 */
const byAccount = (req) =>
  req.sessionAccount ? `account:${req.sessionAccount.id}` : ipKeyGenerator(req.ip);

const build = ({ windowMs, limit, text, keyGenerator }) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    message: refuse(text),
    ...(keyGenerator ? { keyGenerator } : {}),
  });

/**
 * The blunt hammer, over the whole API.
 *
 * Three hundred a minute is around fifty page loads, since a page asks for the
 * session, the vocabulary, a grid, the saved ids and the basket count. Nobody
 * browsing reaches it; anything that does is not browsing.
 */
exports.baseline = build({
  windowMs: 60 * 1000,
  limit: 300,
  text: "Too many requests. Slow down and try again in a minute.",
});

/**
 * Browsing and searching, which are the expensive reads.
 *
 * Every one of them scans the products table — there is no index that a
 * leading-wildcard search can use — so the cost of a request here is set by
 * how much is for sale, not by how much was asked for. That is the reason this
 * is separate from the baseline and much lower.
 */
exports.browsing = build({
  windowMs: 60 * 1000,
  limit: 90,
  text: "Too many searches. Try again in a minute.",
});

/**
 * Anything that puts a file on Cloudinary, which is billed per call.
 *
 * Forty an hour is five listings photographed to the limit. By account,
 * because the bill follows the account and not the address it was sent from.
 */
exports.uploads = build({
  windowMs: 60 * 60 * 1000,
  limit: 40,
  text: "Too many uploads. Try again later.",
  keyGenerator: byAccount,
});

/**
 * Anything that puts a message in somebody else's inbox.
 *
 * This is the one that matters most. An endpoint that mails a stranger on
 * every call is a megaphone pointed at their mailbox and at the sending
 * domain's reputation, and the damage is done long before the database
 * notices anything unusual. Twenty an hour is far more than anyone asks,
 * answers or orders in earnest.
 */
exports.mailing = build({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  text: "You have sent a lot of messages. Try again later.",
  keyGenerator: byAccount,
});
