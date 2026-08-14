const Accounts = require("./accounts.models");
const Market = require("./market.models");
const Geo = require("./geo.models");
const { Category } = require("./categories.models");

const init = () => {

  /* ACCOUNT RELATIONSHIPS */

  Accounts.Account.hasMany(Market.Shop, {
    foreignKey: "accountId",
    as: "shops",
  });
  Market.Shop.belongsTo(Accounts.Account, {
    foreignKey: "accountId",
    as: "owner",
  });

  Accounts.Account.hasMany(Market.Order, {
    foreignKey: "accountId",
    as: "orders",
  });
  Market.Order.belongsTo(Accounts.Account, {
    foreignKey: "accountId",
    as: "buyer",
  });

  // A listing belongs to the person, always. The shop is optional branding on
  // top, which is why deleting a shop must not take the products with it.
  Accounts.Account.hasMany(Market.Product, {
    foreignKey: "accountId",
    as: "listings",
    onDelete: "CASCADE",
  });
  Market.Product.belongsTo(Accounts.Account, {
    foreignKey: "accountId",
    as: "seller",
  });

  /* GEOGRAPHY */

  Geo.Country.hasMany(Geo.City, { foreignKey: "countryId", as: "cities" });
  Geo.City.belongsTo(Geo.Country, { foreignKey: "countryId", as: "country" });

  Geo.City.hasMany(Market.Shop, { foreignKey: "cityId", as: "shops" });
  Market.Shop.belongsTo(Geo.City, { foreignKey: "cityId", as: "city" });

  Geo.City.hasMany(Market.Product, { foreignKey: "cityId", as: "products" });
  Market.Product.belongsTo(Geo.City, { foreignKey: "cityId", as: "city" });

  /* CATEGORIES */

  // Self-referencing: the tree is one table, so its depth is not baked in.
  Category.hasMany(Category, { foreignKey: "parentId", as: "children" });
  Category.belongsTo(Category, { foreignKey: "parentId", as: "parent" });

  Category.hasMany(Market.Product, { foreignKey: "categoryId", as: "products" });
  Market.Product.belongsTo(Category, { foreignKey: "categoryId", as: "category" });

  /* MARKET RELATIONSHIPS */

  // CASCADE, unlike almost everything else here: a photograph of a listing has
  // no meaning once the listing is gone, and orphaned rows would keep pointing
  // at Cloudinary files nothing will ever clean up.
  Market.Product.hasMany(Market.ProductImage, {
    foreignKey: "productId",
    as: "images",
    onDelete: "CASCADE",
  });
  Market.ProductImage.belongsTo(Market.Product, {
    foreignKey: "productId",
    as: "product",
  });

  // SET NULL, not CASCADE: closing a shop unbrands its listings, it does not
  // destroy the seller's inventory.
  Market.Shop.hasMany(Market.Product, {
    foreignKey: "shopId",
    as: "products",
    onDelete: "SET NULL",
  });
  Market.Product.belongsTo(Market.Shop, {
    foreignKey: "shopId",
    as: "shop",
  });

  // One order, one suborder per shop involved.
  Market.Order.hasMany(Market.SubOrder, {
    foreignKey: "orderId",
    as: "suborders",
    onDelete: "CASCADE",
  });
  Market.SubOrder.belongsTo(Market.Order, {
    foreignKey: "orderId",
    as: "order",
  });

  Market.Shop.hasMany(Market.SubOrder, {
    foreignKey: "shopId",
    as: "suborders",
  });
  Market.SubOrder.belongsTo(Market.Shop, {
    foreignKey: "shopId",
    as: "shop",
  });

  Market.SubOrder.hasMany(Market.OrderItem, {
    foreignKey: "subOrderId",
    as: "items",
    onDelete: "CASCADE",
  });
  Market.OrderItem.belongsTo(Market.SubOrder, {
    foreignKey: "subOrderId",
    as: "suborder",
  });

  // Nullable on purpose: a product can be removed and the line it sold must
  // still read, which is why the item carries its own title and price.
  Market.Product.hasMany(Market.OrderItem, {
    foreignKey: "productId",
    as: "sales",
    onDelete: "SET NULL",
  });
  Market.OrderItem.belongsTo(Market.Product, {
    foreignKey: "productId",
    as: "product",
  });

};

module.exports = init;
