const express = require("express");
const { login, refresh, logout, bootstrapSuperAdmin, getMe } = require("../controllers/auth.controller");
const protect = require("../middlewares/auth");

const router = express.Router();

router.post("/login", login);
router.post("/refresh", refresh);
router.post("/logout", logout);
router.post("/bootstrap-superadmin", bootstrapSuperAdmin);
router.get("/me", protect, getMe);

module.exports = router;
