// A storefront is reached by its slug, so it has to be unique across the whole
// marketplace and stable once published. Generated once at creation and stored,
// not derived at read time: renaming a shop must not silently break every link
// anyone saved.
const RESERVED = [
  "admin", "api", "auth", "user", "login", "register", "cart", "checkout",
  "orders", "shops", "search", "about", "help", "support", "settings",
];

const slugify = (text) =>
  String(text || "")
    .normalize("NFD")                     // splits accented letters
    .replace(/[̀-ͯ]/g, "")      // drops the accents themselves
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

// Takes a taken-check so the caller decides what "taken" means — the database
// here, something else in a test.
const uniqueSlug = async (text, isTaken) => {
  const base = slugify(text) || "shop";

  let candidate = RESERVED.includes(base) ? `${base}-shop` : base;
  let n = 1;

  while (await isTaken(candidate)) {
    n += 1;
    candidate = `${base}-${n}`;
  }

  return candidate;
};

module.exports = { slugify, uniqueSlug, RESERVED };
