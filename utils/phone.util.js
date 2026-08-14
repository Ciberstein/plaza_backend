const Geo = require("../models/geo.models");

// E.164 allows fifteen digits including the country code, so a national number
// cannot sensibly be longer than fourteen. Six at the bottom because short
// codes exist and refusing them is not this validator's job.
const MIN = 6;
const MAX = 14;

/**
 * Only the digits.
 *
 * People type numbers with spaces, dashes, dots and brackets, and all of those
 * are presentation. Stored bare so that two spellings of one number are one
 * number, and formatted wherever it is shown.
 */
exports.digits = (value) => String(value ?? "").replace(/\D/g, "");

exports.check = (value) => {
  const digits = exports.digits(value);

  if (!digits) return "A phone number is required";
  if (digits.length < MIN) return "That number is too short";
  if (digits.length > MAX) return "That number is too long";

  return null;
};

/**
 * The country the number belongs to, which is where the dialling code comes
 * from. Checked against the same rows the form was built from, so a country
 * the picker could not have offered cannot arrive here.
 */
exports.country = async (countryId) => {
  if (!countryId) return null;

  return Geo.Country.findOne({
    where: { id: countryId, active: true },
    attributes: ["id", "name", "code", "dialCode"],
  });
};

exports.MIN = MIN;
exports.MAX = MAX;
