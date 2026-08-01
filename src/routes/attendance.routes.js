const express = require("express");
const protect = require("../middlewares/auth");
const tenantScope = require("../middlewares/tenantScope");
const requireRole = require("../middlewares/rbac");
const {
  getAttendanceForDate,
  markAttendance,
  getAttendanceDates,
} = require("../controllers/attendance.controller");

const router = express.Router();

router.use(protect, tenantScope);

router.get("/class/:classId", requireRole("admin", "teacher"), getAttendanceForDate);
router.post("/class/:classId", requireRole("admin", "teacher"), markAttendance);
router.get("/class/:classId/dates", requireRole("admin", "teacher"), getAttendanceDates);

module.exports = router;
