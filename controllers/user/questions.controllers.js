const catchAsync = require("../../utils/catchAsync.util");
const AppError = require("../../utils/appError.util");
const Market = require("../../models/market.models");
const Accounts = require("../../models/accounts.models");
const { mail } = require("../../mail");
const templates = require("../../mail/templates");

/**
 * What a question is allowed to look like coming out of here.
 *
 * `accountId` is not on the list, in the seller's inbox any more than on the
 * public page. The seller does not learn who asked by being the one answering:
 * a question is anonymous to everybody, and the only thing the column is for
 * is knowing which mailbox the answer goes to.
 */
const PUBLIC_FIELDS = ["id", "productId", "body", "answer", "answeredAt", "createdAt"];

// How many unanswered questions one person may have waiting on one listing.
//
// The rate limiter bounds the hour; this bounds the listing, and they are not
// the same protection. Twenty questions an hour spread over twenty listings is
// a curious shopper, and twenty on one is a seller being shouted at. A second
// question while the first is unanswered is a fair nudge, a third is the end
// of it — and the count is of unanswered ones, so a seller who replies always
// clears the way for the next.
const MAX_PENDING_PER_LISTING = 3;

/**
 * Sends without being waited for.
 *
 * The same reasoning as the order notices: a mail that will not go must not
 * fail the thing it was announcing. The question was asked and stored, and
 * answering with an error because a mail server was unreachable would tell the
 * person the opposite of what happened. `mail` catches everything and answers
 * false, so this cannot reject.
 */
const tell = (to, template) => {
  if (!to) return;
  void mail(to, template.subject, template.html);
};

/** Only what a browser is allowed to see, whoever is asking. */
const publicly = (question) => {
  const row = question.toJSON();
  return Object.fromEntries(PUBLIC_FIELDS.map(field => [field, row[field]]));
};

/**
 * Asking about a listing.
 *
 * The door is the same as the public page's: you may ask about anything you
 * could be looking at, which includes a paused listing — "is this coming
 * back?" is a fair question — and excludes drafts and closed shops, which are
 * not the public's business at all.
 */
exports.ask = catchAsync(async (req, res, next) => {
  const body = String(req.body.body ?? "").trim();

  if (!body) return next(new AppError("Write your question first", 400));

  if (body.length > Market.QUESTION_MAX) {
    return next(
      new AppError(`A question can be at most ${Market.QUESTION_MAX} characters`, 400)
    );
  }

  const product = await Market.Product.findByPk(req.body.productId, {
    attributes: ["id", "title", "accountId", "shopId", "status"],
    include: [
      { model: Market.Shop, as: "shop", attributes: ["status"], required: false },
      { model: Accounts.Account, as: "seller", attributes: ["username", "email"] },
    ],
  });

  // 404 for both "no such listing" and "not one you may see", so the endpoint
  // does not confirm the existence of things it would not show.
  const visible =
    product &&
    ["active", "paused"].includes(product.status) &&
    (!product.shopId || product.shop?.status === "active");

  if (!visible) return next(new AppError("Listing not found", 404));

  if (product.accountId === req.sessionAccount.id) {
    return next(new AppError("You cannot ask a question on your own listing", 409));
  }

  const pending = await Market.ProductQuestion.count({
    where: {
      productId: product.id,
      accountId: req.sessionAccount.id,
      answer: null,
    },
  });

  if (pending >= MAX_PENDING_PER_LISTING) {
    return next(
      new AppError("You already have questions waiting on this listing", 429)
    );
  }

  const question = await Market.ProductQuestion.create({
    productId: product.id,
    accountId: req.sessionAccount.id,
    body,
  });

  tell(
    product.seller?.email,
    templates.questionAsked({
      seller: product.seller?.username,
      title: product.title,
      question: body,
    })
  );

  return res.status(201).json(publicly(question));
});

/**
 * The seller's one answer.
 *
 * Refused if there already is one. The schema has a single answer column, so
 * a second answer could only overwrite the first — and quietly editing what
 * the buyer was already told, on a page everyone can read, is not an edit
 * anybody consented to.
 */
exports.answer = catchAsync(async (req, res, next) => {
  const answer = String(req.body.answer ?? "").trim();

  if (!answer) return next(new AppError("Write your answer first", 400));

  if (answer.length > Market.ANSWER_MAX) {
    return next(
      new AppError(`An answer can be at most ${Market.ANSWER_MAX} characters`, 400)
    );
  }

  const question = await Market.ProductQuestion.findByPk(req.params.id, {
    include: [
      { model: Market.Product, as: "product", attributes: ["id", "title", "accountId"] },
      { model: Accounts.Account, as: "asker", attributes: ["username", "email"] },
    ],
  });

  if (!question) return next(new AppError("Question not found", 404));

  // The listing's owner, not the shop's: a listing belongs to the person who
  // put it up, and that is the same column every other rule here reads.
  if (question.product?.accountId !== req.sessionAccount.id) {
    return next(new AppError("Only the seller can answer this question", 403));
  }

  if (question.answer) {
    return next(new AppError("This question has already been answered", 409));
  }

  await question.update({ answer, answeredAt: new Date() });

  tell(
    question.asker?.email,
    templates.questionAnswered({
      buyer: question.asker?.username,
      title: question.product.title,
      question: question.body,
      answer,
    })
  );

  return res.status(200).json(publicly(question));
});

/**
 * Everything asked of this seller, waiting first.
 *
 * `ASC NULLS FIRST` on the answered date rather than two queries: unanswered
 * is the reason to open this screen, and the answered ones below it are what
 * makes it possible to check what was already said without leaving.
 */
exports.inbox = catchAsync(async (req, res) => {
  const rows = await Market.ProductQuestion.findAll({
    attributes: PUBLIC_FIELDS,
    include: [
      {
        model: Market.Product,
        as: "product",
        attributes: ["id", "title", "status"],
        where: { accountId: req.sessionAccount.id },
        required: true,
      },
    ],
    order: [
      ["answeredAt", "ASC NULLS FIRST"],
      ["createdAt", "DESC"],
    ],
  });

  // The covers in one more query, the way the favourites list does it: a
  // hasMany joined onto this would multiply every question by its photographs.
  const covers = await Market.ProductImage.findAll({
    where: { productId: rows.map(row => row.productId), position: 0 },
    attributes: ["productId", "url"],
  });

  const coverOf = new Map(covers.map(cover => [cover.productId, cover.url]));

  return res.status(200).json(
    rows.map(row => ({
      ...publicly(row),
      product: {
        ...row.product.toJSON(),
        cover: coverOf.get(row.productId) ?? null,
      },
    }))
  );
});
