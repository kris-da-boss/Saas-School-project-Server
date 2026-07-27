const jwt = require("jsonwebtoken");
const asyncHandler = require("express-async-handler");

// Verifies the JWT access token sent as: Authorization: Bearer <token>
// On success, attaches { userId, role, schoolId } to req.user
const protect = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    res.status(401);
    throw new Error("Not authenticated - no token provided");
  }

  const token = header.split(" ")[1];

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
  } catch (err) {
    res.status(401);
    throw new Error("Not authenticated - invalid or expired token");
  }

  req.user = decoded;
  next();
});

module.exports = protect;
