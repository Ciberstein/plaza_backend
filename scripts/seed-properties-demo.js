/**
 * Three properties, to look at.
 *
 * Demonstration data, not reference data — which is why it lives here and not
 * in `seeders/`, where everything is idempotent and runs on every boot. These
 * are rows somebody asked for once so the interface has something in it.
 *
 * The three are chosen to cover what the interface has to tell apart: a rent
 * with a service charge, a sale, and a plot with no rooms at all. If all three
 * draw correctly, the card and the specification block are handling the ranges
 * that actually differ.
 *
 * Run with: node scripts/seed-properties-demo.js
 */
require("dotenv").config({ quiet: true });

const { db } = require("../database/config");
const Market = require("../models/market.models");
const Accounts = require("../models/accounts.models");
const Geo = require("../models/geo.models");
const { Category } = require("../models/categories.models");
const init = require("../models/init.models");

init();

const LISTINGS = [
  {
    slug: "vivienda-apartamento",
    city: "Medellín",
    title: "Apartamento de 3 habitaciones en Laureles",
    description:
      "Tercer piso con ascensor, en una unidad cerrada a dos cuadras del " +
      "Primer Parque de Laureles. Cocina integral, closets en las tres " +
      "habitaciones y balcón hacia el interior, que es el lado silencioso.\n\n" +
      "La administración cubre portería 24 horas, gimnasio y el salón comunal.",
    price: 2500000,
    property: {
      operation: "rent", condition: "used",
      builtArea: 82, privateArea: 74,
      bedrooms: 3, bathrooms: 2, halfBaths: 1, parking: 1,
      stratum: 5, floor: 3, builtYear: 2012,
      adminFee: 420000, adminIncluded: false,
      features: [
        "elevator", "concierge", "gated_community", "gym", "communal_room",
        "balcony", "fitted_kitchen", "closets", "natural_gas",
      ],
      neighborhood: "Laureles",
      address: "Carrera 76 # 38-40, apto 302",
      addressVisibility: "street",
      phonePublic: true,
    },
  },
  {
    slug: "vivienda-casa",
    city: "Bogotá",
    title: "Casa de dos plantas en Cedritos",
    description:
      "Casa esquinera con patio y garaje para dos carros. Cuatro habitaciones " +
      "arriba, sala-comedor y estudio abajo. Zona tranquila, con colegios y " +
      "el parque de Cedritos a pocas cuadras.\n\n" +
      "Se vende sin muebles. Recibida hace tres años y con la cocina renovada.",
    price: 780000000,
    property: {
      operation: "sale", condition: "used",
      builtArea: 210, privateArea: 195, lotArea: 160,
      bedrooms: 4, bathrooms: 3, halfBaths: 1, parking: 2,
      stratum: 4, builtYear: 1998,
      features: [
        "patio", "garden", "storage_room", "fitted_kitchen", "closets",
        "fireplace", "natural_gas", "pets_allowed",
      ],
      neighborhood: "Cedritos",
      address: "Calle 140 # 12-18",
      addressVisibility: "exact",
      phonePublic: false,
    },
  },
  {
    slug: "terrenos-lote-urbano",
    city: "Cartagena",
    title: "Lote urbano de 300 m² en Turbaco",
    description:
      "Lote plano, con servicios en la vía y escritura al día. Sobre vía " +
      "pavimentada, a quince minutos del centro de Turbaco.\n\n" +
      "Apto para vivienda de dos pisos según la norma vigente.",
    price: 145000000,
    property: {
      // Nothing but land: no rooms, no floor, no service charge. The card and
      // the specification block both have to survive that, which is the whole
      // reason this one is in the set.
      operation: "sale", condition: "new",
      builtArea: 300, lotArea: 300,
      bedrooms: 0, bathrooms: 0, halfBaths: 0, parking: 0,
      stratum: 2,
      features: [],
      neighborhood: "Turbaco",
      address: "Vía Turbaco km 4 # 2-15",
      addressVisibility: "hidden",
      phonePublic: true,
    },
  },
];

(async () => {
  await db.authenticate();

  const owner = await Accounts.Account.findOne({ where: { username: "Cyberstein" } })
    ?? await Accounts.Account.findOne({ order: [["id", "ASC"]] });

  // Real photographs from listings that already exist, so the cards are not
  // three grey rectangles. Borrowed rather than uploaded: this is a script for
  // looking at the interface, not for filling Cloudinary.
  //
  // `publicId` is borrowed with the url because the column is NOT NULL and the
  // two describe the same asset. That means two rows point at one file, so
  // removing a photo from one of these demo listings would delete the file out
  // from under the listing it came from. Deleting the listing itself is safe —
  // that path drops the folder named after its own id, which is empty. Worth
  // knowing before using this script on anything but test data.
  const shots = await Market.ProductImage.findAll({ attributes: ["url", "publicId"], limit: 12 });

  let made = 0;

  for (const [index, entry] of LISTINGS.entries()) {
    const category = await Category.findOne({ where: { slug: entry.slug } });
    const city = await Geo.City.findOne({ where: { name: entry.city } });

    if (!category || !city) {
      console.log(`\x1b[33mfalta la categoría o la ciudad de "${entry.title}"\x1b[0m`);
      continue;
    }

    // Matched on the title, so running this twice does not make six.
    const already = await Market.Product.findOne({
      where: { title: entry.title, accountId: owner.id },
    });

    if (already) {
      console.log(`\x1b[90mya existe: ${entry.title}\x1b[0m`);
      continue;
    }

    await db.transaction(async (transaction) => {
      const product = await Market.Product.create({
        accountId: owner.id,
        kind: "property",
        categoryId: category.id,
        cityId: city.id,
        title: entry.title,
        description: entry.description,
        price: entry.price,
        currency: "COP",
        stock: 1,
        status: "active",
        delivery: [],
      }, { transaction });

      await Market.Property.create(
        { ...entry.property, productId: product.id },
        { transaction },
      );

      const mine = shots.slice(index * 3, index * 3 + 3);

      for (const [position, shot] of mine.entries()) {
        await Market.ProductImage.create(
          { productId: product.id, url: shot.url, publicId: shot.publicId, position },
          { transaction },
        );
      }
    });

    made += 1;
    console.log(`\x1b[32mcreado:\x1b[0m ${entry.title}`);
  }

  const total = await Market.Product.count({ where: { kind: "property" } });
  console.log(`\n${made} nuevos · ${total} inmuebles en total`);

  await db.close();
})().catch(async (error) => {
  console.error("\x1b[31m" + error.message + "\x1b[0m");
  await db.close().catch(() => {});
  process.exit(1);
});
