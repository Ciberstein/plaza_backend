require("dotenv").config();
const { server } = require("./app");
const { db } = require("./database/config");
const { createSchemas } = require("./database/schemas");
const { ensureColumns, ensureIndexes } = require("./database/migrations");
const init = require("./models/init.models");

const { seed } = require("./seeders");
const { seedDemo } = require("./seeders/demo");
const { startDemoSchedule } = require("./seeders/demo/schedule");

const PORT = process.env.PORT || 4000;

const start = async () => {
  try {
    await db.authenticate();
    console.log("\x1b[34mDATABASE AUTH STATUS:\x1b[0m", "\x1b[32mAUTHENTICATED\x1b[0m");

    await createSchemas();

    init();

    await db.sync({ force: false });
    console.log("\x1b[34mDATABASE STATUS:\x1b[0m", "\x1b[32mSYNC\x1b[0m");

    await ensureColumns();
    await ensureIndexes();

    // Reference data the whole marketplace reads from: countries, cities and
    // the category tree. Idempotent, so it runs on every boot.
    await seed();

    // And, on a developer's machine only, a marketplace with people in it.
    // Both of these check NODE_ENV themselves and do nothing anywhere else —
    // the guard is inside them rather than here, so it cannot be lost by
    // somebody rearranging this file.
    await seedDemo();
    startDemoSchedule();

    server.listen(PORT, () => {
      console.log(
        "\x1b[34mSERVER IS RUNNING ON PORT:\x1b[0m",
        "\x1b[32m" + PORT + "\x1b[0m"
      );
    });
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};

start();
