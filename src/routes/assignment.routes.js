const express = require("express");
const protect = require("../middlewares/auth");
const tenantScope = require("../middlewares/tenantScope");
const requireRole = require("../middlewares/rbac");
const {
  createAssignment,
  getAssignments,
  getAssignmentById,
  updateAssignment,
  deactivateAssignment,
  getAssignmentRoster,
  gradeSubmission,
} = require("../controllers/assignment.controller");

const router = express.Router();

router.use(protect, tenantScope);

router.get("/", requireRole("admin", "teacher"), getAssignments);
router.get("/:id", requireRole("admin", "teacher", "student"), getAssignmentById);
router.post("/", requireRole("admin", "teacher"), createAssignment);
router.patch("/:id", requireRole("admin", "teacher"), updateAssignment);
router.delete("/:id", requireRole("admin", "teacher"), deactivateAssignment);
router.get("/:id/roster", requireRole("admin", "teacher"), getAssignmentRoster);
router.patch("/:id/grade", requireRole("admin", "teacher"), gradeSubmission);

module.exports = router;
