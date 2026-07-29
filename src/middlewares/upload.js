const multer = require("multer");

// Memory storage: the file lives briefly as a buffer in RAM, never touches
// disk. We stream that buffer straight to Cloudinary in the controller.
const storage = multer.memoryStorage();

// IMPORTANT: we do NOT filter by file.mimetype here anymore. That value is
// just a label the uploading client (Postman, a browser, a phone OS) sends
// alongside the file — it's self-reported and often wrong or generic
// ("application/octet-stream"). Trusting it either rejects real images
// (as you just saw) or, worse, could let someone rename a malicious file
// and claim it's a JPEG. Real validation happens on the actual file bytes
// in utils/detectImageType.js, right before we upload to Cloudinary.
const upload = multer({
  storage,
  limits: { fileSize: 3 * 1024 * 1024 }, // 3MB cap
});

module.exports = upload;
