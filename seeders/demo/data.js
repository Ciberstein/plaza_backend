const { DEMO_DOMAIN } = require("./guard");

/**
 * The cast, and what they are selling.
 *
 * Written out rather than generated. Random data makes a marketplace that
 * looks like a marketplace and reads like nothing: "Producto 47" tells you
 * nothing about whether a card is legible, whether a long title wraps, or
 * whether the price column lines up. These are the listings somebody would
 * actually post in a Colombian marketplace, at the lengths they would actually
 * write them.
 *
 * The set is chosen to cover the ranges the interface has to survive, not to
 * be exhaustive: a title that is far too long, a service quoted rather than
 * priced, a property with no rooms at all, a seller with no ratings beside one
 * with many.
 */

const person = (handle) => `${handle}${DEMO_DOMAIN}`;

// Everyone shares a password. These accounts are disposable by construction
// and the login screen prints the one that matters; a different password each
// would be five secrets to look up for no gain.
const DEMO_PASSWORD = "PlazaDemo.7";

const ACCOUNTS = [
  { username: "ana-restrepo", email: person("ana"), role: "seller" },
  { username: "luis-mejia", email: person("luis"), role: "seller" },
  { username: "carolina-vega", email: person("carolina"), role: "seller" },
  { username: "andres-quintero", email: person("andres"), role: "buyer" },
  { username: "marcela-ortiz", email: person("marcela"), role: "buyer" },
  { username: "inmobiliaria-andes", email: person("andes"), role: "seller" },
];

const SHOPS = [
  {
    owner: person("ana"),
    name: "Taller Aurora",
    description:
      "Cerámica hecha a mano en Envigado. Piezas de uso diario, cocidas a alta " +
      "temperatura, aptas para horno y lavavajillas.",
    city: "Medellín",
    shipping: "seller",
    status: "active",
    // A second person in the shop, so the members feature has something to
    // show without anybody having to invite themselves.
    members: [person("luis")],
  },
  {
    owner: person("andes"),
    name: "Inmobiliaria Andes",
    description: "Arriendo y venta de vivienda en Medellín y el Oriente antioqueño.",
    city: "Medellín",
    shipping: "pickup",
    status: "active",
    members: [person("carolina")],
  },
  {
    owner: person("luis"),
    name: "Bicicletas del Río",
    description: "Bicicletas usadas revisadas, repuestos y mantenimiento.",
    city: "Bogotá",
    shipping: "seller",
    // One waiting on review, because the dashboard has a state for it and an
    // empty state is not the same as a tested one.
    status: "pending",
  },
];

const GOODS = [
  {
    seller: person("ana"), shop: "Taller Aurora",
    category: "hogar-y-muebles-cocina-y-comedor", city: "Medellín",
    title: "Juego de 4 platos hondos en gres",
    description:
      "Gres esmaltado en blanco hueso, cocido a 1250 °C. Cada plato es " +
      "ligeramente distinto: se torneen a mano y esa es la gracia.\n\n" +
      "Aptos para horno, microondas y lavavajillas. 22 cm de diámetro.",
    price: 180000, stock: 6, condition: "new", delivery: ["shipping", "door_pickup"],
  },
  {
    seller: person("ana"), shop: "Taller Aurora",
    category: "hogar-y-muebles-decoracion", city: "Medellín",
    title: "Jarrón alto con esmalte de ceniza",
    description: "Pieza única de 38 cm. El esmalte se hace con ceniza de café.",
    price: 320000, stock: 1, condition: "new", delivery: ["door_pickup", "public_meetup"],
  },
  {
    seller: person("luis"),
    category: "deportes-y-aire-libre-ciclismo", city: "Bogotá",
    title: "Bicicleta de ruta Trek Domane, talla 54, con dos juegos de ruedas y mantenimiento reciente",
    // Deliberately long: a title nobody would trim is exactly what a card has
    // to survive, and this one is the reason the card clamps to two lines.
    description:
      "Grupo Shimano 105 de 11 velocidades, cuadro de carbono talla 54. " +
      "Incluye las ruedas de serie y unas Fulcrum Racing 5.\n\n" +
      "Mantenimiento hace dos meses: cadena, guayas y cintas nuevas.",
    price: 4200000, stock: 1, condition: "good", delivery: ["door_pickup", "public_meetup"],
  },
  {
    seller: person("carolina"),
    category: "tecnologia-celulares-y-accesorios", city: "Cali",
    title: "iPhone 13 de 128 GB",
    description: "Batería al 89%. Con caja, cable y una carcasa de silicona.",
    price: 1900000, stock: 1, condition: "like_new", delivery: ["shipping", "public_meetup"],
  },
  {
    seller: person("carolina"),
    category: "moda-ropa-de-mujer", city: "Cali",
    title: "Ruana de lana virgen tejida en Nobsa",
    description: "Lana sin teñir. Talla única.",
    price: 240000, stock: 3, condition: "new", delivery: ["shipping"],
  },
];

const SERVICES = [
  {
    seller: person("luis"),
    category: "reparaciones-y-tecnicos-computadores", city: "Bogotá",
    title: "Mantenimiento de computadores a domicilio",
    description:
      "Limpieza interna, cambio de pasta térmica, respaldo de información y " +
      "puesta a punto del sistema. Voy a tu casa u oficina.",
    price: 90000, rateUnit: "job", delivery: ["at_client"],
  },
  {
    seller: person("carolina"),
    category: "clases-y-tutorias-idiomas", city: "Cali",
    title: "Clases de inglés conversacional",
    description: "Una hora, en línea, enfocada en hablar y no en gramática.",
    price: 55000, rateUnit: "hour", delivery: ["remote"],
  },
  {
    seller: person("ana"),
    category: "construccion-y-reformas-pintura", city: "Medellín",
    title: "Pintura de interiores",
    // Quoted rather than priced: a painter cannot cost a flat before seeing
    // it, and the interface has a whole path for that answer.
    description: "Se cotiza después de ver el espacio. Incluye materiales.",
    price: null, rateUnit: null, delivery: ["at_client"],
  },
];

const PROPERTIES = [
  {
    seller: person("andes"), shop: "Inmobiliaria Andes",
    category: "vivienda-apartamento", city: "Medellín",
    title: "Apartamento de 2 habitaciones en Envigado",
    description:
      "Sexto piso con ascensor y vista abierta hacia el sur. Cocina " +
      "integral, balcón y parqueadero cubierto.\n\n" +
      "La administración incluye portería 24 horas y gimnasio.",
    price: 1800000,
    property: {
      operation: "rent", condition: "used",
      builtArea: 68, privateArea: 61,
      bedrooms: 2, bathrooms: 2, halfBaths: 0, parking: 1,
      stratum: 5, floor: 6, builtYear: 2016,
      adminFee: 380000, adminIncluded: false,
      features: ["elevator", "concierge", "gated_community", "gym", "balcony", "fitted_kitchen", "closets"],
      neighborhood: "Envigado",
      address: "Carrera 43 # 32 Sur-15, apto 604",
      addressVisibility: "street",
      latitude: 6.1701, longitude: -75.5905,
      phonePublic: false,
    },
  },
  {
    seller: person("andes"), shop: "Inmobiliaria Andes",
    category: "vivienda-casa", city: "Medellín",
    title: "Casa campestre en Rionegro",
    description: "Lote de 1.200 m² con casa de una planta, tres habitaciones y jardín.",
    price: 890000000,
    property: {
      operation: "sale", condition: "used",
      builtArea: 180, privateArea: 172, lotArea: 1200,
      bedrooms: 3, bathrooms: 3, halfBaths: 1, parking: 2,
      stratum: 4, builtYear: 2009,
      features: ["garden", "patio", "fireplace", "storage_room", "pets_allowed", "gated_community"],
      neighborhood: "Llanogrande",
      address: "Vereda Llanogrande km 6 # 12-40",
      addressVisibility: "hidden",
      latitude: 6.1345, longitude: -75.4012,
      phonePublic: true,
    },
  },
  {
    seller: person("carolina"),
    category: "comercial-local", city: "Cali",
    title: "Local comercial en San Fernando",
    description: "Sobre vía principal, con baño y mezanine. Recibido en obra gris.",
    price: 2900000,
    property: {
      operation: "rent", condition: "new",
      builtArea: 45,
      bedrooms: 0, bathrooms: 1, halfBaths: 0, parking: 0,
      stratum: 4,
      adminFee: 0, adminIncluded: false,
      features: ["natural_gas"],
      neighborhood: "San Fernando",
      address: "Calle 5 # 38-22",
      addressVisibility: "exact",
      latitude: 3.4235, longitude: -76.5432,
      phonePublic: true,
    },
  },
];

/**
 * Purchases, and what the buyers thought of them.
 *
 * The states are chosen so every screen has something in it: one waiting on
 * the seller, one confirmed and being arranged, and two finished — because a
 * rating needs a delivered suborder, and a screen that can never show a rating
 * is a screen nobody has really looked at.
 */
const ORDERS = [
  {
    buyer: person("andres"),
    listing: "Juego de 4 platos hondos en gres",
    quantity: 2,
    status: "delivered",
    rating: { stars: 5, comment: "Llegaron impecables y bien empacados. Ana avisó cada paso." },
    review: { stars: 5, body: "Más bonitos en persona. Ya pedí el segundo juego." },
  },
  {
    buyer: person("marcela"),
    listing: "Juego de 4 platos hondos en gres",
    quantity: 1,
    status: "delivered",
    rating: { stars: 4, comment: "Todo bien, aunque tardó dos días más de lo dicho." },
    review: { stars: 4, body: "Buena calidad. Uno venía con una burbuja en el esmalte." },
  },
  {
    buyer: person("marcela"),
    listing: "iPhone 13 de 128 GB",
    quantity: 1,
    status: "confirmed",
  },
  {
    buyer: person("andres"),
    listing: "Ruana de lana virgen tejida en Nobsa",
    quantity: 1,
    status: "pending",
  },
];

/** Public questions, one of them still unanswered so the inbox has work in it. */
const QUESTIONS = [
  {
    asker: person("andres"),
    listing: "Bicicleta de ruta Trek Domane, talla 54, con dos juegos de ruedas y mantenimiento reciente",
    body: "¿La talla 54 le sirve a alguien de 1,75 m?",
    answer: "Sí, es el rango típico. Si quieres la puedes probar antes de decidir.",
  },
  {
    asker: person("marcela"),
    listing: "Juego de 4 platos hondos en gres",
    body: "¿Se pueden meter al microondas?",
    answer: "Sí, y al lavavajillas también.",
  },
  {
    asker: person("andres"),
    listing: "iPhone 13 de 128 GB",
    body: "¿Tiene la factura de compra?",
    // Unanswered on purpose: the seller's inbox exists to find these.
    answer: null,
  },
];

/** Somebody asking to see a flat, in each of the three states. */
const VISITS = [
  {
    visitor: person("andres"),
    listing: "Apartamento de 2 habitaciones en Envigado",
    message: "Buenas. Me interesa para mudarme en marzo, ¿sigue disponible?",
    status: "accepted",
  },
  {
    visitor: person("marcela"),
    listing: "Casa campestre en Rionegro",
    message: "¿Se puede ver un sábado en la mañana? Vivo en Bogotá y viajo el fin de semana.",
    status: "pending",
  },
];

module.exports = {
  DEMO_PASSWORD,
  ACCOUNTS, SHOPS, GOODS, SERVICES, PROPERTIES, ORDERS, QUESTIONS, VISITS,
};
