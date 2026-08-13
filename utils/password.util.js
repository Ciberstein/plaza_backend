// What counts as a strong enough password.
//
// Length does more work than character classes. A twelve-character passphrase
// resists guessing far better than "P@ssw0rd", which satisfies every
// upper/lower/digit/symbol rule ever written and is on the first page of every
// cracking list. So the floor is length, and the rest of the checks reject the
// specific shapes people reach for when a length rule is imposed on them.
const MIN_LENGTH = 10;
const MAX_LENGTH = 128;

// The passwords a credential-stuffing run tries first. Not a complete list —
// it cannot be — but it catches what people type when told "10 characters".
const COMMON = new Set([
  "password", "password1", "password12", "password123", "passw0rd",
  "12345678", "123456789", "1234567890", "0123456789", "1234512345",
  "qwertyuiop", "qwerty1234", "asdfghjkl", "1qaz2wsx", "zaq12wsx",
  "iloveyou", "letmein123", "welcome123", "admin12345", "administrator",
  "contraseña", "contrasena", "micontraseña", "colombia123", "bogota123",
  "abcdefghij", "aaaaaaaaaa", "1111111111",
]);

const normalise = (value) => String(value || "").toLowerCase().trim();

// Three or more of the same character, or a run like "abcd"/"4321". Both are
// what a length requirement produces when someone pads a short password.
const hasRun = (value) => {
  const s = normalise(value);

  for (let i = 0; i + 3 < s.length + 1; i += 1) {
    const [a, b, c, d] = [s.charCodeAt(i), s.charCodeAt(i + 1), s.charCodeAt(i + 2), s.charCodeAt(i + 3)];
    if (Number.isNaN(d)) break;
    if (a === b && b === c && c === d) return true;                 // aaaa
    if (b - a === 1 && c - b === 1 && d - c === 1) return true;     // abcd
    if (a - b === 1 && b - c === 1 && c - d === 1) return true;     // dcba
  }

  return false;
};

/**
 * Returns the first problem found, or null when the password is acceptable.
 *
 * One message at a time and phrased as an instruction: a list of every rule
 * broken is a wall of text, and "must contain at least one of ..." tells the
 * person about the checker rather than about what to type.
 */
const check = (password, { email = "", username = "" } = {}) => {
  const value = String(password || "");

  if (value.length < MIN_LENGTH) {
    return `Use at least ${MIN_LENGTH} characters. A short phrase you will remember beats a short password.`;
  }

  if (value.length > MAX_LENGTH) {
    return `Keep it under ${MAX_LENGTH} characters.`;
  }

  if (value.trim() !== value) {
    return "Remove the spaces at the start or end — they are easy to lose.";
  }

  const lower = normalise(value);

  if (COMMON.has(lower)) {
    return "That is one of the most guessed passwords there is. Pick something else.";
  }

  // Only one repeated character in the whole thing.
  if (new Set(lower).size < 5) {
    return "Use a wider mix of characters.";
  }

  if (hasRun(value)) {
    return "Avoid runs like 1234 or aaaa — they are the first thing a guesser tries.";
  }

  const localPart = normalise(email).split("@")[0];

  if (localPart && localPart.length > 2 && lower.includes(localPart)) {
    return "Do not build the password out of your email address.";
  }

  if (username && normalise(username).length > 2 && lower.includes(normalise(username))) {
    return "Do not build the password out of your username.";
  }

  return null;
};

module.exports = { check, MIN_LENGTH, MAX_LENGTH };
