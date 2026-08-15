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

  // Where the dialling code comes from, so it is read at display time rather
  // than copied into the account and left to go stale.
  Geo.Country.hasMany(Accounts.Account, {
    foreignKey: "phoneCountryId",
    as: "accounts",
  });
  Accounts.Account.belongsTo(Geo.Country, {
    foreignKey: "phoneCountryId",
    as: "phoneCountry",
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

  // Both ends cascade, for the same reason a favourite does: a basket line
  // pointing at nothing is not a record of anything.
  Accounts.Account.hasMany(Market.CartItem, {
    foreignKey: "accountId",
    as: "cart",
    onDelete: "CASCADE",
  });
  Market.CartItem.belongsTo(Accounts.Account, {
    foreignKey: "accountId",
    as: "account",
  });

  Market.Product.hasMany(Market.CartItem, {
    foreignKey: "productId",
    as: "baskets",
    onDelete: "CASCADE",
  });
  Market.CartItem.belongsTo(Market.Product, {
    foreignKey: "productId",
    as: "product",
  });

  // Both ends cascade. A bookmark to a listing that no longer exists is not a
  // record of anything, and unlike an order it says nothing anyone needs later.
  Accounts.Account.hasMany(Market.Favourite, {
    foreignKey: "accountId",
    as: "favourites",
    onDelete: "CASCADE",
  });
  Market.Favourite.belongsTo(Accounts.Account, {
    foreignKey: "accountId",
    as: "account",
  });

  Market.Product.hasMany(Market.Favourite, {
    foreignKey: "productId",
    as: "favourites",
    onDelete: "CASCADE",
  });
  Market.Favourite.belongsTo(Market.Product, {
    foreignKey: "productId",
    as: "product",
  });

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

  // What a seller has to deal with, whether or not it came through a shop.
  Accounts.Account.hasMany(Market.SubOrder, {
    foreignKey: "accountId",
    as: "sales",
  });
  Market.SubOrder.belongsTo(Accounts.Account, {
    foreignKey: "accountId",
    as: "seller",
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

  // CASCADE from the listing: a question about something that no longer exists
  // answers nothing and is shown nowhere.
  Market.Product.hasMany(Market.ProductQuestion, {
    foreignKey: "productId",
    as: "questions",
    onDelete: "CASCADE",
  });
  Market.ProductQuestion.belongsTo(Market.Product, {
    foreignKey: "productId",
    as: "product",
  });

  // And CASCADE from the account, the way a favourite and a basket line do.
  // The association is named `asker` to make it obvious at every call site
  // that including it pulls in the one thing no response may carry.
  Accounts.Account.hasMany(Market.ProductQuestion, {
    foreignKey: "accountId",
    as: "questions",
    onDelete: "CASCADE",
  });
  Market.ProductQuestion.belongsTo(Accounts.Account, {
    foreignKey: "accountId",
    as: "asker",
  });

  /* REPUTATION */

  // One rating per completed transaction. CASCADE from the suborder, because a
  // rating of a purchase that no longer exists is a rating of nothing.
  Market.SubOrder.hasOne(Market.SellerRating, {
    foreignKey: "subOrderId",
    as: "rating",
    onDelete: "CASCADE",
  });
  Market.SellerRating.belongsTo(Market.SubOrder, {
    foreignKey: "subOrderId",
    as: "suborder",
  });

  // The seller being rated, and the buyer who rated. Two associations onto the
  // same table, so both ends are named for the part they play.
  Accounts.Account.hasMany(Market.SellerRating, {
    foreignKey: "sellerId",
    as: "ratings",
    onDelete: "CASCADE",
  });
  Market.SellerRating.belongsTo(Accounts.Account, {
    foreignKey: "sellerId",
    as: "seller",
  });

  Accounts.Account.hasMany(Market.SellerRating, {
    foreignKey: "accountId",
    as: "ratingsGiven",
    onDelete: "CASCADE",
  });
  Market.SellerRating.belongsTo(Accounts.Account, {
    foreignKey: "accountId",
    as: "rater",
  });

  // A review dies with the listing it is about: kept, it would be an opinion
  // of something nobody can look at.
  Market.Product.hasMany(Market.ProductReview, {
    foreignKey: "productId",
    as: "reviews",
    onDelete: "CASCADE",
  });
  Market.ProductReview.belongsTo(Market.Product, {
    foreignKey: "productId",
    as: "product",
  });

  Accounts.Account.hasMany(Market.ProductReview, {
    foreignKey: "accountId",
    as: "reviews",
    onDelete: "CASCADE",
  });
  Market.ProductReview.belongsTo(Accounts.Account, {
    foreignKey: "accountId",
    as: "author",
  });

  // The other half of a property listing. CASCADE and one-to-one: these
  // columns describe that listing and have no meaning apart from it, so they
  // cannot outlive it and cannot be pointed at a second one.
  Market.Product.hasOne(Market.Property, {
    foreignKey: "productId",
    as: "property",
    onDelete: "CASCADE",
  });
  Market.Property.belongsTo(Market.Product, {
    foreignKey: "productId",
    as: "product",
  });

  // A visit to a listing that no longer exists is nothing to keep, and the
  // same is true of one asked for by an account that is gone. Both CASCADE,
  // the way questions do.
  Market.Product.hasMany(Market.VisitRequest, {
    foreignKey: "productId",
    as: "visits",
    onDelete: "CASCADE",
  });
  Market.VisitRequest.belongsTo(Market.Product, {
    foreignKey: "productId",
    as: "product",
  });

  Accounts.Account.hasMany(Market.VisitRequest, {
    foreignKey: "accountId",
    as: "visits",
    onDelete: "CASCADE",
  });
  Market.VisitRequest.belongsTo(Accounts.Account, {
    foreignKey: "accountId",
    as: "visitor",
  });

  // Who works in a shop that is not theirs. CASCADE from both sides: a
  // membership of a shop that is gone, or held by an account that is gone, is
  // a row that can never mean anything again.
  Market.Shop.hasMany(Market.ShopMember, {
    foreignKey: "shopId",
    as: "members",
    onDelete: "CASCADE",
  });
  Market.ShopMember.belongsTo(Market.Shop, {
    foreignKey: "shopId",
    as: "shop",
  });

  Accounts.Account.hasMany(Market.ShopMember, {
    foreignKey: "accountId",
    as: "memberships",
    onDelete: "CASCADE",
  });
  Market.ShopMember.belongsTo(Accounts.Account, {
    foreignKey: "accountId",
    as: "account",
  });

  // SET NULL rather than CASCADE: an invitation outlives whoever sent it, and
  // losing the sender is not a reason to throw somebody out of a shop.
  Market.ShopMember.belongsTo(Accounts.Account, {
    foreignKey: "invitedBy",
    as: "inviter",
    onDelete: "SET NULL",
  });

  // Who confirmed a suborder, and so who the buyer deals with. SET NULL, for
  // the same reason: the order is still the shop's if the person who answered
  // it has since left.
  Market.SubOrder.belongsTo(Accounts.Account, {
    foreignKey: "handledBy",
    as: "handler",
    onDelete: "SET NULL",
  });

  // A rating left for a shop rather than for the person who happened to answer
  // the phone. SET NULL so a closing shop does not delete its sellers' history
  // — the average simply falls back to the person it was left for.
  Market.Shop.hasMany(Market.SellerRating, {
    foreignKey: "shopId",
    as: "ratings",
    onDelete: "SET NULL",
  });
  Market.SellerRating.belongsTo(Market.Shop, {
    foreignKey: "shopId",
    as: "shop",
  });

};

module.exports = init;
