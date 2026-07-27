const express = require("express");
const { login, refresh, logout } = require("../controllers/auth.controller");

const router = express.Router();

router.post("/login", login);
router.post("/refresh", refresh);
router.post("/logout", logout);

module.exports = router;
