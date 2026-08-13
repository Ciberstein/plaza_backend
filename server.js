require("dotenv").config();
const { server } = require("./app");
const { db } = require("./database/config");
const { createSchemas } = require("./database/schemas");
const { ensureColumns } = require("./database/migrations");
const init = require("./models/init.models");

const { seed } = require("./seeders");

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

    // Reference data the whole marketplace reads from: countries, cities and
    // the category tree. Idempotent, so it runs on every boot.
    await seed();

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
