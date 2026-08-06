const express = require("express");
const protect = require("../middlewares/auth");
const tenantScope = require("../middlewares/tenantScope");
const requireRole = require("../middlewares/rbac");
const {
  getAdminOverview,
  getTeacherOverview,
  getStudentOverview,
  getParentOverview,
} = require("../controllers/dashboard.controller");

const router = express.Router();

router.use(protect, tenantScope);

router.get("/admin", requireRole("admin"), getAdminOverview);
router.get("/teacher", requireRole("teacher"), getTeacherOverview);
router.get("/student", requireRole("student"), getStudentOverview);
router.get("/parent", requireRole("parent"), getParentOverview);

module.exports = router;
