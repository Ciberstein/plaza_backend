const jwt = require("jsonwebtoken");

const generateJWT = (id) => {
  return new Promise((resolve, reject) => {
    const payload = { id };

    jwt.sign(
      payload,
      process.env.JWT_SECRET_SEED,
      { expiresIn: process.env.JWT_EXPIRES_IN || "7d" },
      (err, token) => {
        if (err) return reject(err);
        resolve(token);
      }
    );
  });
};

module.exports = { generateJWT };
