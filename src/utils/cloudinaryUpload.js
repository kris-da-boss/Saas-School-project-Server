const cloudinary = require("../config/cloudinary");

// Cloudinary's SDK expects either a file path or a readable stream — since
// Multer gives us a buffer (memory storage), we open an upload_stream and
// write the buffer into it, wrapped in a Promise so controllers can just
// `await` this like any other async call.
function uploadBufferToCloudinary(buffer, folder) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: "image" },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );
    stream.end(buffer);
  });
}

module.exports = uploadBufferToCloudinary;
