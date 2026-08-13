const catchAsync = require("../../utils/catchAsync.util");
const AppError = require("../../utils/appError.util");
const Accounts = require("../../models/accounts.models");
const { issueSession, COOKIE_OPTIONS } = require("../../utils/session.util");
const { issue, redeem, lastIssuedAt } = require("../../utils/codes.util");
const { hash } = require("../../utils/hash.util");
const password_rules = require("../../utils/password.util");
const { mail } = require("../../mail");
const templates = require("../../mail/templates");

// A resend that mails on every click is a way to get the sending domain blocked
// and a way to spam whoever owns that address.
const RESEND_COOLDOWN_MS = 60 * 1000;

const sendCode = async ({ account, purpose, template, to = null }) => {
  const { code, minutes } = await issue({
    accountId: account.id,
    purpose,
    payload: to,
  });

  const { subject, html } = template({ username: account.username, code, minutes });

  return mail(to || account.email, subject, html);
};

exports.register = catchAsync(async (req, res) => {
  const session = await issueSession(res, req.account);

  // The session is issued before the address is confirmed on purpose: the
  // person can browse and buy straight away, and only listing something is
  // held back until they confirm.
  const sent = await sendCode({
    account: req.account,
    purpose: "verify_email",
    template: templates.verifyEmail,
  });

  return res.status(201).json({
    ...session,
    // Reported rather than assumed, so the frontend can say "we could not send
    // it" instead of showing a code entry screen for a mail that never left.
    codeSent: sent,
    message: "Account created",
  });
});

exports.login = catchAsync(async (req, res) => {
  const session = await issueSession(res, req.account);

  return res.status(200).json({ ...session, message: "Logged in" });
});

exports.logout = catchAsync(async (req, res) => {
  // Cleared with the same flags it was set with, or the browser keeps it.
  res.clearCookie("token", { ...COOKIE_OPTIONS, maxAge: undefined });

  return res.status(200).json({ status: "success", message: "Logged out" });
});

exports.session = catchAsync(async (req, res) => {
  const { id, username, email, role, avatar, verified } = req.sessionAccount;

  return res.status(200).json({
    auth: true,
    account: { id, username, email, role, avatar, verified },
  });
});

/* ─── email confirmation ─────────────────────────────────────────────────── */

exports.verify = catchAsync(async (req, res, next) => {
  const account = req.sessionAccount;

  if (account.verified) {
    return res.status(200).json({ status: "success", message: "Already confirmed" });
  }

  const result = await redeem({
    accountId: account.id,
    purpose: "verify_email",
    code: req.body.code,
  });

  if (!result.ok) {
    const messages = {
      expired: "That code has expired. Ask for a new one.",
      attempts: "Too many wrong tries. Ask for a new code.",
      mismatch: `That code is not right.${result.left > 0 ? ` ${result.left} tries left.` : ""}`,
    };
    return next(new AppError(messages[result.reason], 400));
  }

  await account.update({ verified: true });

  return res.status(200).json({ status: "success", message: "Email confirmed" });
});

exports.resendVerification = catchAsync(async (req, res, next) => {
  const account = req.sessionAccount;

  if (account.verified) {
    return next(new AppError("That address is already confirmed", 409));
  }

  const last = await lastIssuedAt({ accountId: account.id, purpose: "verify_email" });

  if (last && Date.now() - new Date(last).getTime() < RESEND_COOLDOWN_MS) {
    const wait = Math.ceil((RESEND_COOLDOWN_MS - (Date.now() - new Date(last).getTime())) / 1000);
    return next(new AppError(`Wait ${wait} seconds before asking for another code`, 429));
  }

  const sent = await sendCode({
    account,
    purpose: "verify_email",
    template: templates.verifyEmail,
  });

  if (!sent) return next(new AppError("We could not send the email. Try again shortly.", 502));

  return res.status(200).json({ status: "success", message: "Code sent" });
});

/* ─── password recovery ──────────────────────────────────────────────────── */

// Answers identically whether or not the address exists. Anything else turns
// this endpoint into a way to find out who has an account here.
const VAGUE = "If that address has an account, a code is on its way.";

exports.forgotPassword = catchAsync(async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();

  const account = email ? await Accounts.Account.findOne({ where: { email } }) : null;

  if (account) {
    const last = await lastIssuedAt({ accountId: account.id, purpose: "reset_password" });
    const cooling = last && Date.now() - new Date(last).getTime() < RESEND_COOLDOWN_MS;

    if (!cooling) {
      await sendCode({ account, purpose: "reset_password", template: templates.resetPassword });
    }
  }

  return res.status(200).json({ status: "success", message: VAGUE });
});

exports.resetPassword = catchAsync(async (req, res, next) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const { code, password } = req.body;

  const account = email ? await Accounts.Account.findOne({ where: { email } }) : null;

  // Same message for a missing account and a wrong code, for the same reason
  // the request step is vague.
  const invalid = new AppError("That code is not right, or it has expired.", 400);

  if (!account) return next(invalid);

  const weak = password_rules.check(password, { email, username: account.username });
  if (weak) return next(new AppError(weak, 406));

  const result = await redeem({ accountId: account.id, purpose: "reset_password", code });

  if (!result.ok) return next(invalid);

  await account.update({ password: await hash(password) });

  // Reaching a reset means the address works, so there is nothing left to
  // confirm separately.
  if (!account.verified) await account.update({ verified: true });

  await mail(
    account.email,
    templates.passwordChanged({ username: account.username }).subject,
    templates.passwordChanged({ username: account.username }).html
  );

  return res.status(200).json({ status: "success", message: "Password updated. Sign in with it." });
});
