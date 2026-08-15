const { DataTypes } = require("sequelize");
const { db } = require("../database/config");
// The one list of what a listing can be, borrowed rather than copied. It was
// copied here once and drifted: properties were added to the listing kinds and
// this validator went on refusing them, which is a failure that only shows up
// at seed time. Neither file requires the other, so there is no cycle to pay
// for the import.
const { LISTING_KIND } = require("./market.models");

// Categories are rows, not a constant in the code. They are the one taxonomy
// both the shopper and the seller navigate by, they grow constantly, and a
// marketplace has to be able to add "Pet supplies" on a Tuesday without a
// deploy.
const Category = db.define(
  "categories",
  {
    id: {
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
      type: DataTypes.INTEGER,
      field: "id",
    },
    // Self-referencing: a top-level category has none, a subcategory points at
    // its parent. One table rather than two, because the depth of the tree is
    // not something to hardcode.
    parentId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "parentId",
    },
    // Which aisle this belongs to: the one selling things, or the one selling
    // work. A category is never both — "Plumbing" as a service and as a box of
    // fittings are different things filed in different places — so the form
    // only ever offers the tree that matches what is being published.
    kind: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "good",
      validate: { isIn: [LISTING_KIND] },
      field: "kind",
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      field: "name",
    },
    slug: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      field: "slug",
    },
    // Sort order in the category strip. Alphabetical would put "Antiques"
    // before "Electronics", which is not how a marketplace ranks its aisles.
    position: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: "position",
    },
    // Hidden rather than deleted: a category with products behind it cannot be
    // removed without orphaning them.
    active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: "active",
    },
  },
  { tableName: "categories", schema: "market" }
);

module.exports = { Category };
