const { db } = require('./config');

// db.sync({ force: false }) creates missing tables but never alters an existing
// one, so a column added to a model after the table exists is silently absent.
// These run on every boot and are idempotent.
const COLUMNS = [
  // { table: '"market"."shops"', column: 'slug', definition: 'VARCHAR(255)' },
];

const DROPS = [
  // { table: '"market"."shops"', column: 'legacy' },
];

const ensureColumns = async () => {
  for (const { table, column, definition } of COLUMNS) {
    await db.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS "${column}" ${definition};`);
    console.log('\x1b[34mMIGRATION:\x1b[0m', '\x1b[32m' + table + '.' + column + ' ready\x1b[0m');
  }

  for (const { table, column } of DROPS) {
    await db.query(`ALTER TABLE ${table} DROP COLUMN IF EXISTS "${column}";`);
    console.log('\x1b[34mMIGRATION:\x1b[0m', '\x1b[32m' + table + '.' + column + ' dropped\x1b[0m');
  }
};

module.exports = { ensureColumns };
