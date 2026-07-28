const express = require("express");
const { login, refresh, logout, bootstrapSuperAdmin } = require("../controllers/auth.controller");

const router = express.Router();

router.post("/login", login);
router.post("/refresh", refresh);
router.post("/logout", logout);
router.post("/bootstrap-superadmin", bootstrapSuperAdmin);

module.exports = router;
