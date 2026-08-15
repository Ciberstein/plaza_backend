const catchAsync = require("../../utils/catchAsync.util");
const AppError = require("../../utils/appError.util");
const Market = require("../../models/market.models");
const Accounts = require("../../models/accounts.models");
const Geo = require("../../models/geo.models");
const { Op } = require("sequelize");
const { shopIdsFor, mayActOnListing } = require("../../utils/shopAccess.util");
const { mail } = require("../../mail");
const templates = require("../../mail/templates");

/**
 * Asking to see a property, and the owner's answer.
 *
 * This is what stands in for the order. Everywhere else in Plaza two people
 * reach each other because a suborder was confirmed; a property has no
 * suborder, so the accepted visit is the event that opens the door — and it
 * opens exactly the same door, on the same terms, decided by the same side.
 *
 * Everything below turns on that one rule: while a request is pending or
 * declined, neither party is given the other's email, phone or full address,
 * and that filtering happens here rather than in a browser choosing not to
 * draw what it was sent.
 */

// Never sent to anybody: it is the column that says whose mailbox a notice
// goes to, and the visitor's identity reaches the owner through the shaping
// below instead of by leaking out of the row.
const VISIT_FIELDS = [
  "id", "productId", "message", "preferredAt", "status", "respondedAt", "createdAt",
];

const dialable = (account) =>
  account?.phone ? `${account.phoneCountry?.dialCode ?? ""}${account.phone}` : null;

// The other person, as much of them as the request's state allows. Assembled
// as one shape whatever the answer is, so a caller reads the same fields and
// finds nulls rather than reading a different object depending on status.
const contact = (account, open) => ({
  username: account?.username ?? null,
  email: open ? account?.email ?? null : null,
  phone: open ? dialable(account) : null,
});

const withPhone = (as) => ({
  model: Accounts.Account,
  as,
  attributes: ["id", "username", "email", "phone"],
  include: [{ model: Geo.Country, as: "phoneCountry", attributes: ["dialCode"], required: false }],
});

// The listing, and the property row that carries the address. `required: false`
// on the property so a broken pair answers with a null address rather than
// dropping the whole request out of somebody's inbox.
//
// The owner comes with it always. Both sides of the shaping need a name — the
// visitor is told whose property it is, and the owner is told who asked — and
// carrying it on every query is cheaper than two shapes that can disagree
// about whether it is there.
const LISTING = {
  model: Market.Product,
  as: "product",
  attributes: ["id", "title", "accountId", "status", "cityId"],
  include: [
    {
      model: Market.Property,
      as: "property",
      attributes: ["address", "neighborhood", "latitude", "longitude"],
      required: false,
    },
    { model: Geo.City, as: "city", attributes: ["id", "name", "region"], required: false },
    { model: Market.ProductImage, as: "images", attributes: ["url"], required: false },
    withPhone("seller"),
  ],
};

// Everything this person may act on: what they listed themselves, and
// everything listed under a shop they work in. One clause, because every inbox
// in this project asks the same question and answering it differently in each
// is how one of them ends up showing a colleague's work and another does not.
const mineOrMyShops = async (accountId) => {
  const shopIds = await shopIdsFor(accountId);

  return shopIds.length
    ? { [Op.or]: [{ accountId }, { shopId: { [Op.in]: shopIds } }] }
    : { accountId };
};

/**
 * Sends without being waited for.
 *
 * The same reasoning as the order and question notices: a mail that will not
 * go must not fail the thing it was announcing. The request was made and
 * stored, and answering with an error because a mail server was unreachable
 * would tell the person the opposite of what happened.
 */
const tell = (to, template) => {
  if (!to) return;
  void mail(to, template.subject, template.html);
};

/**
 * One request, shaped for whichever side is reading it.
 *
 * `open` is the whole security decision, in one place, computed from the row
 * rather than passed in by a caller who might get it wrong. Accepted means
 * both sides see each other and the full address; anything else means neither
 * does.
 *
 * The address deliberately ignores `addressVisibility` once accepted. That
 * setting governs what a stranger browsing the square is shown; somebody the
 * owner has agreed to let in has to be told which door, or accepting them
 * accomplished nothing.
 */
const shape = (visit, { as }) => {
  const row = visit.toJSON();
  const open = visit.status === "accepted";
  const property = visit.product?.property;

  return {
    ...Object.fromEntries(VISIT_FIELDS.map(field => [field, row[field]])),
    product: visit.product && {
      id: visit.product.id,
      title: visit.product.title,
      status: visit.product.status,
      cover: visit.product.images?.[0]?.url ?? null,
      city: visit.product.city?.name ?? null,
      region: visit.product.city?.region ?? null,
      neighborhood: property?.neighborhood ?? null,
      // Where to go, once there is somewhere to go.
      address: open ? property?.address ?? null : null,
      latitude: open ? property?.latitude ?? null : null,
      longitude: open ? property?.longitude ?? null : null,
    },
    // The owner is shown who asked; the visitor is shown whose property it is.
    // Each is given the counterpart, never themselves.
    party: as === "owner"
      ? contact(visit.visitor, open)
      : contact(visit.product?.seller, open),
  };
};

/**
 * Asking to see it.
 *
 * The door is the same as the public page's, minus the paused listings: you
 * may ask about anything on the square, and there is no point arranging to
 * visit something its owner has taken off it.
 */
exports.request = catchAsync(async (req, res, next) => {
  const message = String(req.body.message ?? "").trim();

  if (!message) return next(new AppError("Write a message first", 400));

  if (message.length > Market.VISIT_MESSAGE_MAX) {
    return next(
      new AppError(`A message can be at most ${Market.VISIT_MESSAGE_MAX} characters`, 400)
    );
  }

  // A date, if they suggested one. Refused rather than ignored when it does
  // not parse, and refused when it is in the past: "come last Tuesday" is not
  // a request anybody can act on.
  let preferredAt = null;

  if (req.body.preferredAt) {
    preferredAt = new Date(req.body.preferredAt);

    if (Number.isNaN(preferredAt.getTime())) {
      return next(new AppError("That is not a date we can read", 400));
    }
    if (preferredAt.getTime() < Date.now()) {
      return next(new AppError("Suggest a day that has not passed yet", 400));
    }
  }

  const product = await Market.Product.findByPk(req.body.productId, {
    attributes: ["id", "title", "kind", "accountId", "shopId", "status"],
    include: [
      { model: Market.Shop, as: "shop", attributes: ["status"], required: false },
      { model: Accounts.Account, as: "seller", attributes: ["username", "email"] },
    ],
  });

  // 404 for both "no such listing" and "not one you may see", so the endpoint
  // does not confirm the existence of things it would not show.
  const visible =
    product &&
    product.status === "active" &&
    (!product.shopId || product.shop?.status === "active");

  if (!visible) return next(new AppError("Listing not found", 404));

  if (product.kind !== "property") {
    return next(new AppError("Only a property can be visited", 409));
  }

  if (product.accountId === req.sessionAccount.id) {
    return next(new AppError("You cannot ask to visit your own listing", 409));
  }

  // One per person per listing, which the unique index enforces underneath.
  // Checked here as well so the answer is a sentence rather than a constraint
  // violation, and so a declined request cannot be reopened by asking again —
  // an owner who said no has said no.
  const existing = await Market.VisitRequest.findOne({
    where: { productId: product.id, accountId: req.sessionAccount.id },
  });

  if (existing) {
    return next(
      new AppError(
        existing.status === "declined"
          ? "The owner already answered this request"
          : "You have already asked to see this one",
        409,
      )
    );
  }

  const visit = await Market.VisitRequest.create({
    productId: product.id,
    accountId: req.sessionAccount.id,
    message,
    preferredAt,
  });

  tell(
    product.seller?.email,
    templates.visitRequested({
      owner: product.seller?.username,
      title: product.title,
      visitor: req.sessionAccount.username,
      message,
      when: preferredAt ? preferredAt.toISOString().slice(0, 10) : null,
    })
  );

  return res.status(201).json(shape(
    await Market.VisitRequest.findByPk(visit.id, {
      include: [LISTING, withPhone("visitor")],
    }),
    { as: "visitor" },
  ));
});

/** Everything this person asked to see. */
exports.mine = catchAsync(async (req, res) => {
  const visits = await Market.VisitRequest.findAll({
    where: { accountId: req.sessionAccount.id },
    include: [LISTING],
    order: [["createdAt", "DESC"]],
  });

  return res.status(200).json(visits.map(visit => shape(visit, { as: "visitor" })));
});

/**
 * Everything asked of this owner, waiting first.
 *
 * `ASC NULLS FIRST` on the answered date, the same ordering the question inbox
 * uses: the unanswered ones are the reason to open the screen, and the ones
 * already dealt with below them are what makes it possible to check what was
 * agreed without leaving.
 */
exports.received = catchAsync(async (req, res) => {
  const visits = await Market.VisitRequest.findAll({
    include: [
      {
        ...LISTING,
        where: await mineOrMyShops(req.sessionAccount.id),
        required: true,
      },
      withPhone("visitor"),
    ],
    order: [["respondedAt", "ASC NULLS FIRST"], ["createdAt", "DESC"]],
  });

  return res.status(200).json(visits.map(visit => shape(visit, { as: "owner" })));
});

/**
 * The owner's answer, either way.
 *
 * Only from pending. A second answer could only overwrite the first, and
 * "accepted, then declined" is not a state this is built to explain to
 * somebody who has already been given a phone number.
 */
const answer = (status) => catchAsync(async (req, res, next) => {
  const visit = await Market.VisitRequest.findByPk(req.params.id, {
    include: [LISTING, withPhone("visitor")],
  });

  if (!visit) return next(new AppError("Visit request not found", 404));

  // Whoever may act on the listing. An agency's flat is the agency's, and the
  // person who happens to be at the desk is the person who should be able to
  // say yes to a viewing.
  if (!(await mayActOnListing(req.sessionAccount.id, visit.product))) {
    return next(new AppError("Only the owner can answer this request", 403));
  }

  if (visit.status !== "pending") {
    return next(new AppError("This request has already been answered", 409));
  }

  await visit.update({ status, respondedAt: new Date() });

  // Only the yes is announced. A decline notice is a message nobody needs
  // delivered, and the request shows as declined on the visitor's own screen.
  if (status === "accepted") {
    tell(
      visit.visitor?.email,
      templates.visitAccepted({
        visitor: visit.visitor?.username,
        title: visit.product.title,
      })
    );
  }

  return res.status(200).json(shape(visit, { as: "owner" }));
});

exports.accept = answer("accepted");
exports.decline = answer("declined");
