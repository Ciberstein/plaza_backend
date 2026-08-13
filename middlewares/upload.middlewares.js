const multer = require("multer");
const AppError = require("../utils/appError.util");

const MAX_BYTES = 5 * 1024 * 1024;

// Kept in memory, never written to disk: the buffer goes straight to Cloudinary
// and a request that dies leaves nothing behind.
const storage = multer.memoryStorage();

// The mimetype is checked here to reject the obvious, but it is client-supplied
// and trivially forged. Cloudinary re-encodes what it receives, which is what
// actually stops a disguised file from being served back as one.
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/avif"];

const uploader = multer({
  storage,
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED.includes(file.mimetype)) {
      return cb(new AppError("Upload a JPG, PNG, WEBP or AVIF image", 415));
    }
    cb(null, true);
  },
});

// multer reports its own failures by throwing an error the global handler does
// not recognise, so "file too large" reached the client as a 500. Wrapped to
// turn them into the message the person actually needs.
const single = (field) => (req, res, next) =>
  uploader.single(field)(req, res, (err) => {
    if (!err) return next();
    if (err.code === "LIMIT_FILE_SIZE") {
      return next(new AppError("That image is over 5 MB. Use a smaller one.", 413));
    }
    if (err.code === "LIMIT_FILE_COUNT" || err.code === "LIMIT_UNEXPECTED_FILE") {
      return next(new AppError("Send one image at a time", 400));
    }
    return next(err);
  });

module.exports = { single, MAX_BYTES, ALLOWED };
