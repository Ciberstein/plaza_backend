const { DataTypes } = require("sequelize");
const { db } = require("../database/config");

// What a code is allowed to do. A code issued to confirm an email must not be
// accepted to reset a password — without this column, one leaked code opens
// every door.
const CODE_PURPOSE = ["verify_email", "change_email", "reset_password"];

const Code = db.define(
  "codes",
  {
    id: {
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
      type: DataTypes.INTEGER,
      field: "id",
    },
    accountId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "accountId",
    },
    purpose: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: { isIn: [CODE_PURPOSE] },
      field: "purpose",
    },
    // Hashed, never stored in the clear. A six-digit code is weak enough that
    // anyone who reads this table would otherwise be able to take over every
    // account with a pending reset.
    code: {
      type: DataTypes.STRING,
      allowNull: false,
      field: "code",
    },
    // What the code will apply once accepted — the new address, for an email
    // change. Held here rather than written to the account early, so an
    // unconfirmed address never becomes the account's real one.
    payload: {
      type: DataTypes.STRING,
      allowNull: true,
      field: "payload",
    },
    // Six digits is 1 in a million per guess, which is only safe with a ceiling
    // on guesses. Without this, the code is brute-forceable in minutes.
    attempts: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: "attempts",
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: "expiresAt",
    },
    // Kept rather than deleted on use, so a replayed code is refused knowingly
    // instead of looking like it simply expired.
    consumedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "consumedAt",
    },
  },
  {
    tableName: "codes",
    schema: "auth",
    indexes: [{ fields: ["accountId", "purpose"] }],
  }
);

const Auth = { Code, CODE_PURPOSE };

module.exports = Auth;
