const { DataTypes } = require("sequelize");
const { db } = require("../database/config");

// Countries and cities live in our own tables rather than behind a geography
// API. An external service is a dependency that goes down mid-form, changes its
// shape without warning, and — the part that actually matters — cannot be
// corrected when a customer reports that their town is missing.

const Country = db.define(
  "countries",
  {
    id: {
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
      type: DataTypes.INTEGER,
      field: "id",
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      field: "name",
    },
    // ISO 3166-1 alpha-2. The stable identifier: a country's name changes far
    // more often than its code, and every shipping and payment provider speaks
    // this.
    code: {
      type: DataTypes.STRING(2),
      allowNull: false,
      unique: true,
      field: "code",
    },
    // ISO 4217, so a price can be stored in the currency the seller quoted.
    currency: {
      type: DataTypes.STRING(3),
      allowNull: false,
      field: "currency",
    },
    // E.164 prefix without the plus, for phone entry.
    dialCode: {
      type: DataTypes.STRING(6),
      allowNull: true,
      field: "dialCode",
    },
    // Countries Plaza actually operates in are enabled; the rest are present so
    // an address can be recorded without a migration, but are not offered.
    active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: "active",
    },
  },
  { tableName: "countries", schema: "geo" }
);

const City = db.define(
  "cities",
  {
    id: {
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
      type: DataTypes.INTEGER,
      field: "id",
    },
    countryId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "countryId",
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      field: "name",
    },
    // Unique per country, not globally: there is a Córdoba in Colombia, in
    // Argentina and in Spain.
    slug: {
      type: DataTypes.STRING,
      allowNull: false,
      field: "slug",
    },
    // Department, state or province. Shown as the second line in the picker
    // because that is how people disambiguate two towns sharing a name.
    region: {
      type: DataTypes.STRING,
      allowNull: true,
      field: "region",
    },
    active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: "active",
    },
  },
  {
    tableName: "cities",
    schema: "geo",
    indexes: [{ unique: true, fields: ["countryId", "slug"] }],
  }
);

const Geo = { Country, City };

module.exports = Geo;
