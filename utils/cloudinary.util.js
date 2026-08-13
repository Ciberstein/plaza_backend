const cloudinary = require("cloudinary").v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Uploads from a buffer rather than a path: multer keeps the file in memory, so
// nothing ever touches the server's disk and there is no temporary file to
// clean up if the request dies halfway.
const upload = (buffer, options = {}) =>
  new Promise((resolve, reject) => {
    cloudinary.uploader
      .upload_stream(options, (error, result) => {
        if (error) return reject(error);
        resolve(result);
      })
      .end(buffer);
  });

const remove = (publicId) => cloudinary.uploader.destroy(publicId);

// Whether uploads can work at all. Checked at the route rather than discovered
// as a cryptic 500 when someone tries to change their photo.
const configured = () =>
  Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
  );

module.exports = { upload, remove, configured };
