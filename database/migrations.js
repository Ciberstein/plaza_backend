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
];

// The free-text category and city on a shop, replaced by references into
// market.categories and geo.cities.
const DROPS = [
  { table: '"market"."shops"', column: 'category' },
  { table: '"market"."shops"', column: 'city' },
];

// sync creates a column with the nullability the model had when the table was
// first made, and never revisits it. A column that has since become optional
// stays NOT NULL until something says otherwise.
const NULLABLE = [
  { table: '"market"."products"', column: 'shopId' },
];

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

module.exports = { ensureColumns };
