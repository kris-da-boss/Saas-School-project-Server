const jwt = require("jsonwebtoken");

// Short-lived — used on every request, kept small on purpose
function generateAccessToken(payload) {
  return jwt.sign(payload, process.env.JWT_ACCESS_SECRET, { expiresIn: "15m" });
}

// Long-lived — only used to silently mint new access tokens
function generateRefreshToken(payload) {
  return jwt.sign(payload, process.env.JWT_REFRESH_SECRET, { expiresIn: "7d" });
}

module.exports = { generateAccessToken, generateRefreshToken };
