const mongoose = require("mongoose");
const asyncHandler = require("express-async-handler");
const User = require("../models/User");
const TeacherProfile = require("../models/TeacherProfile");
const cloudinary = require("../config/cloudinary");
const uploadBufferToCloudinary = require("../utils/cloudinaryUpload");
const detectImageType = require("../utils/detectImageType");
const { buildPagination } = require("../utils/pagination");

// POST /api/v1/teachers  (admin only, multipart/form-data)
const createTeacher = asyncHandler(async (req, res) => {
  const { fullName, email, password, staffId, qualifications, phone } = req.body;

  if (!fullName || !email || !password || !staffId) {
    res.status(400);
    throw new Error("fullName, email, password and staffId are required");
  }

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
      `schools/${req.schoolId}/teachers`
    );
    photoUrl = result.secure_url;
    photoPublicId = result.public_id;
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const [user] = await User.create(
      [{ schoolId: req.schoolId, fullName, email: email.toLowerCase(), password, role: "teacher" }],
      { session }
    );

    const [profile] = await TeacherProfile.create(
      [
        {
          schoolId: req.schoolId,
          userId: user._id,
          fullName,
          staffId,
          qualifications,
          phone,
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
      data: { teacher: profile, account: { id: user._id, email: user.email } },
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();

    if (photoPublicId) {
      await cloudinary.uploader.destroy(photoPublicId).catch(() => {});
    }

    if (error.code === 11000) {
      res.status(409);
      throw new Error("Staff ID or email is already in use");
    }
    throw error;
  }
});

// GET /api/v1/teachers  (admin, and later teachers viewing colleagues if needed)
const getTeachers = asyncHandler(async (req, res) => {
  const { page, limit, skip } = buildPagination(req.query);

  const filter = { isActive: true };
  if (req.query.search) {
    const regex = new RegExp(req.query.search.trim(), "i");
    filter.$or = [{ fullName: regex }, { staffId: regex }];
  }

  const [teachers, total] = await Promise.all([
    TeacherProfile.scoped(req.schoolId, filter).sort({ fullName: 1 }).skip(skip).limit(limit),
    TeacherProfile.scopedCount(req.schoolId, filter),
  ]);

  res.status(200).json({
    success: true,
    data: teachers,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
  });
});

// GET /api/v1/teachers/:id  (admin)
const getTeacherById = asyncHandler(async (req, res) => {
  const teacher = await TeacherProfile.findOne({ _id: req.params.id, schoolId: req.schoolId });
  if (!teacher) {
    res.status(404);
    throw new Error("Teacher not found");
  }
  res.status(200).json({ success: true, data: teacher });
});

// PATCH /api/v1/teachers/:id  (admin only, multipart/form-data)
const updateTeacher = asyncHandler(async (req, res) => {
  const teacher = await TeacherProfile.findOne({ _id: req.params.id, schoolId: req.schoolId });
  if (!teacher) {
    res.status(404);
    throw new Error("Teacher not found");
  }

  const { fullName, qualifications, phone } = req.body;
  if (fullName) teacher.fullName = fullName;
  if (qualifications) teacher.qualifications = qualifications;
  if (phone) teacher.phone = phone;

  if (req.file) {
    const imageType = await detectImageType(req.file.buffer);
    if (!imageType) {
      res.status(400);
      throw new Error("The uploaded file is not a valid image (JPEG, PNG, or WEBP)");
    }

    const result = await uploadBufferToCloudinary(
      req.file.buffer,
      `schools/${req.schoolId}/teachers`
    );
    if (teacher.photoPublicId) {
      await cloudinary.uploader.destroy(teacher.photoPublicId).catch(() => {});
    }
    teacher.photoUrl = result.secure_url;
    teacher.photoPublicId = result.public_id;
  }

  await teacher.save();

  if (fullName) {
    await User.findByIdAndUpdate(teacher.userId, { fullName });
  }

  res.status(200).json({ success: true, data: teacher });
});

// DELETE /api/v1/teachers/:id  (admin only) - soft delete, same reasoning as students
const deactivateTeacher = asyncHandler(async (req, res) => {
  const teacher = await TeacherProfile.findOne({ _id: req.params.id, schoolId: req.schoolId });
  if (!teacher) {
    res.status(404);
    throw new Error("Teacher not found");
  }

  teacher.isActive = false;
  await teacher.save();
  await User.findByIdAndUpdate(teacher.userId, { status: "suspended" });

  res.status(200).json({ success: true, message: "Teacher deactivated" });
});

module.exports = {
  createTeacher,
  getTeachers,
  getTeacherById,
  updateTeacher,
  deactivateTeacher,
};
