const AppError = require("../../utils/appError.util");
const catchAsync = require("../../utils/catchAsync.util");
const Accounts = require("../../models/accounts.models");
const { hash } = require("../../utils/hash.util");
const password_rules = require("../../utils/password.util");
const username_rules = require("../../utils/username.util");

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

exports.validate = catchAsync(async (req, res, next) => {
  const { username, email, password } = req.body;

  // The same rule the profile screen applies. Registration used to accept any
  // non-empty string, so a name refused when edited was accepted when created.
  const badName = username_rules.check(username);
  if (badName) return next(new AppError(badName, 406));
  if (!email?.trim() || !EMAIL.test(email)) return next(new AppError("A valid email is required", 406));
  // Delegated so that registration, reset and change all judge a password by
  // the same rule. Three separate length checks drift apart within a month.
  const weak = password_rules.check(password, { email, username });
  if (weak) return next(new AppError(weak, 406));

  req.body.email = email.trim().toLowerCase();
  req.body.username = username.trim();

  next();
});

exports.available = catchAsync(async (req, res, next) => {
  const existing = await Accounts.Account.findOne({ where: { email: req.body.email } });

  // Deliberately explicit. Hiding whether an email exists only helps when the
  // rest of the app hides it too, and registration cannot: it has to refuse.
  if (existing) return next(new AppError("That email is already registered", 409));

  // The username was never checked here at all, which is how two people ended
  // up trading under one name.
  if (await username_rules.taken(req.body.username)) {
    return next(new AppError("Someone already goes by that name", 409));
  }

  next();
});

exports.create = catchAsync(async (req, res, next) => {
  const { username, email, password } = req.body;

  req.account = await Accounts.Account.create({
    username,
    email,
    password: await hash(password),
    role: "buyer",
  });

  next();
});
