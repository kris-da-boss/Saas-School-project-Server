const express = require("express");
const protect = require("../middlewares/auth");
const tenantScope = require("../middlewares/tenantScope");
const requireRole = require("../middlewares/rbac");
const {
  createExam,
  bulkCreateExams,
  getExams,
  getExamById,
  deactivateExam,
  getTermDates,
} = require("../controllers/exam.controller");
const { getExamRoster, submitResults } = require("../controllers/result.controller");

const router = express.Router();

router.use(protect, tenantScope);

// IMPORTANT: /term must come before /:id - same Express ordering trap as
// /classes/mine and /parents/mine.
router.get("/term", requireRole("admin", "teacher"), getTermDates);
router.get("/", requireRole("admin", "teacher"), getExams);
router.get("/:id", requireRole("admin", "teacher"), getExamById);
router.post("/", requireRole("admin", "teacher"), createExam);
router.post("/bulk", requireRole("admin", "teacher"), bulkCreateExams);
router.delete("/:id", requireRole("admin", "teacher"), deactivateExam);
router.get("/:examId/roster", requireRole("admin", "teacher"), getExamRoster);
router.post("/:examId/results", requireRole("admin", "teacher"), submitResults);

module.exports = router;
