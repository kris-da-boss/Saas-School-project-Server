const express = require("express");
const protect = require("../middlewares/auth");
const tenantScope = require("../middlewares/tenantScope");
const requireRole = require("../middlewares/rbac");
const upload = require("../middlewares/upload");
const { getMyAssignments, submitAssignment } = require("../controllers/submission.controller");

const router = express.Router();

router.use(protect, tenantScope);

router.get("/mine", requireRole("student"), getMyAssignments);
router.post("/:assignmentId", requireRole("student"), upload.single("photo"), submitAssignment);

module.exports = router;
