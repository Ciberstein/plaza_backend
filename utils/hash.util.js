const bcrypt = require("bcryptjs");

// bcrypt rather than a plain SHA: a password hash has to be slow and salted.
// SHA-512 is fast by design, which is the property an attacker with a GPU
// wants, and unsalted it means two people with the same password share a hash.
const ROUNDS = 12;

const hash = async (plain) => bcrypt.hash(plain, ROUNDS);

const compare = async (plain, hashed) => bcrypt.compare(plain, hashed);

module.exports = { hash, compare };
