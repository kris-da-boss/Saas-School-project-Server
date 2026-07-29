const multer = require("multer");

// Memory storage: the file lives briefly as a buffer in RAM, never touches
// disk. We stream that buffer straight to Cloudinary in the controller.
const storage = multer.memoryStorage();

function fileFilter(req, file, cb) {
  // Accept any image/* mimetype rather than a narrow allowlist. Real phone
  // cameras/apps produce inconsistent mimetypes (image/heic on iPhones,
  // occasionally non-standard "image/jpg" instead of "image/jpeg", etc.) —
  // a strict allowlist rejects legitimate photos too often in practice.
  if (file.mimetype.startsWith("image/")) {
    cb(null, true);
  } else {
    cb(new Error(`Unsupported file type: ${file.mimetype}. Please upload an image.`), false);
  }
}

const upload = multer({
  storage,
  limits: { fileSize: 3 * 1024 * 1024 }, // 3MB cap
  fileFilter,
});

module.exports = upload;
