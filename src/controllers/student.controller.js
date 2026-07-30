const mongoose = require("mongoose");
const asyncHandler = require("express-async-handler");
const User = require("../models/User");
const StudentProfile = require("../models/StudentProfile");
const Class = require("../models/Class");
const cloudinary = require("../config/cloudinary");
const uploadBufferToCloudinary = require("../utils/cloudinaryUpload");
const detectImageType = require("../utils/detectImageType");
const { buildPagination } = require("../utils/pagination");

// POST /api/v1/students  (admin only, multipart/form-data)
// Creates BOTH the login User (role: student) and the StudentProfile,
// in one transaction — same pattern as school onboarding.
const createStudent = asyncHandler(async (req, res) => {
  const { fullName, email, password, admissionNo, dob, gender, address, className } = req.body;

  if (!fullName || !email || !password || !admissionNo) {
    res.status(400);
    throw new Error("fullName, email, password and admissionNo are required");
  }

  // Optional class assignment at creation time - resolved from a class NAME
  // (what an admin actually knows/types) rather than requiring the raw
  // Mongo _id, same ergonomics as admission numbers elsewhere in the app.
  let classId = null;
  if (className) {
    const classDoc = await Class.findOne({ schoolId: req.schoolId, name: className });
    if (!classDoc) {
      res.status(404);
      throw new Error(`No class named "${className}" was found at this school`);
    }
    classId = classDoc._id;
  }

  // Cloudinary isn't part of the Mongo transaction, so we upload FIRST.
  // If this succeeds but the DB write later fails, we clean it up in catch.
  let photoUrl = "";
  let photoPublicId = "";
  if (req.file) {
    const imageType = await detectImageType(req.file.buffer);
    if (!imageType) {
      res.status(400);
      throw new Error("The uploaded file is not a valid image (JPEG, PNG, or WEBP)");
    }

    const result = await uploadBufferToCloudinary(
      req.file.buffer,
      `schools/${req.schoolId}/students`
    );
    photoUrl = result.secure_url;
    photoPublicId = result.public_id;
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const [user] = await User.create(
      [{ schoolId: req.schoolId, fullName, email: email.toLowerCase(), password, role: "student" }],
      { session }
    );

    const [profile] = await StudentProfile.create(
      [
        {
          schoolId: req.schoolId,
          userId: user._id,
          fullName,
          admissionNo,
          dob: dob || undefined,
          gender: gender || undefined,
          address,
          classId,
          photoUrl,
          photoPublicId,
        },
      ],
      { session }
    );

    await session.commitTransaction();
    session.endSession();

    res.status(201).json({
      success: true,
      data: { student: profile, account: { id: user._id, email: user.email } },
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();

    // Avoid leaving an orphaned image in Cloudinary if the DB write failed
    if (photoPublicId) {
      await cloudinary.uploader.destroy(photoPublicId).catch(() => {});
    }

    if (error.code === 11000) {
      res.status(409);
      throw new Error("Admission number or email is already in use");
    }
    throw error;
  }
});

// GET /api/v1/students  (admin, teacher)
// Supports ?page=&limit=&search=
const getStudents = asyncHandler(async (req, res) => {
  const { page, limit, skip } = buildPagination(req.query);

  const filter = { isActive: true };
  if (req.query.search) {
    const regex = new RegExp(req.query.search.trim(), "i");
    filter.$or = [{ fullName: regex }, { admissionNo: regex }];
  }

  const [students, total] = await Promise.all([
    StudentProfile.scoped(req.schoolId, filter)
      .populate("classId", "name")
      .sort({ fullName: 1 })
      .skip(skip)
      .limit(limit),
    StudentProfile.scopedCount(req.schoolId, filter),
  ]);

  res.status(200).json({
    success: true,
    data: students,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
  });
});

// GET /api/v1/students/:id  (admin, teacher)
const getStudentById = asyncHandler(async (req, res) => {
  const student = await StudentProfile.findOne({ _id: req.params.id, schoolId: req.schoolId });
  if (!student) {
    res.status(404);
    throw new Error("Student not found");
  }
  res.status(200).json({ success: true, data: student });
});

// PATCH /api/v1/students/:id  (admin only, multipart/form-data)
const updateStudent = asyncHandler(async (req, res) => {
  const student = await StudentProfile.findOne({ _id: req.params.id, schoolId: req.schoolId });
  if (!student) {
    res.status(404);
    throw new Error("Student not found");
  }

  const { fullName, dob, gender, address, className } = req.body;
  if (fullName) student.fullName = fullName;
  if (dob) student.dob = dob;
  if (gender) student.gender = gender;
  if (address) student.address = address;

  // Only touch class assignment if the field was actually sent. An empty
  // string means "unassign from any class"; a non-empty name gets resolved
  // the same way as on create.
  if (className !== undefined) {
    if (className === "") {
      student.classId = null;
    } else {
      const classDoc = await Class.findOne({ schoolId: req.schoolId, name: className });
      if (!classDoc) {
        res.status(404);
        throw new Error(`No class named "${className}" was found at this school`);
      }
      student.classId = classDoc._id;
    }
  }

  if (req.file) {
    const imageType = await detectImageType(req.file.buffer);
    if (!imageType) {
      res.status(400);
      throw new Error("The uploaded file is not a valid image (JPEG, PNG, or WEBP)");
    }

    const result = await uploadBufferToCloudinary(
      req.file.buffer,
      `schools/${req.schoolId}/students`
    );
    // Delete the OLD photo only after the new upload succeeds
    if (student.photoPublicId) {
      await cloudinary.uploader.destroy(student.photoPublicId).catch(() => {});
    }
    student.photoUrl = result.secure_url;
    student.photoPublicId = result.public_id;
  }

  await student.save();

  // Keep User.fullName in sync since we denormalized it onto this profile
  if (fullName) {
    await User.findByIdAndUpdate(student.userId, { fullName });
  }

  res.status(200).json({ success: true, data: student });
});

// DELETE /api/v1/students/:id  (admin only)
// Soft delete: schools need academic history preserved, so we deactivate
// rather than remove. The student's login is also suspended.
const deactivateStudent = asyncHandler(async (req, res) => {
  const student = await StudentProfile.findOne({ _id: req.params.id, schoolId: req.schoolId });
  if (!student) {
    res.status(404);
    throw new Error("Student not found");
  }

  student.isActive = false;
  await student.save();
  await User.findByIdAndUpdate(student.userId, { status: "suspended" });

  res.status(200).json({ success: true, message: "Student deactivated" });
});

module.exports = {
  createStudent,
  getStudents,
  getStudentById,
  updateStudent,
  deactivateStudent,
};
