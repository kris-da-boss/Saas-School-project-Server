const express = require("express");
const protect = require("../middlewares/auth");
const tenantScope = require("../middlewares/tenantScope");
const requireRole = require("../middlewares/rbac");
const upload = require("../middlewares/upload");
const {
  createTeacher,
  getTeachers,
  getTeacherById,
  updateTeacher,
  deactivateTeacher,
} = require("../controllers/teacher.controller");

const router = express.Router();

router.use(protect, tenantScope);

router.get("/", requireRole("admin"), getTeachers);
router.get("/:id", requireRole("admin"), getTeacherById);
router.post("/", requireRole("admin"), upload.single("photo"), createTeacher);
router.patch("/:id", requireRole("admin"), upload.single("photo"), updateTeacher);
router.delete("/:id", requireRole("admin"), deactivateTeacher);

module.exports = router;
