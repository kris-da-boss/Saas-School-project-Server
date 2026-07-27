const asyncHandler = require("express-async-handler");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const School = require("../models/School");
const { generateAccessToken, generateRefreshToken } = require("../utils/generateToken");

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "none", // frontend (Vercel) and backend (Render) are different domains
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

// POST /api/v1/auth/login
// Body: { schoolCode, email, password }  -- schoolCode omitted for superadmin login
const login = asyncHandler(async (req, res) => {
  const { schoolCode, email, password } = req.body;

  if (!email || !password) {
    res.status(400);
    throw new Error("Email and password are required");
  }

  // Step 1: resolve the tenant (skip entirely for superadmin)
  let school = null;
  if (schoolCode) {
    school = await School.findOne({ schoolCode: schoolCode.toUpperCase() });
    if (!school) {
      res.status(404);
      throw new Error("School not found");
    }
    if (school.billingStatus !== "active") {
      res.status(403);
      throw new Error("This school's account is currently suspended");
    }
  }

  // Step 2: find the user WITHIN that tenant (or schoolId: null for superadmin)
  const lookup = {
    email: email.toLowerCase(),
    schoolId: school ? school._id : null,
  };
  const user = await User.findOne(lookup).select("+password");

  if (!user) {
    res.status(401);
    throw new Error("Invalid credentials");
  }
  if (user.status === "suspended") {
    res.status(403);
    throw new Error("Your account has been suspended");
  }

  // Step 3: verify password
  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    res.status(401);
    throw new Error("Invalid credentials");
  }

  user.lastLogin = new Date();
  await user.save();

  // Step 4: issue tokens
  const payload = { userId: user._id, role: user.role, schoolId: user.schoolId };
  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);

  res.cookie("refreshToken", refreshToken, cookieOptions);

  res.status(200).json({
    success: true,
    data: {
      accessToken,
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        schoolId: user.schoolId,
      },
    },
  });
});

// POST /api/v1/auth/refresh
// Reads the httpOnly refresh cookie, issues a fresh access token
const refresh = asyncHandler(async (req, res) => {
  const token = req.cookies.refreshToken;
  if (!token) {
    res.status(401);
    throw new Error("No refresh token provided");
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
  } catch (err) {
    res.status(401);
    throw new Error("Invalid or expired refresh token");
  }

  const user = await User.findById(decoded.userId);
  if (!user || user.status === "suspended") {
    res.status(401);
    throw new Error("User no longer valid");
  }

  const payload = { userId: user._id, role: user.role, schoolId: user.schoolId };
  const accessToken = generateAccessToken(payload);

  res.status(200).json({ success: true, data: { accessToken } });
});

// POST /api/v1/auth/logout
const logout = asyncHandler(async (req, res) => {
  res.clearCookie("refreshToken", cookieOptions);
  res.status(200).json({ success: true, message: "Logged out" });
});

module.exports = { login, refresh, logout };
