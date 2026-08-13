const catchAsync = require("../../utils/catchAsync.util");
const { issueSession, COOKIE_OPTIONS } = require("../../utils/session.util");

exports.register = catchAsync(async (req, res) => {
  const session = await issueSession(res, req.account);

  return res.status(201).json({ ...session, message: "Account created" });
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
  const { id, username, email, role, avatar } = req.sessionAccount;

  return res.status(200).json({ auth: true, account: { id, username, email, role, avatar } });
});
