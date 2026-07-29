const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const cookieParser = require("cookie-parser");

const app = express();

// --- Core middleware ---
app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

if (process.env.NODE_ENV !== "production") {
  app.use(morgan("dev"));
}

// --- Health check route (used to confirm the API is alive after deploy) ---
app.get("/api/v1/health", (req, res) => {
  res.status(200).json({ success: true, message: "API is running" });
});

// --- Feature routes will be mounted here as we build them ---
app.use("/api/v1/auth", require("./routes/auth.routes"));
app.use("/api/v1/schools", require("./routes/school.routes"));
app.use("/api/v1/students", require("./routes/student.routes"));

// --- 404 handler for unmatched routes ---
app.use((req, res) => {
  res.status(404).json({ success: false, message: "Route not found" });
});

// --- Multer-specific errors (e.g. file too large) get a proper 400.
// Image-type rejection now happens in controllers via detectImageType.js
// and already sets res.status(400) itself, so it's handled by the normal
// error handler below — no special-casing needed for it here. ---
const multer = require("multer");
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ success: false, message: err.message });
  }
  next(err);
});

// --- Global error handler (must be last) ---
app.use((err, req, res, next) => {
  console.error(err.stack);
  // Important: if a controller already called res.status(401) (etc.) before
  // throwing, res.statusCode holds that value. Express's default is 200, so
  // we only fall back to 500 when nothing more specific was set.
  const statusCode = res.statusCode && res.statusCode !== 200 ? res.statusCode : 500;
  res.status(statusCode).json({
    success: false,
    message: err.message || "Server error",
  });
});

module.exports = app;
