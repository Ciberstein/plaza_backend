const Geo = require("../models/geo.models");
const { Category } = require("../models/categories.models");
const { slugify } = require("../utils/slug.util");
const { countries, cities } = require("./data/geo.data.seeders");
const { categories } = require("./data/categories.data.seeders");
const { services } = require("./data/services.data.seeders");

// Every seeder here inserts only the rows that are missing, matched on a
// natural key, and never touches a row that already exists. Two consequences
// that matter: adding an entry to the seed data later reaches a database that
// was already seeded, and anything an admin edited survives a redeploy.
//
// The `if (count === 0)` shape is deliberately avoided — under it, a table with
// one row is considered finished forever.

const report = (label, added, total) => {
  if (added) {
    console.log(
      `\x1b[34m${label}:\x1b[0m`,
      `\x1b[32m${added} added\x1b[0m`,
      `\x1b[90m(${total} total)\x1b[0m`
    );
  } else {
    console.log(`\x1b[34m${label}:\x1b[0m`, "\x1b[33mup to date\x1b[0m");
  }
};

// keyOf maps both a seed entry and a stored row to the value they are compared
// on, so the two sides always agree on what "the same row" means.
const seedMissing = async ({ label, model, entries, keyOf, build, where }) => {
  try {
    const stored = await model.findAll(where ? { where } : undefined);
    const known = new Set(stored.map(keyOf));

    const missing = entries.filter(entry => !known.has(keyOf(entry)));
    if (missing.length) {
      await model.bulkCreate(missing.map(build || (entry => entry)));
    }

    report(label, missing.length, stored.length + missing.length);
    return missing.length;
  } catch (err) {
    console.error(`${label}: seeding failed`, err.message);
    return 0;
  }
};

const countries_seeder = () => seedMissing({
  label: "COUNTRIES",
  model: Geo.Country,
  entries: countries,
  keyOf: row => row.code,
});

const cities_seeder = async () => {
  const stored = await Geo.Country.findAll({ attributes: ["id", "code"] });
  const idOf = new Map(stored.map(c => [c.code, c.id]));

  // A city whose country was not seeded is skipped rather than inserted with a
  // dangling reference.
  const entries = cities
    .filter(city => idOf.has(city.country))
    .map(city => ({
      countryId: idOf.get(city.country),
      name: city.name,
      slug: slugify(city.name),
      region: city.region ?? null,
    }));

  return seedMissing({
    label: "CITIES",
    model: Geo.City,
    entries,
    keyOf: row => `${row.countryId}:${row.slug}`,
  });
};

/**
 * One tree, of either kind.
 *
 * Both aisles are the same shape and the same table, so they are seeded by the
 * same function with the kind carried through. The slug stays unique across
 * the whole table — the two trees were written not to collide, and a child's
 * slug is prefixed with its parent's, which keeps "Computadores" under
 * repairs apart from "Computadores y portátiles" under technology.
 */
const category_tree = async ({ tree, kind, labels }) => {
  // Parents first, so the children have something to point at.
  const parents = tree.map(({ name, slug, position }) => ({
    name, slug, position, kind, parentId: null,
  }));

  await seedMissing({
    label: labels.parents,
    model: Category,
    entries: parents,
    keyOf: row => row.slug,
  });

  const stored = await Category.findAll({ attributes: ["id", "slug"] });
  const idOf = new Map(stored.map(c => [c.slug, c.id]));

  const children = tree.flatMap(parent =>
    (parent.children ?? []).map((name, index) => ({
      name,
      slug: `${parent.slug}-${slugify(name)}`,
      position: index + 1,
      kind,
      parentId: idOf.get(parent.slug) ?? null,
    }))
  ).filter(child => child.parentId !== null);

  return seedMissing({
    label: labels.children,
    model: Category,
    entries: children,
    keyOf: row => row.slug,
  });
};

const seed = async () => {
  await countries_seeder();
  await cities_seeder();

  await category_tree({
    tree: categories,
    kind: "good",
    labels: { parents: "CATEGORIES", children: "SUBCATEGORIES" },
  });

  await category_tree({
    tree: services,
    kind: "service",
    labels: { parents: "SERVICE CATEGORIES", children: "SERVICE SUBCATEGORIES" },
  });
};

module.exports = { seed, seedMissing };
