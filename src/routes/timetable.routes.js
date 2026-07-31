const express = require("express");
const protect = require("../middlewares/auth");
const tenantScope = require("../middlewares/tenantScope");
const requireRole = require("../middlewares/rbac");
const {
  getTimetableForClass,
  addEntry,
  updateEntry,
  deleteEntry,
} = require("../controllers/timetable.controller");

const router = express.Router();

router.use(protect, tenantScope);

router.get("/class/:classId", requireRole("admin", "teacher"), getTimetableForClass);
router.post("/class/:classId/entries", requireRole("admin"), addEntry);
router.patch("/class/:classId/entries/:entryId", requireRole("admin"), updateEntry);
router.delete("/class/:classId/entries/:entryId", requireRole("admin"), deleteEntry);

module.exports = router;
