const express = require("express");
const protect = require("../middlewares/auth");
const tenantScope = require("../middlewares/tenantScope");
const requireRole = require("../middlewares/rbac");
const {
  createClass,
  getClasses,
  getClassById,
  updateClass,
  deactivateClass,
} = require("../controllers/class.controller");

const router = express.Router();

router.use(protect, tenantScope);

router.get("/", requireRole("admin", "teacher"), getClasses);
router.get("/:id", requireRole("admin", "teacher"), getClassById);
router.post("/", requireRole("admin"), createClass);
router.patch("/:id", requireRole("admin"), updateClass);
router.delete("/:id", requireRole("admin"), deactivateClass);

module.exports = router;
