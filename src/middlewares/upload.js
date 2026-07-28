const multer = require("multer");

// Memory storage: the file lives briefly as a buffer in RAM, never touches
// disk. We stream that buffer straight to Cloudinary in the controller.
const storage = multer.memoryStorage();

function fileFilter(req, file, cb) {
  const allowed = ["image/jpeg", "image/png", "image/webp"];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Only JPEG, PNG, or WEBP images are allowed"), false);
  }
}

const upload = multer({
  storage,
  limits: { fileSize: 3 * 1024 * 1024 }, // 3MB cap
  fileFilter,
});

module.exports = upload;
