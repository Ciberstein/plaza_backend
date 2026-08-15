// The third aisle: what is not sold by the unit and not measured in hours.
//
// Organised by what the place is for rather than by how it is built, because
// that is the first thing anybody knows about their own search. Somebody
// moving cities knows they need somewhere to live long before they know
// whether it will be a flat or a house; somebody opening a shop knows they
// need a local. The tree splits on that first, and on the building second.
//
// Shallower than the other two, and deliberately. Property has fewer real
// types than goods have — a marketplace can list eleven thousand kinds of
// object and about a dozen kinds of building — and padding it out with
// distinctions nobody searches by ("dúplex", "penthouse") would produce leaves
// with one listing in them and an owner unsure which of three is theirs. Those
// belong in the title, where they help, rather than in the tree, where they
// split the results.
//
// `position` ranks by how much of a Colombian portal's traffic each aisle
// actually carries: housing dwarfs everything else, commercial follows, and
// land is a slow, specialist market that nonetheless has to be listable.
const properties = [
  {
    name: "Vivienda", slug: "vivienda", position: 1,
    children: [
      "Apartamento", "Casa", "Apartaestudio", "Casa campestre", "Finca",
      "Cabaña",
    ],
  },
  {
    name: "Comercial", slug: "comercial", position: 2,
    children: [
      "Local", "Oficina", "Consultorio", "Bodega", "Edificio",
    ],
  },
  {
    name: "Terrenos", slug: "terrenos", position: 3,
    children: [
      "Lote urbano", "Lote rural", "Lote comercial",
    ],
  },
  {
    // Small things that are bought and rented on their own, and that have
    // nowhere sensible to sit above. A parking space in a city centre is a
    // real market and is nobody's idea of "vivienda".
    name: "Otros inmuebles", slug: "otros-inmuebles", position: 4,
    children: [
      "Parqueadero", "Depósito",
    ],
  },
];

module.exports = { properties };
