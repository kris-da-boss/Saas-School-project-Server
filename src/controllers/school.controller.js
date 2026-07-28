const mongoose = require("mongoose");
const asyncHandler = require("express-async-handler");
const School = require("../models/School");
const User = require("../models/User");

// POST /api/v1/schools  (superadmin only)
// Creates a School AND its first Admin user together. Wrapped in a
// transaction: if the admin creation fails (e.g. duplicate email), the
// school creation is rolled back too — you never end up with an orphaned
// school with no one able to log into it.
// NOTE: transactions require MongoDB Atlas (a replica set) — they will NOT
// work against a standalone local mongod. Atlas free tier (M0) supports this.
const createSchool = asyncHandler(async (req, res) => {
  const {
    name,
    subdomain,
    schoolCode,
    contactEmail,
    adminFullName,
    adminEmail,
    adminPassword,
  } = req.body;

  if (!name || !subdomain || !schoolCode || !adminFullName || !adminEmail || !adminPassword) {
    res.status(400);
    throw new Error(
      "name, subdomain, schoolCode, adminFullName, adminEmail and adminPassword are all required"
    );
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const [school] = await School.create(
      [{ name, subdomain, schoolCode, contactEmail }],
      { session }
    );

    const [admin] = await User.create(
      [
        {
          schoolId: school._id,
          fullName: adminFullName,
          email: adminEmail.toLowerCase(),
          password: adminPassword,
          role: "admin",
        },
      ],
      { session }
    );

    await session.commitTransaction();
    session.endSession();

    res.status(201).json({
      success: true,
      data: {
        school,
        admin: { id: admin._id, fullName: admin.fullName, email: admin.email },
      },
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();

    if (error.code === 11000) {
      res.status(409);
      throw new Error("Subdomain, school code, or admin email is already in use");
    }
    throw error;
  }
});

// GET /api/v1/schools/by-subdomain/:subdomain  (PUBLIC - no auth)
// Called by the frontend on page load, before login, to resolve which
// school a subdomain belongs to and fetch its branding (logo/theme).
const getSchoolBySubdomain = asyncHandler(async (req, res) => {
  const school = await School.findOne({
    subdomain: req.params.subdomain.toLowerCase(),
  }).select("name subdomain schoolCode logoUrl themeColor billingStatus");

  if (!school) {
    res.status(404);
    throw new Error("No school found for this address");
  }

  res.status(200).json({ success: true, data: school });
});

module.exports = { createSchool, getSchoolBySubdomain };
