const catchAsync = require("../../utils/catchAsync.util");
const Market = require("../../models/market.models");
const { CITIES } = require("../../data/cities");

const titles = {
  home: "Home",
  tech: "Tech",
  fashion: "Fashion",
  beauty: "Beauty",
  sports: "Sports",
  tools: "Tools",
  food: "Food",
};

const shipping = {
  seller: { label: "I ship it myself", subtitle: "You buy the label and hand it over" },
  plaza: { label: "Plaza collects it", subtitle: "A courier picks up from your address" },
  pickup: { label: "Buyer picks it up", subtitle: "No shipping, an address to visit" },
};

// The vocabulary the forms and the category strip are built from. Served rather
// than duplicated in the frontend, so adding a category is one edit and the two
// sides cannot drift into disagreeing about what a valid value is.
exports.index = catchAsync(async (_req, res) => {
  return res.status(200).json({
    categories: Market.SHOP_CATEGORY.map(value => ({ value, label: titles[value] ?? value })),
    cities: CITIES,
    shipping: Market.SHIPPING_MODE.map(value => ({ value, ...shipping[value] })),
  });
});
