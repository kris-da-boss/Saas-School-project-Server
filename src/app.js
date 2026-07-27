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

// TEMPORARY - remove once Admin's "create teacher/student/parent" feature exists (Phase 2)
app.use("/api/v1/dev", require("./routes/dev.routes"));

// TEMPORARY - proves the protect + tenantScope + rbac chain works end-to-end.
// Delete once a real protected feature route exists.
const protect = require("./middlewares/auth");
const tenantScope = require("./middlewares/tenantScope");
const requireRole = require("./middlewares/rbac");
app.get("/api/v1/dev/whoami", protect, tenantScope, requireRole("admin", "superadmin"), (req, res) => {
  res.status(200).json({ success: true, data: { user: req.user, schoolId: req.schoolId } });
});

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
