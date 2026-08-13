// The cities a shop can be based in, with the department as the second line.
// Kept as a list rather than free text so that "Bogota" and "Bogotá" cannot end
// up as two different filters, and so the frontend never hardcodes its own copy.
const CITIES = [
  { value: "bogota", label: "Bogotá", subtitle: "Cundinamarca" },
  { value: "medellin", label: "Medellín", subtitle: "Antioquia" },
  { value: "cali", label: "Cali", subtitle: "Valle del Cauca" },
  { value: "barranquilla", label: "Barranquilla", subtitle: "Atlántico" },
  { value: "cartagena", label: "Cartagena", subtitle: "Bolívar" },
  { value: "bucaramanga", label: "Bucaramanga", subtitle: "Santander" },
  { value: "pereira", label: "Pereira", subtitle: "Risaralda" },
  { value: "manizales", label: "Manizales", subtitle: "Caldas" },
  { value: "santa-marta", label: "Santa Marta", subtitle: "Magdalena" },
  { value: "cucuta", label: "Cúcuta", subtitle: "Norte de Santander" },
  { value: "ibague", label: "Ibagué", subtitle: "Tolima" },
  { value: "villavicencio", label: "Villavicencio", subtitle: "Meta" },
  { value: "pasto", label: "Pasto", subtitle: "Nariño" },
  { value: "monteria", label: "Montería", subtitle: "Córdoba" },
  { value: "armenia", label: "Armenia", subtitle: "Quindío" },
];

const CITY_VALUES = CITIES.map(c => c.value);

module.exports = { CITIES, CITY_VALUES };
