const { Op } = require("sequelize");
const catchAsync = require("../../utils/catchAsync.util");
const AppError = require("../../utils/appError.util");
const Market = require("../../models/market.models");
const Accounts = require("../../models/accounts.models");
const { mail } = require("../../mail");
const templates = require("../../mail/templates");

/**
 * Who works in a shop.
 *
 * The owner is not a row here. They are `Shop.accountId`, so no existing shop
 * needs a backfill and nobody can be removed from their own shop by the
 * endpoint that removes everybody else. The roster below assembles the two
 * into one list, because to a person reading it there is one list.
 *
 * Joining is by invitation and never by being added. Being in a shop makes you
 * its public representative, and an owner who could put somebody there without
 * their agreement could put a stranger's name behind their brand.
 */

// How many people one shop may hold. Not a licence tier — a bound, so that a
// compromised owner account cannot turn one shop into a mailing list.
const MAX_MEMBERS = 25;

const PERSON = {
  model: Accounts.Account,
  as: "account",
  attributes: ["id", "username", "avatar"],
};

// Never the email. The roster is shown to colleagues, and being in a shop
// together is not consent to hand out an address — the invitation reaches
// their mailbox without anybody reading it off a screen.
const seat = (row) => ({
  id: row.id,
  accountId: row.accountId,
  username: row.account?.username ?? null,
  avatar: row.account?.avatar ?? null,
  invitedAt: row.invitedAt,
  acceptedAt: row.acceptedAt,
  pending: row.acceptedAt === null,
});

const tell = (to, template) => {
  if (!to) return;
  void mail(to, template.subject, template.html);
};

/**
 * The roster, owner first.
 *
 * Readable by anybody who works there. A collaborator is entitled to know who
 * else has their shop's name on their listings.
 */
exports.list = catchAsync(async (req, res) => {
  const [owner, rows] = await Promise.all([
    Accounts.Account.findByPk(req.shop.accountId, {
      attributes: ["id", "username", "avatar"],
    }),
    Market.ShopMember.findAll({
      where: { shopId: req.shop.id },
      include: [PERSON],
      order: [["acceptedAt", "ASC NULLS FIRST"], ["invitedAt", "ASC"]],
    }),
  ]);

  return res.status(200).json({
    // Whether the person asking may invite and remove, so the interface does
    // not have to work it out from the roster it was just handed.
    owned: req.isOwner ?? req.shop.accountId === req.sessionAccount.id,
    owner: owner && {
      accountId: owner.id,
      username: owner.username,
      avatar: owner.avatar,
      owner: true,
    },
    members: rows.map(seat),
  });
});

/**
 * Inviting somebody.
 *
 * By username or by email, because an owner knows one or the other and rarely
 * both. Answering the same way whichever was used and whether or not it
 * matched would be kinder to a probe than to the owner, who needs to know
 * their colleague's name was mistyped — so this does say when nobody was
 * found. The address is never echoed back, so the endpoint cannot be used to
 * confirm that a given email has an account.
 */
exports.invite = catchAsync(async (req, res, next) => {
  const handle = String(req.body.handle ?? "").trim();

  if (!handle) return next(new AppError("Say who you want to invite", 400));

  const account = await Accounts.Account.findOne({
    where: handle.includes("@")
      ? { email: handle.toLowerCase() }
      : { username: handle },
    attributes: ["id", "username", "email"],
  });

  if (!account) {
    return next(new AppError("Nobody on Plaza goes by that", 404));
  }

  if (account.id === req.shop.accountId) {
    return next(new AppError("They already own this shop", 409));
  }

  const held = await Market.ShopMember.count({ where: { shopId: req.shop.id } });

  if (held >= MAX_MEMBERS) {
    return next(new AppError(`A shop can hold ${MAX_MEMBERS} people`, 409));
  }

  // The unique index enforces this underneath; checked here so the answer is a
  // sentence rather than a constraint violation, and so an owner who invites
  // twice is told which of the two states they are in.
  const existing = await Market.ShopMember.findOne({
    where: { shopId: req.shop.id, accountId: account.id },
  });

  if (existing) {
    return next(new AppError(
      existing.acceptedAt ? "They already work here" : "They have already been invited",
      409,
    ));
  }

  const member = await Market.ShopMember.create({
    shopId: req.shop.id,
    accountId: account.id,
    invitedBy: req.sessionAccount.id,
  });

  tell(
    account.email,
    templates.shopInvited({ username: account.username, shop: req.shop.name })
  );

  const created = await Market.ShopMember.findByPk(member.id, { include: [PERSON] });

  return res.status(201).json(seat(created));
});

/**
 * Removing somebody, or leaving.
 *
 * One endpoint for both, because they are the same row going away. The owner
 * may remove anybody; anybody may remove themselves. The owner may not remove
 * themselves — closing a shop is a different action with a different rule, and
 * a shop with nobody in it is not a state worth being able to reach by
 * accident.
 *
 * Cancelling an invitation is the same call: a pending row is still a row.
 */
exports.remove = catchAsync(async (req, res, next) => {
  const accountId = Number(req.params.accountId);

  if (accountId === req.shop.accountId) {
    return next(new AppError("The owner cannot be removed from their own shop", 409));
  }

  const isOwner = req.shop.accountId === req.sessionAccount.id;
  const isSelf = accountId === req.sessionAccount.id;

  if (!isOwner && !isSelf) {
    return next(new AppError("Only the owner can remove somebody else", 403));
  }

  const member = await Market.ShopMember.findOne({
    where: { shopId: req.shop.id, accountId },
  });

  if (!member) return next(new AppError("They do not work here", 404));

  await member.destroy();

  // Their listings stay with the shop. That is the whole point of the shop
  // being the seller: an agency that loses an agent does not lose the flats.
  return res.status(204).send();
});

/* ─── the other side: what I have been invited to ─────────────────────────── */

/** Invitations waiting on me. */
exports.invitations = catchAsync(async (req, res) => {
  const rows = await Market.ShopMember.findAll({
    where: { accountId: req.sessionAccount.id, acceptedAt: null },
    include: [
      {
        model: Market.Shop,
        as: "shop",
        attributes: ["id", "name", "slug", "logo", "status"],
      },
      { model: Accounts.Account, as: "inviter", attributes: ["username"], required: false },
    ],
    order: [["invitedAt", "DESC"]],
  });

  return res.status(200).json(
    rows.map(row => ({
      id: row.id,
      invitedAt: row.invitedAt,
      invitedBy: row.inviter?.username ?? null,
      shop: row.shop,
    }))
  );
});

/**
 * Accepting, and declining.
 *
 * Declining deletes the row rather than marking it refused. There is nothing to
 * remember: an owner may invite again, and a table of every invitation anybody
 * ever turned down is a record with no reader.
 */
const answer = (accept) => catchAsync(async (req, res, next) => {
  const member = await Market.ShopMember.findOne({
    where: { id: req.params.id, accountId: req.sessionAccount.id },
    include: [
      { model: Market.Shop, as: "shop", attributes: ["id", "name", "accountId"] },
    ],
  });

  // 404 for "no such invitation" and for "not yours" alike.
  if (!member) return next(new AppError("Invitation not found", 404));

  if (member.acceptedAt) {
    return next(new AppError("You already work here", 409));
  }

  if (!accept) {
    await member.destroy();
    return res.status(204).send();
  }

  await member.update({ acceptedAt: new Date() });

  const owner = await Accounts.Account.findByPk(member.shop?.accountId, {
    attributes: ["username", "email"],
  });

  tell(
    owner?.email,
    templates.shopInviteAccepted({
      username: owner?.username,
      person: req.sessionAccount.username,
      shop: member.shop?.name,
    })
  );

  return res.status(200).json({
    id: member.id,
    acceptedAt: member.acceptedAt,
    shop: member.shop && { id: member.shop.id, name: member.shop.name },
  });
});

exports.accept = answer(true);
exports.decline = answer(false);
