// The trades of the marketplace.
//
// The other aisle. These are not things on a shelf, they are people's time,
// and the tree is organised the way somebody looking for help would ask for it
// — by the job they need doing, not by the profession that does it. Somebody
// with a leaking pipe searches "plomería", not "obras hidrosanitarias".
//
// Kept shallow for the same reason the goods tree is: a shopper who has to
// descend four levels gives up, and a provider who cannot find the right leaf
// files themselves in the wrong one.
//
// `position` ranks the aisles by how often they are asked for in a Colombian
// city, which is not alphabetical and not how a directory would order them.
const services = [
  {
    name: "Construcción y reformas", slug: "construccion-y-reformas", position: 1,
    children: [
      "Plomería", "Electricidad", "Pintura", "Albañilería", "Carpintería",
      "Cerrajería", "Impermeabilización", "Drywall y acabados",
    ],
  },
  {
    name: "Hogar y limpieza", slug: "hogar-y-limpieza", position: 2,
    children: [
      "Aseo por horas", "Limpieza profunda", "Lavado de muebles", "Jardinería",
      "Control de plagas", "Lavandería y planchado",
    ],
  },
  {
    name: "Cuidado de personas", slug: "cuidado-de-personas", position: 3,
    children: [
      "Niñeras", "Cuidado de adultos mayores", "Acompañamiento en casa",
      "Enfermería a domicilio", "Cuidado de personas con discapacidad",
    ],
  },
  {
    name: "Reparaciones y técnicos", slug: "reparaciones-y-tecnicos", position: 4,
    children: [
      "Electrodomésticos", "Aire acondicionado y neveras", "Computadores",
      "Celulares", "Televisores y audio", "Bicicletas",
    ],
  },
  {
    name: "Clases y tutorías", slug: "clases-y-tutorias", position: 5,
    children: [
      "Refuerzo escolar", "Idiomas", "Música", "Matemáticas",
      "Preparación de exámenes", "Informática",
    ],
  },
  {
    name: "Belleza y bienestar", slug: "belleza-y-bienestar", position: 6,
    children: [
      "Peluquería a domicilio", "Manicura y pedicura", "Maquillaje",
      "Masajes", "Entrenamiento personal", "Nutrición",
    ],
  },
  {
    name: "Eventos", slug: "eventos", position: 7,
    children: [
      "Fotografía", "Video", "Catering", "Música en vivo",
      "Decoración", "Meseros y logística", "Animación infantil",
    ],
  },
  {
    name: "Transporte y mudanzas", slug: "transporte-y-mudanzas", position: 8,
    children: [
      "Mudanzas", "Acarreos", "Mensajería", "Conductor",
    ],
  },
  {
    name: "Mascotas", slug: "servicios-mascotas", position: 9,
    children: [
      "Paseo de perros", "Guardería", "Peluquería canina",
      "Adiestramiento", "Veterinaria a domicilio",
    ],
  },
  {
    name: "Servicios profesionales", slug: "servicios-profesionales", position: 10,
    children: [
      "Contabilidad", "Asesoría legal", "Diseño gráfico", "Desarrollo web",
      "Traducción", "Marketing digital", "Arquitectura",
    ],
  },
  {
    name: "Confección y arreglos", slug: "confeccion-y-arreglos", position: 11,
    children: [
      "Arreglos de ropa", "Confección a medida", "Tapicería", "Bordado y estampado",
    ],
  },
  {
    name: "Vehículos", slug: "servicios-vehiculos", position: 12,
    children: [
      "Mecánica a domicilio", "Latonería y pintura", "Lavado de vehículos",
      "Instalación de accesorios",
    ],
  },
];

module.exports = { services };
