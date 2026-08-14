const catchAsync = require("../../utils/catchAsync.util");
const Market = require("../../models/market.models");
const { Category } = require("../../models/categories.models");
const Geo = require("../../models/geo.models");

// How worn the thing is. Plain language rather than a grading scale nobody
// shares the definition of.
const conditions = {
  new: { label: "New", subtitle: "Never used, still as it was made" },
  like_new: { label: "Used - like new", subtitle: "Used once or twice, no marks" },
  good: { label: "Used - good", subtitle: "Signs of use, nothing broken" },
  acceptable: { label: "Used - acceptable", subtitle: "Worn, and it shows" },
  for_parts: { label: "For parts", subtitle: "Not working, sold to be taken apart" },
};

// How the seller is willing to hand it over. Several at once.
const delivery = {
  shipping: { label: "Shipping", subtitle: "Sent by courier" },
  door_delivery: { label: "Delivery to the buyer", subtitle: "You take it to their address" },
  door_pickup: { label: "Pickup from you", subtitle: "They collect it from your address" },
  public_meetup: { label: "Meet in public", subtitle: "Somewhere busy, agreed with the buyer" },
};

const shipping = {
  seller: { label: "I ship it myself", subtitle: "You buy the label and hand it over" },
  plaza: { label: "Plaza collects it", subtitle: "A courier picks up from your address" },
  pickup: { label: "Buyer picks it up", subtitle: "No shipping, an address to visit" },
};

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
      attributes: ["id", "parentId", "name", "slug", "position"],
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

  // Shaped for the pickers: value/label/subtitle is what Select and Combobox
  // read, so the frontend maps nothing.
  return res.status(200).json({
    categories: categories
      .filter(c => c.parentId === null)
      .map(parent => ({
        value: parent.id,
        slug: parent.slug,
        label: parent.name,
        children: categories
          .filter(child => child.parentId === parent.id)
          .map(child => ({ value: child.id, slug: child.slug, label: child.name })),
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
    shipping: Market.SHIPPING_MODE.map(value => ({ value, ...shipping[value] })),
    conditions: Market.PRODUCT_CONDITION.map(value => ({ value, ...conditions[value] })),
    delivery: Market.DELIVERY_OPTION.map(value => ({ value, ...delivery[value] })),
  });
});
