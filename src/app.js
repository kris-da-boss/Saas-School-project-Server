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
// app.use("/api/v1/auth", require("./routes/auth.routes"));

// TEMPORARY - remove once real /auth routes exist (next increment)
app.use("/api/v1/dev", require("./routes/dev.routes"));

// TEMPORARY: dev-only routes for testing models before real auth exists.
// Remove this block once /auth/register and /auth/login are built.
if (process.env.NODE_ENV !== "production") {
  app.use("/api/v1/dev", require("./routes/dev.routes"));
}

// --- 404 handler for unmatched routes ---
app.use((req, res) => {
  res.status(404).json({ success: false, message: "Route not found" });
});

// --- Global error handler (must be last) ---
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || "Server error",
  });
});

module.exports = app;
