const crypto = require("crypto");
const { Op } = require("sequelize");
const Auth = require("../models/auth.models");
const { hash, compare } = require("./hash.util");

const TTL_MINUTES = Number(process.env.AUTH_CODE_TTL_MINUTES || 15);
const MAX_ATTEMPTS = 5;

// Six digits, generated with the cryptographic source. Math.random is seeded
// from the clock and its output is predictable given a few samples, which for a
// password-reset code means guessable.
const generate = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");

/**
 * Issues a code, invalidating any earlier one for the same purpose.
 *
 * Superseding matters: without it, every code ever mailed stays valid until it
 * expires, so a person who requested five resets has five live codes and an
 * attacker has five chances.
 */
const issue = async ({ accountId, purpose, payload = null }) => {
  await Auth.Code.update(
    { consumedAt: new Date() },
    { where: { accountId, purpose, consumedAt: null } }
  );

  const code = generate();

  await Auth.Code.create({
    accountId,
    purpose,
    code: await hash(code),
    payload,
    expiresAt: new Date(Date.now() + TTL_MINUTES * 60 * 1000),
  });

  // Returned in the clear exactly once, to be mailed. It is never readable
  // again from anywhere.
  return { code, minutes: TTL_MINUTES };
};

/**
 * Checks a code and consumes it.
 *
 * Returns { ok, reason, payload } rather than throwing, so the caller decides
 * how much to tell the client — on a password reset, "no such code" and "wrong
 * code" should read identically from outside.
 */
const redeem = async ({ accountId, purpose, code }) => {
  const record = await Auth.Code.findOne({
    where: {
      accountId,
      purpose,
      consumedAt: null,
      expiresAt: { [Op.gt]: new Date() },
    },
    order: [["createdAt", "DESC"]],
  });

  if (!record) return { ok: false, reason: "expired" };

  if (record.attempts >= MAX_ATTEMPTS) {
    // Burned rather than left to expire: once the ceiling is hit the code is
    // no longer trustworthy, and a fresh one has to be requested.
    await record.update({ consumedAt: new Date() });
    return { ok: false, reason: "attempts" };
  }

  if (!(await compare(String(code || ""), record.code))) {
    await record.update({ attempts: record.attempts + 1 });
    return { ok: false, reason: "mismatch", left: MAX_ATTEMPTS - record.attempts - 1 };
  }

  await record.update({ consumedAt: new Date() });

  return { ok: true, payload: record.payload };
};

// How long ago the live code for this purpose was sent, so a resend can be
// refused politely instead of mailing on every click.
const lastIssuedAt = async ({ accountId, purpose }) => {
  const record = await Auth.Code.findOne({
    where: { accountId, purpose },
    order: [["createdAt", "DESC"]],
    attributes: ["createdAt"],
  });

  return record?.createdAt ?? null;
};

module.exports = { issue, redeem, lastIssuedAt, TTL_MINUTES, MAX_ATTEMPTS };
