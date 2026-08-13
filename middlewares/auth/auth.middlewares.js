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

// Guards what an unconfirmed address is allowed to do.
//
// The line is drawn at publishing, not at browsing or buying. Blocking a
// purchase loses a customer in their first minute over a mailbox they may check
// tomorrow; blocking a listing is what stops a throwaway address from filling
// the catalogue.
exports.verified = catchAsync(async (req, res, next) => {
  if (!req.sessionAccount?.verified) {
    return next(new AppError("Confirm your email address before selling", 403));
  }

  next();
});

// Reserved for staff. Checked against the row in the database, never against
// anything the client sent: a role read out of the request body is a role the
// requester chose for themselves.
exports.admin = catchAsync(async (req, res, next) => {
  if (req.sessionAccount?.role !== "admin") {
    // 404 rather than 403: an admin area that announces its own existence to
    // everyone who pokes at it is an invitation.
    return next(new AppError("Not found", 404));
  }

  next();
});
