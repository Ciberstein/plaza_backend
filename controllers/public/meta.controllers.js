const catchAsync = require("../../utils/catchAsync.util");
const Market = require("../../models/market.models");
const { Category } = require("../../models/categories.models");
const Geo = require("../../models/geo.models");

// The vocabulary the forms and the category strip are built from. Served rather
// than duplicated in the frontend, so adding a category is one row and the two
// sides cannot drift into disagreeing about what a valid value is.
//
// Categories and cities are rows now, not constants: both grow, and a
// marketplace has to add an aisle or a town without a deploy.
exports.index = catchAsync(async (_req, res) => {
  const [categories, countries] = await Promise.all([
    Category.findAll({
      where: { active: true },
      attributes: ["id", "parentId", "name", "slug", "position", "kind"],
      order: [["position", "ASC"], ["name", "ASC"]],
    }),
    Geo.Country.findAll({
      where: { active: true },
      attributes: ["id", "name", "code", "currency", "dialCode"],
      order: [["name", "ASC"]],
    }),
  ]);

  // Only the cities of countries Plaza operates in. Sending every city of every
  // seeded country would be a large payload nobody can use.
  const cities = await Geo.City.findAll({
    where: { active: true, countryId: countries.map(c => c.id) },
    attributes: ["id", "countryId", "name", "slug", "region"],
    order: [["name", "ASC"]],
  });

  // Categories, countries and cities are shaped for the pickers: value/label
  // (and subtitle for cities) is what Select and Combobox read.
  //
  // Condition, delivery and shipping are different: those labels are not
  // database content, they are interface copy, so only the raw value — the
  // fact the frontend's forms validate against — is served here. The words
  // for it live in the frontend's own translation catalogue.
  return res.status(200).json({
    // Both trees in one list, each carrying the aisle it belongs to. The form
    // shows the one matching what is being published, and the header shows
    // whichever the visitor is browsing — neither needs a second request.
    categories: categories
      .filter(c => c.parentId === null)
      .map(parent => ({
        value: parent.id,
        slug: parent.slug,
        label: parent.name,
        kind: parent.kind,
        children: categories
          .filter(child => child.parentId === parent.id)
          .map(child => ({
            value: child.id,
            slug: child.slug,
            label: child.name,
            kind: child.kind,
          })),
      })),
    countries: countries.map(c => ({
      value: c.id,
      label: c.name,
      code: c.code,
      currency: c.currency,
      dialCode: c.dialCode,
    })),
    cities: cities.map(c => ({
      value: c.id,
      countryId: c.countryId,
      label: c.name,
      subtitle: c.region,
      slug: c.slug,
    })),
    // The departments, derived from the cities already being sent rather than
    // queried again or stored twice. Somebody looking for a place to live
    // searches a department before they search a town — and unlike a category
    // or a city, this is not a row anywhere: it is a column on the cities, so
    // deriving it is what keeps it from drifting away from them.
    regions: [...new Set(cities.map(c => c.region).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, "es"))
      .map(region => ({ value: region, label: region })),
    shipping: Market.SHIPPING_MODE.map(value => ({ value })),
    conditions: Market.PRODUCT_CONDITION.map(value => ({ value })),
    delivery: Market.DELIVERY_OPTION.map(value => ({ value })),
    // The service half of the same vocabulary: what a rate buys, and where the
    // work is carried out. `serviceDelivery` answers the same question
    // `delivery` does — how the two of you meet — for a listing that is
    // somebody's time rather than a parcel.
    rateUnits: Market.RATE_UNIT.map(value => ({ value })),
    serviceDelivery: Market.SERVICE_OPTION.map(value => ({ value })),
    // And the property half. Values only, like everything else here: these are
    // the facts the form validates against, and the words for them are
    // interface copy that lives in the frontend's catalogue in three
    // languages.
    operations: Market.PROPERTY_OPERATION.map(value => ({ value })),
    propertyConditions: Market.PROPERTY_CONDITION.map(value => ({ value })),
    features: Market.PROPERTY_FEATURE.map(value => ({ value })),
    addressVisibility: Market.ADDRESS_VISIBILITY.map(value => ({ value })),
    strata: Array.from(
      { length: Market.MAX_STRATUM - Market.MIN_STRATUM + 1 },
      (_, i) => ({ value: Market.MIN_STRATUM + i }),
    ),
  });
});
