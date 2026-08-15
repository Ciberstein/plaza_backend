const { db } = require('./config');

// db.sync({ force: false }) creates missing tables but never alters an existing
// one, so a column added to a model after the table exists is silently absent.
// These run on every boot and are idempotent.
const COLUMNS = [
  { table: '"market"."shops"', column: 'shipping', definition: "VARCHAR(255) NOT NULL DEFAULT 'seller'" },
  { table: '"market"."shops"', column: 'cityId', definition: 'INTEGER' },
  { table: '"market"."products"', column: 'accountId', definition: 'INTEGER' },
  { table: '"market"."products"', column: 'categoryId', definition: 'INTEGER' },
  { table: '"market"."products"', column: 'cityId', definition: 'INTEGER' },
  { table: '"market"."shops"', column: 'submittedAt', definition: 'TIMESTAMPTZ' },
  { table: '"market"."shops"', column: 'approvedAt', definition: 'TIMESTAMPTZ' },
  { table: '"market"."shops"', column: 'reviewNote', definition: 'TEXT' },
  { table: '"market"."shops"', column: 'reviewedBy', definition: 'INTEGER' },
  // Added after the products table existed, so sync will not put them there.
  { table: '"market"."products"', column: 'condition', definition: 'VARCHAR(255)' },
  { table: '"market"."products"', column: 'delivery', definition: "VARCHAR(255)[] NOT NULL DEFAULT '{}'" },
  { table: '"accounts"."accounts"', column: 'phoneCountryId', definition: 'INTEGER' },
  { table: '"accounts"."accounts"', column: 'phone', definition: 'VARCHAR(255)' },
  { table: '"market"."suborders"', column: 'accountId', definition: 'INTEGER' },
  { table: '"market"."suborders"', column: 'cancelledBy', definition: 'VARCHAR(255)' },
  { table: '"market"."suborders"', column: 'cancelReason', definition: 'TEXT' },
  // Services. Every row that existed before them is a good, which is what the
  // default says, so no backfill is needed and none is guessed at.
  { table: '"market"."products"', column: 'kind', definition: "VARCHAR(255) NOT NULL DEFAULT 'good'" },
  { table: '"market"."products"', column: 'rateUnit', definition: 'VARCHAR(255)' },
  { table: '"market"."categories"', column: 'kind', definition: "VARCHAR(255) NOT NULL DEFAULT 'good'" },
  // Shops with more than one person. The membership table is new and sync
  // creates it; these two are columns on tables that already existed, which
  // sync never revisits.
  //
  // Both nullable and both backfill-free on purpose. A suborder written before
  // this has no handler, and `accountId` is the honest fallback because until
  // now the two were always the same person. A rating left before this carries
  // no shop, and inventing one would be inventing a fact about a sale nobody
  // can go back and check.
  { table: '"market"."suborders"', column: 'handledBy', definition: 'INTEGER' },
  { table: '"market"."seller_ratings"', column: 'shopId', definition: 'INTEGER' },
];

// The free-text category and city on a shop, replaced by references into
// market.categories and geo.cities.
const DROPS = [
  // Added and taken out the same day. "New" is measured from createdAt, which
  // is close enough now that creating and publishing is usually one action.
  { table: '"market"."products"', column: 'publishedAt' },
  { table: '"market"."shops"', column: 'category' },
  { table: '"market"."shops"', column: 'city' },
];

// sync creates a column with the nullability the model had when the table was
// first made, and never revisits it. A column that has since become optional
// stays NOT NULL until something says otherwise.
const NULLABLE = [
  { table: '"market"."products"', column: 'shopId' },
  // A purchase from someone who has no shop had nowhere to hang.
  { table: '"market"."suborders"', column: 'shopId' },
  // A service may be quoted rather than priced — a contractor cannot cost a
  // renovation before seeing the room. Goods are still required to carry one,
  // which the validation enforces rather than the column.
  { table: '"market"."products"', column: 'price' },
  // And an order line for one has no agreed price yet. Zero would be a record
  // of somebody agreeing to work for nothing.
  { table: '"market"."order_items"', column: 'unitPrice' },
];

/**
 * Constraints, which sync never adds to a table that already exists.
 *
 * The username index is on LOWER(username), not on the column: two accounts
 * called "Ana" and "ana" are the same person to every reader, and on a
 * marketplace where the name sits beside a listing, allowing both is an
 * impersonation waiting to happen.
 *
 * Attempted rather than assumed. A unique index cannot be built over data that
 * already breaks it, and refusing to boot over historical duplicates would take
 * the API down for something only a person can decide. It says what is in the
 * way and applies itself the moment the way is clear.
 */
const INDEXES = [
  {
    // A shop's average, grouped on its own column. Here rather than on the
    // model because sync builds a model's indexes before ensureColumns runs,
    // and an index on a column that does not exist yet takes the boot down.
    name: "seller_ratings_shop_idx",
    sql: 'CREATE INDEX IF NOT EXISTS "seller_ratings_shop_idx" ON "market"."seller_ratings" ("shopId");',
    why: "the shopId column is not there yet",
    show: "select column_name from information_schema.columns where table_schema = 'market' and table_name = 'seller_ratings';",
  },
  {
    name: "accounts_username_lower_idx",
    sql: 'CREATE UNIQUE INDEX IF NOT EXISTS "accounts_username_lower_idx" ON "accounts"."accounts" (LOWER("username"));',
    why: "two accounts already share a username",
    show: "select lower(username) as name, count(*) from accounts.accounts group by 1 having count(*) > 1;",
  },
];

const ensureIndexes = async () => {
  for (const index of INDEXES) {
    try {
      await db.query(index.sql);
      console.log("[34mMIGRATION:[0m", "[32m" + index.name + " ready[0m");
    } catch (err) {
      console.warn("[33mMIGRATION HELD:[0m", index.name, "-", index.why);
      console.warn("  ", err.message);
      console.warn("   find them with:", index.show);
    }
  }
};

const ensureColumns = async () => {
  for (const { table, column, definition } of COLUMNS) {
    await db.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS "${column}" ${definition};`);
    console.log('\x1b[34mMIGRATION:\x1b[0m', '\x1b[32m' + table + '.' + column + ' ready\x1b[0m');
  }

  for (const { table, column } of NULLABLE) {
    await db.query(`ALTER TABLE ${table} ALTER COLUMN "${column}" DROP NOT NULL;`);
    console.log('[34mMIGRATION:[0m', '[32m' + table + '.' + column + ' now optional[0m');
  }

  for (const { table, column } of DROPS) {
    await db.query(`ALTER TABLE ${table} DROP COLUMN IF EXISTS "${column}";`);
    console.log('\x1b[34mMIGRATION:\x1b[0m', '\x1b[32m' + table + '.' + column + ' dropped\x1b[0m');
  }
};

module.exports = { ensureColumns, ensureIndexes };
