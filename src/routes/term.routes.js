const express = require("express");
const protect = require("../middlewares/auth");
const tenantScope = require("../middlewares/tenantScope");
const requireRole = require("../middlewares/rbac");
const { upsertTerm, getTerm } = require("../controllers/term.controller");

const router = express.Router();

router.use(protect, tenantScope);

router.get("/", requireRole("admin", "teacher"), getTerm);
router.put("/", requireRole("admin"), upsertTerm);

module.exports = router;
