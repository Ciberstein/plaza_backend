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

// The root everything is filed under.
//
// An environment variable rather than a constant because one Cloudinary account
// usually serves every environment, and without a way to separate them a photo
// uploaded while testing lands beside a real seller's, indistinguishable and
// impossible to clear out without reading each one.
const ROOT = process.env.CLOUDINARY_FOLDER?.trim().replace(/^\/+|\/+$/g, "") || "plaza";

/**
 * Where each kind of thing lives. One folder per record rather than one folder
 * per kind, so that removing the record can take the whole folder with it and
 * leave nothing behind to find later.
 */
const folders = {
  account: (id) => `${ROOT}/accounts/${id}`,
  shop: (id) => `${ROOT}/shops/${id}`,
  product: (id) => `${ROOT}/products/${id}`,
};

/**
 * Everything under a folder, and then the folder.
 *
 * Two calls because Cloudinary refuses to delete a folder that still has
 * anything in it, and because deleting the rows in our own database does not
 * touch their storage at all. Without this a deleted listing leaves its
 * photographs sitting in an account nobody is looking at, still served to
 * anyone who kept the URL.
 */
const removeFolder = async (folder) => {
  await cloudinary.api.delete_resources_by_prefix(`${folder}/`);
  await cloudinary.api.delete_folder(folder);
};

// Whether uploads can work at all. Checked at the route rather than discovered
// as a cryptic 500 when someone tries to change their photo.
const configured = () =>
  Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
  );

module.exports = { upload, remove, removeFolder, folders, configured };
