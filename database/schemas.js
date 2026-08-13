const { db } = require('./config');

// One schema per domain, the way the other projects split them. Keeps the
// marketplace tables apart from accounts and from anything added later.
const SCHEMAS = ['accounts', 'auth', 'app', 'market'];

const createSchemas = async () => {
  const existing = await db.showAllSchemas();

  for (const schema of SCHEMAS) {
    if (!existing.includes(schema)) {
      await db.createSchema(schema);
    }
    console.log(
      '\x1b[34mSCHEMA:\x1b[0m',
      '\x1b[32m' + schema + ' ready\x1b[0m'
    );
  }
};

module.exports = { createSchemas, SCHEMAS };
