const { Op } = require("sequelize");
const Market = require("../models/market.models");

/**
 * Who may act for a shop.
 *
 * Until shops had more than one person, every one of these questions was the
 * same comparison written nine times: does this row's `accountId` equal the
 * session's. That is no longer the question, and nine copies of a rule is nine
 * chances to update eight of them.
 *
 * Two roles, and neither is stored as one. The owner is `Shop.accountId`,
 * where they have always been; a collaborator is a row in `shop_members` with
 * `acceptedAt` set. An enum with two values would only be a second place for
 * them to disagree.
 *
 * Nothing here is middleware. Three of the call sites have already loaded the
 * row they are asking about and would otherwise fetch it twice.
 */

/** Every shop this account may act for, owned or joined. Ids only. */
const shopIdsFor = async (accountId) => {
  if (!accountId) return [];

  const [owned, joined] = await Promise.all([
    Market.Shop.findAll({ where: { accountId }, attributes: ["id"] }),
    Market.ShopMember.findAll({
      // A pending invitation grants nothing. Somebody who was asked and has
      // not answered is not a member, and treating them as one would let an
      // owner give a stranger their catalogue by typing a username.
      where: { accountId, acceptedAt: { [Op.ne]: null } },
      attributes: ["shopId"],
    }),
  ]);

  return [...new Set([...owned.map(s => s.id), ...joined.map(m => m.shopId)])];
};

/** Whether this account may act for this shop. */
const mayActForShop = async (accountId, shopId) => {
  if (!accountId || !shopId) return false;

  const shop = await Market.Shop.findByPk(shopId, { attributes: ["id", "accountId"] });
  if (!shop) return false;
  if (shop.accountId === accountId) return true;

  const member = await Market.ShopMember.findOne({
    where: { shopId, accountId, acceptedAt: { [Op.ne]: null } },
    attributes: ["id"],
  });

  return Boolean(member);
};

/** Only the owner. Inviting, removing, editing the shop, closing it. */
const ownsShop = async (accountId, shopId) => {
  if (!accountId || !shopId) return false;

  const shop = await Market.Shop.findOne({
    where: { id: shopId, accountId },
    attributes: ["id"],
  });

  return Boolean(shop);
};

/**
 * Whether this account may act on this listing.
 *
 * `product.accountId` no longer means "the seller" — it means who created it.
 * A listing published under a shop belongs to the shop, and any member may
 * answer its questions, accept its visits and handle its sales. A listing with
 * no shop still belongs to one person, which is the same rule it always had.
 *
 * Takes a loaded row rather than an id: every caller has one.
 */
const mayActOnListing = async (accountId, product) => {
  if (!product || !accountId) return false;
  if (product.accountId === accountId) return true;
  if (!product.shopId) return false;

  return mayActForShop(accountId, product.shopId);
};

/**
 * Deleting is the exception inside the catalogue.
 *
 * Only whoever created it, or the shop's owner. It is the one irreversible
 * action there, and "anybody may delete anything" is a bad default for a room
 * of people still learning to work together.
 */
const mayDeleteListing = async (accountId, product) => {
  if (!product || !accountId) return false;
  if (product.accountId === accountId) return true;
  if (!product.shopId) return false;

  return ownsShop(accountId, product.shopId);
};

module.exports = {
  shopIdsFor,
  mayActForShop,
  ownsShop,
  mayActOnListing,
  mayDeleteListing,
};
