const { randomUUID } = require("crypto");
const catchAsync = require("../../utils/catchAsync.util");
const AppError = require("../../utils/appError.util");
const Accounts = require("../../models/accounts.models");
const cloudinary = require("../../utils/cloudinary.util");
const { hash, compare } = require("../../utils/hash.util");
const { issue, redeem } = require("../../utils/codes.util");
const password_rules = require("../../utils/password.util");
const { mail } = require("../../mail");
const templates = require("../../mail/templates");

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const publicShape = (account) => ({
  id: account.id,
  username: account.username,
  email: account.email,
  role: account.role,
  avatar: account.avatar,
  verified: account.verified,
  createdAt: account.createdAt,
});

exports.me = catchAsync(async (req, res) => {
  return res.status(200).json(publicShape(req.sessionAccount));
});

/* ─── profile ────────────────────────────────────────────────────────────── */

exports.updateProfile = catchAsync(async (req, res, next) => {
  const account = req.sessionAccount;
  const username = String(req.body.username || "").trim();

  if (!username) return next(new AppError("Pick a name to go by", 406));
  if (username.length < 3) return next(new AppError("Use at least 3 characters", 406));
  if (username.length > 40) return next(new AppError("Keep it under 40 characters", 406));

  await account.update({ username });

  return res.status(200).json(publicShape(account));
});

/* ─── email ──────────────────────────────────────────────────────────────── */

// Changing the email is the single most valuable account takeover there is:
// whoever holds the address can reset the password. So it costs the current
// password, and the code goes to the new address to prove it is reachable.
exports.requestEmailChange = catchAsync(async (req, res, next) => {
  const account = req.sessionAccount;
  const email = String(req.body.email || "").trim().toLowerCase();
  const { password } = req.body;

  if (!EMAIL.test(email)) return next(new AppError("A valid email is required", 406));
  if (email === account.email) return next(new AppError("That is already your address", 409));

  if (!password || !(await compare(password, account.password))) {
    return next(new AppError("Your current password is not right", 401));
  }

  const taken = await Accounts.Account.findOne({ where: { email } });
  if (taken) return next(new AppError("That email is already registered", 409));

  // The new address is held on the code, not written to the account. An
  // unconfirmed address must never become the one that receives resets.
  const { code, minutes } = await issue({
    accountId: account.id,
    purpose: "change_email",
    payload: email,
  });

  const { subject, html } = templates.changeEmail({
    username: account.username,
    code,
    minutes,
  });

  const sent = await mail(email, subject, html);

  if (!sent) return next(new AppError("We could not send the email. Try again shortly.", 502));

  return res.status(200).json({
    status: "success",
    message: `Enter the code we sent to ${email}`,
  });
});

exports.confirmEmailChange = catchAsync(async (req, res, next) => {
  const account = req.sessionAccount;

  const result = await redeem({
    accountId: account.id,
    purpose: "change_email",
    code: req.body.code,
  });

  if (!result.ok) {
    const messages = {
      expired: "That code has expired. Start the change again.",
      attempts: "Too many wrong tries. Start the change again.",
      mismatch: `That code is not right.${result.left > 0 ? ` ${result.left} tries left.` : ""}`,
    };
    return next(new AppError(messages[result.reason], 400));
  }

  // Re-checked at the moment of applying: someone else may have registered it
  // during the minutes the code was in flight.
  const taken = await Accounts.Account.findOne({ where: { email: result.payload } });
  if (taken) return next(new AppError("That email was registered in the meantime", 409));

  const previous = account.email;

  await account.update({ email: result.payload, verified: true });

  // The old address is told, which is the only way its owner finds out if
  // someone else made this change.
  const notice = templates.emailChanged({ username: account.username, email: result.payload });
  await mail(previous, notice.subject, notice.html);

  return res.status(200).json(publicShape(account));
});

/* ─── password ───────────────────────────────────────────────────────────── */

exports.updatePassword = catchAsync(async (req, res, next) => {
  const account = req.sessionAccount;
  const { current, password } = req.body;

  // Asked for even though the session already proves identity: it is what stops
  // an unattended logged-in browser from being turned into a locked-out account.
  if (!current || !(await compare(current, account.password))) {
    return next(new AppError("Your current password is not right", 401));
  }

  const weak = password_rules.check(password, {
    email: account.email,
    username: account.username,
  });
  if (weak) return next(new AppError(weak, 406));

  if (await compare(password, account.password)) {
    return next(new AppError("That is the password you already have", 406));
  }

  await account.update({ password: await hash(password) });

  const notice = templates.passwordChanged({ username: account.username });
  await mail(account.email, notice.subject, notice.html);

  return res.status(200).json({ status: "success", message: "Password updated" });
});

/* ─── avatar ─────────────────────────────────────────────────────────────── */

exports.uploadAvatar = catchAsync(async (req, res, next) => {
  const account = req.sessionAccount;

  if (!cloudinary.configured()) {
    return next(new AppError("Image uploads are not configured on this server", 503));
  }

  if (!req.file) return next(new AppError("Choose an image first", 406));

  const result = await cloudinary.upload(req.file.buffer, {
    folder: "plaza/avatars",
    public_id: randomUUID(),
    transformation: [{ width: 256, height: 256, crop: "fill", gravity: "face" }],
  });

  // The old file is removed after the new one is stored, not before: if the
  // upload fails the person still has the photo they had.
  const previous = account.avatar_id;

  await account.update({ avatar: result.secure_url, avatar_id: result.public_id });

  if (previous) {
    await cloudinary.remove(previous).catch(err =>
      console.error("CLOUDINARY: could not remove old avatar:", err.message)
    );
  }

  return res.status(200).json(publicShape(account));
});

exports.deleteAvatar = catchAsync(async (req, res) => {
  const account = req.sessionAccount;

  if (account.avatar_id) {
    await cloudinary.remove(account.avatar_id).catch(err =>
      console.error("CLOUDINARY: could not remove avatar:", err.message)
    );
  }

  await account.update({ avatar: null, avatar_id: null });

  return res.status(200).json(publicShape(account));
});
