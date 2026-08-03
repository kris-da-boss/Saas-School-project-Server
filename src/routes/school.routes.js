const express = require("express");
const { createSchool, getSchoolBySubdomain, getMySchool } = require("../controllers/school.controller");
const protect = require("../middlewares/auth");
const tenantScope = require("../middlewares/tenantScope");
const requireRole = require("../middlewares/rbac");

const router = express.Router();

// Public - frontend calls this before showing the login screen
router.get("/by-subdomain/:subdomain", getSchoolBySubdomain);

// Any logged-in role - used for report card headers, branding, etc.
router.get("/mine", protect, tenantScope, getMySchool);

// Superadmin only - onboards a new school + its first admin
router.post("/", protect, tenantScope, requireRole("superadmin"), createSchool);

module.exports = router;
