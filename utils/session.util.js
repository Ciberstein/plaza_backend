const { generateJWT } = require("./jwt.util");

// One definition of what a session is. Every path that starts one goes through
// here, so a cookie flag cannot drift between register and login and leave one
// of them insecure.
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict",
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

const issueSession = async (res, account) => {
  const token = await generateJWT(account.id);

  res.cookie("token", token, COOKIE_OPTIONS);

  return {
    status: "success",
    account: {
      id: account.id,
      username: account.username,
      email: account.email,
      role: account.role,
      avatar: account.avatar,
    },
  };
};

module.exports = { issueSession, COOKIE_OPTIONS };
