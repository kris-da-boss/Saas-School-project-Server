const asyncHandler = require("express-async-handler");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const School = require("../models/School");
const { generateAccessToken, generateRefreshToken } = require("../utils/generateToken");

// The frontend now proxies /api/* through Vercel to Render (see the
// frontend's vercel.json), so from the browser's point of view every
// request is same-origin. That means the refresh cookie is first-party:
// sameSite "lax" is safe and won't be blocked by Safari/mobile third-party
// cookie rules the way "none" cross-site cookies can be. secure stays
// hardcoded true (not gated on NODE_ENV) since this app is only ever
// deployed over HTTPS.
const cookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: "lax",
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

// POST /api/v1/auth/bootstrap-superadmin
// One-time setup route: protected by a shared secret (not JWT, since no user
// exists yet to log in as). Locks itself once a superadmin already exists.
const bootstrapSuperAdmin = asyncHandler(async (req, res) => {
  const setupKey = req.headers["x-setup-key"];
  if (!setupKey || setupKey !== process.env.SUPERADMIN_SETUP_KEY) {
    res.status(403);
    throw new Error("Invalid or missing setup key");
  }

  const existingCount = await User.countDocuments({ role: "superadmin" });
  if (existingCount > 0) {
    res.status(403);
    throw new Error("A superadmin already exists — this endpoint is now locked");
  }

  const { fullName, email, password } = req.body;
  if (!fullName || !email || !password) {
    res.status(400);
    throw new Error("fullName, email and password are required");
  }

  const superadmin = await User.create({
    fullName,
    email: email.toLowerCase(),
    password,
    role: "superadmin",
    schoolId: null,
  });

  res.status(201).json({
    success: true,
    data: { id: superadmin._id, fullName: superadmin.fullName, email: superadmin.email },
  });
});

// GET /api/v1/auth/me  (protected)
// Returns the current user's profile. Used on app load after a silent
// refresh, so a page reload doesn't lose the user's name/role/etc.
const getMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.userId);
  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }

  res.status(200).json({
    success: true,
    data: {
      id: user._id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      schoolId: user.schoolId,
    },
  });
});

module.exports = { login, refresh, logout, bootstrapSuperAdmin, getMe };
