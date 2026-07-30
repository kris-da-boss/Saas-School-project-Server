const express = require("express");
const protect = require("../middlewares/auth");
const tenantScope = require("../middlewares/tenantScope");
const requireRole = require("../middlewares/rbac");
const {
  createSubject,
  getSubjects,
  getSubjectById,
  updateSubject,
  deactivateSubject,
} = require("../controllers/subject.controller");

const router = express.Router();

router.use(protect, tenantScope);

router.get("/", requireRole("admin", "teacher"), getSubjects);
router.get("/:id", requireRole("admin", "teacher"), getSubjectById);
router.post("/", requireRole("admin"), createSubject);
router.patch("/:id", requireRole("admin"), updateSubject);
router.delete("/:id", requireRole("admin"), deactivateSubject);

module.exports = router;
