const express = require("express");
const { createSchool, getSchoolBySubdomain } = require("../controllers/school.controller");
const protect = require("../middlewares/auth");
const tenantScope = require("../middlewares/tenantScope");
const requireRole = require("../middlewares/rbac");

const router = express.Router();

// Public - frontend calls this before showing the login screen
router.get("/by-subdomain/:subdomain", getSchoolBySubdomain);

// Superadmin only - onboards a new school + its first admin
router.post("/", protect, tenantScope, requireRole("superadmin"), createSchool);

module.exports = router;
