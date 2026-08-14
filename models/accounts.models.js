const { DataTypes } = require("sequelize");
const { db } = require("../database/config");

// A person is a buyer from the moment they register and becomes a seller by
// opening a shop. One account table, a role on it — the same person does both,
// and splitting them would mean two identities and two sessions.
const ACCOUNT_ROLE = ["buyer", "seller", "admin"];

const Account = db.define(
  "accounts",
  {
    id: {
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
      type: DataTypes.INTEGER,
      field: "id",
    },
    username: {
      type: DataTypes.STRING,
      allowNull: false,
      field: "username",
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      field: "email",
    },
    password: {
      type: DataTypes.STRING,
      allowNull: false,
      field: "password",
    },
    role: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "buyer",
      validate: { isIn: [ACCOUNT_ROLE] },
      field: "role",
    },
    // Required of everyone registering, and nullable in the column because the
    // accounts that existed before it was asked for do not have one. Stored as
    // bare digits with the country beside it, never as one typed string: the
    // dialling code belongs to a row in geo.countries that an administrator can
    // change, and baking it into the number freezes it.
    phoneCountryId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "phoneCountryId",
    },
    phone: {
      type: DataTypes.STRING,
      allowNull: true,
      field: "phone",
    },
    avatar: {
      type: DataTypes.STRING,
      allowNull: true,
      field: "avatar",
    },
    avatar_id: {
      type: DataTypes.STRING,
      allowNull: true,
      field: "avatar_id",
    },
    verified: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: "verified",
    },
  },
  {
    tableName: "accounts",
    schema: "accounts",
  }
);

const Accounts = { Account, ACCOUNT_ROLE };

module.exports = Accounts;
