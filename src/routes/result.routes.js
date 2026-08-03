const express = require("express");
const protect = require("../middlewares/auth");
const tenantScope = require("../middlewares/tenantScope");
const requireRole = require("../middlewares/rbac");
const {
  getReportCard,
  downloadReportCardPdf,
  getMyReportCard,
  downloadMyReportCardPdf,
  saveReportCardRemarks,
} = require("../controllers/result.controller");

const router = express.Router();

router.use(protect, tenantScope);

// IMPORTANT: these must come before /:studentId routes below - otherwise
// Express would match "mine" as the :studentId parameter itself. Same
// ordering trap as GET /classes/mine.
router.get("/report-card/mine/view", requireRole("student"), getMyReportCard);
router.get("/report-card/mine/pdf", requireRole("student"), downloadMyReportCardPdf);

// Every role is allowed to HIT this route - but assertReportCardAccess
// inside the controller enforces WHOSE report card they can actually see
// (their own for students, their children's for parents, their own
// classes' for teachers, anyone's for admin).
router.get(
  "/report-card/:studentId",
  requireRole("admin", "teacher", "student", "parent"),
  getReportCard
);
router.get(
  "/report-card/:studentId/pdf",
  requireRole("admin", "teacher", "student", "parent"),
  downloadReportCardPdf
);
router.patch(
  "/report-card/:studentId/remarks",
  requireRole("admin", "teacher"),
  saveReportCardRemarks
);

module.exports = router;
