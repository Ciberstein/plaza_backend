const AppError = require("../../utils/appError.util");
const catchAsync = require("../../utils/catchAsync.util");
const Accounts = require("../../models/accounts.models");
const { hash } = require("../../utils/hash.util");

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

exports.validate = catchAsync(async (req, res, next) => {
  const { username, email, password } = req.body;

  if (!username?.trim()) return next(new AppError("Username is required", 406));
  if (!email?.trim() || !EMAIL.test(email)) return next(new AppError("A valid email is required", 406));
  if (!password || password.length < 8) {
    return next(new AppError("Password must be at least 8 characters", 406));
  }

  req.body.email = email.trim().toLowerCase();
  req.body.username = username.trim();

  next();
});

exports.available = catchAsync(async (req, res, next) => {
  const existing = await Accounts.Account.findOne({ where: { email: req.body.email } });

  // Deliberately explicit. Hiding whether an email exists only helps when the
  // rest of the app hides it too, and registration cannot: it has to refuse.
  if (existing) return next(new AppError("That email is already registered", 409));

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
