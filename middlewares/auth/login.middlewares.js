const AppError = require("../../utils/appError.util");
const catchAsync = require("../../utils/catchAsync.util");
const Accounts = require("../../models/accounts.models");
const { compare } = require("../../utils/hash.util");

exports.validate = catchAsync(async (req, res, next) => {
  const { email, password } = req.body;

  if (!email?.trim()) return next(new AppError("Email is required", 406));
  if (!password) return next(new AppError("Password is required", 406));

  req.body.email = email.trim().toLowerCase();

  next();
});

exports.authenticate = catchAsync(async (req, res, next) => {
  const { email, password } = req.body;

  const account = await Accounts.Account.findOne({ where: { email } });

  // One message for both a missing account and a wrong password, so the
  // response cannot be used to find out which emails are registered.
  const invalid = new AppError("Invalid email or password", 401);

  if (!account) return next(invalid);
  if (!(await compare(password, account.password))) return next(invalid);

  req.account = account;

  next();
});
