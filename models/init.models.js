const Accounts = require("./accounts.models");
const Market = require("./market.models");

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

  /* MARKET RELATIONSHIPS */

  Market.Shop.hasMany(Market.Product, {
    foreignKey: "shopId",
    as: "products",
    onDelete: "CASCADE",
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
