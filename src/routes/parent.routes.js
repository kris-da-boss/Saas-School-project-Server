const express = require("express");
const protect = require("../middlewares/auth");
const tenantScope = require("../middlewares/tenantScope");
const requireRole = require("../middlewares/rbac");
const upload = require("../middlewares/upload");
const {
  createParent,
  getParents,
  getParentById,
  updateParent,
  deactivateParent,
} = require("../controllers/parent.controller");

const router = express.Router();

router.use(protect, tenantScope);

router.get("/", requireRole("admin"), getParents);
router.get("/:id", requireRole("admin"), getParentById);
router.post("/", requireRole("admin"), upload.single("photo"), createParent);
router.patch("/:id", requireRole("admin"), upload.single("photo"), updateParent);
router.delete("/:id", requireRole("admin"), deactivateParent);

module.exports = router;
