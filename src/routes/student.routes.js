const express = require("express");
const protect = require("../middlewares/auth");
const tenantScope = require("../middlewares/tenantScope");
const requireRole = require("../middlewares/rbac");
const upload = require("../middlewares/upload");
const {
  createStudent,
  getStudents,
  getStudentById,
  updateStudent,
  deactivateStudent,
} = require("../controllers/student.controller");

const router = express.Router();

// Every route below requires a valid login + a resolved schoolId
router.use(protect, tenantScope);

router.get("/", requireRole("admin", "teacher"), getStudents);
router.get("/:id", requireRole("admin", "teacher"), getStudentById);
router.post("/", requireRole("admin"), upload.single("photo"), createStudent);
router.patch("/:id", requireRole("admin"), upload.single("photo"), updateStudent);
router.delete("/:id", requireRole("admin"), deactivateStudent);

module.exports = router;
