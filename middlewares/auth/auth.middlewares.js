const { promisify } = require("util");
const jwt = require("jsonwebtoken");
const AppError = require("../../utils/appError.util");
const catchAsync = require("../../utils/catchAsync.util");
const Accounts = require("../../models/accounts.models");

exports.protect = catchAsync(async (req, res, next) => {
  const token = req.cookies?.token;

  if (!token) return next(new AppError("You are not logged in", 401));

  let decoded;
  try {
    decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET_SEED);
  } catch {
    return next(new AppError("Invalid session. Please log in again", 401));
  }

  const account = await Accounts.Account.findByPk(decoded.id);

  // The token can outlive the account it names, so existence is checked on
  // every request rather than trusted from the signature.
  if (!account) return next(new AppError("This account is no longer available", 401));

  req.sessionAccount = account;

  next();
});

exports.restrict = (...roles) => (req, res, next) => {
  if (!roles.includes(req.sessionAccount.role)) {
    return next(new AppError("You do not have permission for this action", 403));
  }
  next();
};
