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
  getMyClasses,
} = require("../controllers/class.controller");

const router = express.Router();

router.use(protect, tenantScope);

// IMPORTANT: /mine must be registered before /:id - otherwise Express
// matches "mine" as the :id parameter instead of this specific route.
router.get("/mine", requireRole("teacher"), getMyClasses);
router.get("/", requireRole("admin", "teacher"), getClasses);
router.get("/:id", requireRole("admin", "teacher"), getClassById);
router.post("/", requireRole("admin"), createClass);
router.patch("/:id", requireRole("admin"), updateClass);
router.delete("/:id", requireRole("admin"), deactivateClass);

module.exports = router;
