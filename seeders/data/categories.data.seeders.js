// The aisles of the marketplace.
//
// Two levels: the top row is what the header strip shows, the children are what
// a seller picks when listing. Kept shallow on purpose — a shopper who has to
// descend four levels to find a phone case gives up, and a seller who cannot
// find the right leaf files the product in the wrong place.
//
// `position` sets the order of the top row. It is not alphabetical: the aisles
// that carry the most listings come first, the way a real marketplace ranks
// them.
const categories = [
  {
    name: "Tecnología", slug: "tecnologia", position: 1,
    children: [
      "Celulares y accesorios", "Computadores y portátiles", "Televisores y audio",
      "Consolas y videojuegos", "Cámaras y fotografía", "Accesorios de computador",
      "Almacenamiento", "Componentes y repuestos",
    ],
  },
  {
    name: "Hogar y muebles", slug: "hogar-y-muebles", position: 2,
    children: [
      "Muebles", "Colchones y descanso", "Cocina y comedor", "Baño",
      "Decoración", "Iluminación", "Organización y almacenamiento", "Jardín y exteriores",
    ],
  },
  {
    name: "Moda", slug: "moda", position: 3,
    children: [
      "Ropa de mujer", "Ropa de hombre", "Calzado", "Bolsos y carteras",
      "Relojes y joyería", "Gafas", "Ropa infantil", "Accesorios",
    ],
  },
  {
    name: "Electrodomésticos", slug: "electrodomesticos", position: 4,
    children: [
      "Refrigeración", "Lavado y secado", "Cocción", "Pequeños electrodomésticos",
      "Climatización", "Aspiradoras y limpieza",
    ],
  },
  {
    name: "Belleza y cuidado personal", slug: "belleza-y-cuidado-personal", position: 5,
    children: [
      "Maquillaje", "Cuidado de la piel", "Cuidado del cabello", "Perfumes",
      "Afeitado y depilación", "Higiene personal",
    ],
  },
  {
    name: "Deportes y aire libre", slug: "deportes-y-aire-libre", position: 6,
    children: [
      "Ciclismo", "Fitness y musculación", "Camping y montañismo", "Fútbol",
      "Running", "Deportes acuáticos", "Suplementos deportivos",
    ],
  },
  {
    name: "Vehículos y repuestos", slug: "vehiculos-y-repuestos", position: 7,
    children: [
      "Repuestos de carros", "Repuestos de motos", "Accesorios y tuning",
      "Llantas", "Audio para vehículos", "Herramientas de taller",
    ],
  },
  {
    name: "Herramientas y construcción", slug: "herramientas-y-construccion", position: 8,
    children: [
      "Herramientas eléctricas", "Herramientas manuales", "Materiales de construcción",
      "Pinturas", "Seguridad industrial", "Electricidad y plomería",
    ],
  },
  {
    name: "Bebés y niños", slug: "bebes-y-ninos", position: 9,
    children: [
      "Coches y sillas", "Alimentación", "Pañales y aseo", "Juguetes",
      "Ropa de bebé", "Habitación infantil",
    ],
  },
  {
    name: "Alimentos y bebidas", slug: "alimentos-y-bebidas", position: 10,
    children: [
      "Café y té", "Despensa", "Snacks y dulces", "Bebidas",
      "Productos orgánicos", "Repostería",
    ],
  },
  {
    name: "Mascotas", slug: "mascotas", position: 11,
    children: [
      "Perros", "Gatos", "Aves", "Peces y acuarios", "Pequeñas mascotas",
    ],
  },
  {
    name: "Salud y bienestar", slug: "salud-y-bienestar", position: 12,
    children: [
      "Cuidado de la salud", "Suplementos y vitaminas", "Equipos médicos",
      "Movilidad y ortopedia",
    ],
  },
  {
    name: "Arte y artesanías", slug: "arte-y-artesanias", position: 13,
    children: [
      "Artesanía colombiana", "Materiales de arte", "Manualidades",
      "Instrumentos musicales", "Coleccionables",
    ],
  },
  {
    name: "Libros y papelería", slug: "libros-y-papeleria", position: 14,
    children: [
      "Libros", "Útiles escolares", "Oficina", "Revistas y cómics",
    ],
  },
];

module.exports = { categories };
