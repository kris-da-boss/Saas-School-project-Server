const express = require("express");
const asyncHandler = require("express-async-handler");
const School = require("../models/School");
const User = require("../models/User");

const router = express.Router();

/**
 * TEMPORARY test-only routes.
 * These let us confirm School + User models actually save to MongoDB
 * before the real /auth routes exist. Delete this whole file once
 * the real registration/login feature is built (next increment).
 */

router.post(
  "/schools",
  asyncHandler(async (req, res) => {
    const school = await School.create(req.body);
    res.status(201).json({ success: true, data: school });
  })
);

router.post(
  "/users",
  asyncHandler(async (req, res) => {
    const user = await User.create(req.body);
    // password has select:false on the schema, but a freshly-created doc
    // still holds it in memory until re-fetched — strip it before sending back.
    const safeUser = user.toObject();
    delete safeUser.password;
    res.status(201).json({ success: true, data: safeUser });
  })
);

module.exports = router;
