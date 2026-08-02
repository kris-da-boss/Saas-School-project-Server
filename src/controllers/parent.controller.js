const mongoose = require("mongoose");
const asyncHandler = require("express-async-handler");
const User = require("../models/User");
const ParentProfile = require("../models/ParentProfile");
const StudentProfile = require("../models/StudentProfile");
const cloudinary = require("../config/cloudinary");
const uploadBufferToCloudinary = require("../utils/cloudinaryUpload");
const detectImageType = require("../utils/detectImageType");
const { buildPagination } = require("../utils/pagination");

// Form-data sends a single value as a plain string, but multiple values
// under the same field name as an array. Normalize to always-an-array so
// the rest of the controller doesn't have to care which case it got.
function normalizeToArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

// POST /api/v1/parents  (admin only, multipart/form-data)
// Body may include repeated "childrenAdmissionNos" fields — admission
// numbers of EXISTING students this parent should be linked to.
const createParent = asyncHandler(async (req, res) => {
  const { fullName, email, password, phone, occupation } = req.body;
  const childrenAdmissionNos = normalizeToArray(req.body.childrenAdmissionNos);

  if (!fullName || !email || !password) {
    res.status(400);
    throw new Error("fullName, email and password are required");
  }

  // Resolve admission numbers to real students BEFORE the transaction, so a
  // typo gives a clean 404 rather than aborting mid-write.
  const children = await StudentProfile.find({
    schoolId: req.schoolId,
    admissionNo: { $in: childrenAdmissionNos },
  });
  if (children.length !== childrenAdmissionNos.length) {
    res.status(404);
    throw new Error("One or more admission numbers were not found at this school");
  }

  let photoUrl = "";
  let photoPublicId = "";
  if (req.file) {
    const imageType = await detectImageType(req.file.buffer);
    if (!imageType) {
      res.status(400);
      throw new Error("The uploaded file is not a valid image (JPEG, PNG, or WEBP)");
    }
    const result = await uploadBufferToCloudinary(req.file.buffer, `schools/${req.schoolId}/parents`);
    photoUrl = result.secure_url;
    photoPublicId = result.public_id;
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const [user] = await User.create(
      [{ schoolId: req.schoolId, fullName, email: email.toLowerCase(), password, role: "parent" }],
      { session }
    );

    const [parent] = await ParentProfile.create(
      [
        {
          schoolId: req.schoolId,
          userId: user._id,
          fullName,
          phone,
          occupation,
          photoUrl,
          photoPublicId,
          childrenIds: children.map((c) => c._id),
        },
      ],
      { session }
    );

    // The relationship lives on BOTH sides: every linked student's own
    // parentIds array needs this parent added too. $addToSet prevents
    // duplicates if this ever runs twice.
    await StudentProfile.updateMany(
      { _id: { $in: children.map((c) => c._id) } },
      { $addToSet: { parentIds: parent._id } },
      { session }
    );

    await session.commitTransaction();
    session.endSession();

    res.status(201).json({
      success: true,
      data: { parent, account: { id: user._id, email: user.email } },
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();

    if (photoPublicId) {
      await cloudinary.uploader.destroy(photoPublicId).catch(() => {});
    }
    if (error.code === 11000) {
      res.status(409);
      throw new Error("Email is already in use");
    }
    throw error;
  }
});

// GET /api/v1/parents  (admin only)
const getParents = asyncHandler(async (req, res) => {
  const { page, limit, skip } = buildPagination(req.query);

  const filter = { isActive: true };
  if (req.query.search) {
    const regex = new RegExp(req.query.search.trim(), "i");
    filter.$or = [{ fullName: regex }, { phone: regex }];
  }

  const [parents, total] = await Promise.all([
    ParentProfile.scoped(req.schoolId, filter)
      .populate("childrenIds", "fullName admissionNo photoUrl")
      .sort({ fullName: 1 })
      .skip(skip)
      .limit(limit),
    ParentProfile.scopedCount(req.schoolId, filter),
  ]);

  res.status(200).json({
    success: true,
    data: parents,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
  });
});

// GET /api/v1/parents/:id  (admin only)
const getParentById = asyncHandler(async (req, res) => {
  const parent = await ParentProfile.findOne({ _id: req.params.id, schoolId: req.schoolId }).populate(
    "childrenIds",
    "fullName admissionNo photoUrl"
  );
  if (!parent) {
    res.status(404);
    throw new Error("Parent not found");
  }
  res.status(200).json({ success: true, data: parent });
});

// PATCH /api/v1/parents/:id  (admin only, multipart/form-data)
const updateParent = asyncHandler(async (req, res) => {
  const parent = await ParentProfile.findOne({ _id: req.params.id, schoolId: req.schoolId });
  if (!parent) {
    res.status(404);
    throw new Error("Parent not found");
  }

  const { fullName, phone, occupation } = req.body;
  if (fullName) parent.fullName = fullName;
  if (phone) parent.phone = phone;
  if (occupation) parent.occupation = occupation;

  if (req.file) {
    const imageType = await detectImageType(req.file.buffer);
    if (!imageType) {
      res.status(400);
      throw new Error("The uploaded file is not a valid image (JPEG, PNG, or WEBP)");
    }
    const result = await uploadBufferToCloudinary(req.file.buffer, `schools/${req.schoolId}/parents`);
    if (parent.photoPublicId) {
      await cloudinary.uploader.destroy(parent.photoPublicId).catch(() => {});
    }
    parent.photoUrl = result.secure_url;
    parent.photoPublicId = result.public_id;
  }

  // Only touch the children list if the request actually sent one — an
  // admin editing just the phone number shouldn't accidentally wipe it.
  if (req.body.childrenAdmissionNos !== undefined) {
    const childrenAdmissionNos = normalizeToArray(req.body.childrenAdmissionNos);

    const newChildren = await StudentProfile.find({
      schoolId: req.schoolId,
      admissionNo: { $in: childrenAdmissionNos },
    });
    if (newChildren.length !== childrenAdmissionNos.length) {
      res.status(404);
      throw new Error("One or more admission numbers were not found at this school");
    }

    const newChildIds = newChildren.map((c) => c._id.toString());
    const oldChildIds = parent.childrenIds.map((id) => id.toString());

    const added = newChildIds.filter((id) => !oldChildIds.includes(id));
    const removed = oldChildIds.filter((id) => !newChildIds.includes(id));

    // Same bidirectional-sync idea as create: add the parent to newly
    // linked students, remove it from ones that got unlinked.
    if (added.length) {
      await StudentProfile.updateMany({ _id: { $in: added } }, { $addToSet: { parentIds: parent._id } });
    }
    if (removed.length) {
      await StudentProfile.updateMany({ _id: { $in: removed } }, { $pull: { parentIds: parent._id } });
    }

    parent.childrenIds = newChildIds;
  }

  await parent.save();

  if (fullName) {
    await User.findByIdAndUpdate(parent.userId, { fullName });
  }

  res.status(200).json({ success: true, data: parent });
});

// DELETE /api/v1/parents/:id  (admin only) - soft delete
// We deliberately do NOT strip this parent out of their children's
// parentIds — that historical link stays intact, only the login is
// suspended. Same reasoning as deactivateStudent.
const deactivateParent = asyncHandler(async (req, res) => {
  const parent = await ParentProfile.findOne({ _id: req.params.id, schoolId: req.schoolId });
  if (!parent) {
    res.status(404);
    throw new Error("Parent not found");
  }

  parent.isActive = false;
  await parent.save();
  await User.findByIdAndUpdate(parent.userId, { status: "suspended" });

  res.status(200).json({ success: true, message: "Parent deactivated" });
});

// GET /api/v1/parents/mine  (parent only)
// Resolves the calling parent's own profile and children - a parent's JWT
// only carries userId/role/schoolId, same resolve-from-userId pattern used
// for students and teachers elsewhere.
const getMyChildren = asyncHandler(async (req, res) => {
  const parent = await ParentProfile.findOne({ schoolId: req.schoolId, userId: req.user.userId }).populate(
    "childrenIds",
    "fullName admissionNo photoUrl classId"
  );
  if (!parent) {
    res.status(404);
    throw new Error("Parent profile not found for this account");
  }

  res.status(200).json({ success: true, data: parent.childrenIds });
});

module.exports = {
  createParent,
  getParents,
  getParentById,
  updateParent,
  deactivateParent,
  getMyChildren,
};
