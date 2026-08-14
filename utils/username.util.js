const { Op, fn, col, where } = require("sequelize");
const Accounts = require("../models/accounts.models");

const MIN = 3;
const MAX = 40;

/**
 * Whether someone already goes by this name.
 *
 * Compared without case. "Cyberstein" and "cyberstein" are the same person to
 * every reader, and on a marketplace where the username is what a buyer sees
 * next to a listing, letting both exist is an impersonation waiting to happen.
 *
 * Written as LOWER(username) = LOWER(?) rather than with iLike, because iLike
 * treats % and _ in the argument as wildcards: a username of "%" would match
 * every account and report itself taken.
 */
exports.taken = async (username, exceptId = null) => {
  const clauses = [where(fn("lower", col("username")), username.trim().toLowerCase())];

  // Saving your profile without touching your name must not collide with you.
  if (exceptId) clauses.push({ id: { [Op.ne]: exceptId } });

  const existing = await Accounts.Account.findOne({ where: { [Op.and]: clauses } });

  return Boolean(existing);
};

/** The same rule wherever a name is set, so the two cannot drift apart. */
exports.check = (username) => {
  const name = String(username ?? "").trim();

  if (!name) return "Pick a name to go by";
  if (name.length < MIN) return `Use at least ${MIN} characters`;
  if (name.length > MAX) return `Keep it under ${MAX} characters`;

  return null;
};

exports.MIN = MIN;
exports.MAX = MAX;
