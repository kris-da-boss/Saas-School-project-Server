const asyncHandler = require("express-async-handler");
const Subject = require("../models/Subject");
const Class = require("../models/Class");
const { buildPagination } = require("../utils/pagination");

// Same normalization idea as ParentProfile's admission numbers: form-data
// sends one value as a string, several as an array.
function normalizeToArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

// POST /api/v1/subjects  (admin only)
const createSubject = asyncHandler(async (req, res) => {
  const { name, code } = req.body;
  const classNames = normalizeToArray(req.body.classNames);

  if (!name || !code) {
    res.status(400);
    throw new Error("name and code are required");
  }

  const classes = await Class.find({ schoolId: req.schoolId, name: { $in: classNames } });
  if (classes.length !== classNames.length) {
    res.status(404);
    throw new Error("One or more class names were not found at this school");
  }

  try {
    const subject = await Subject.create({
      schoolId: req.schoolId,
      name,
      code: code.toUpperCase(),
      classIds: classes.map((c) => c._id),
    });
    res.status(201).json({ success: true, data: subject });
  } catch (error) {
    if (error.code === 11000) {
      res.status(409);
      throw new Error("A subject with this code already exists at this school");
    }
    throw error;
  }
});

// GET /api/v1/subjects  (admin, teacher)
const getSubjects = asyncHandler(async (req, res) => {
  const { page, limit, skip } = buildPagination(req.query);

  const filter = { isActive: true };
  if (req.query.search) {
    const regex = new RegExp(req.query.search.trim(), "i");
    filter.$or = [{ name: regex }, { code: regex }];
  }

  const [subjects, total] = await Promise.all([
    Subject.scoped(req.schoolId, filter)
      .populate("classIds", "name")
      .sort({ name: 1 })
      .skip(skip)
      .limit(limit),
    Subject.scopedCount(req.schoolId, filter),
  ]);

  res.status(200).json({
    success: true,
    data: subjects,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
  });
});

// GET /api/v1/subjects/:id  (admin, teacher)
const getSubjectById = asyncHandler(async (req, res) => {
  const subject = await Subject.findOne({ _id: req.params.id, schoolId: req.schoolId }).populate(
    "classIds",
    "name"
  );
  if (!subject) {
    res.status(404);
    throw new Error("Subject not found");
  }
  res.status(200).json({ success: true, data: subject });
});

// PATCH /api/v1/subjects/:id  (admin only)
const updateSubject = asyncHandler(async (req, res) => {
  const subject = await Subject.findOne({ _id: req.params.id, schoolId: req.schoolId });
  if (!subject) {
    res.status(404);
    throw new Error("Subject not found");
  }

  const { name, code } = req.body;
  if (name) subject.name = name;
  if (code) subject.code = code.toUpperCase();

  // Only touch the class list if the request actually sent one - editing
  // just the name shouldn't accidentally clear which classes take it
  if (req.body.classNames !== undefined) {
    const classNames = normalizeToArray(req.body.classNames);
    const classes = await Class.find({ schoolId: req.schoolId, name: { $in: classNames } });
    if (classes.length !== classNames.length) {
      res.status(404);
      throw new Error("One or more class names were not found at this school");
    }
    subject.classIds = classes.map((c) => c._id);
  }

  try {
    await subject.save();
  } catch (error) {
    if (error.code === 11000) {
      res.status(409);
      throw new Error("A subject with this code already exists at this school");
    }
    throw error;
  }

  res.status(200).json({ success: true, data: subject });
});

// DELETE /api/v1/subjects/:id  (admin only) - soft delete
const deactivateSubject = asyncHandler(async (req, res) => {
  const subject = await Subject.findOne({ _id: req.params.id, schoolId: req.schoolId });
  if (!subject) {
    res.status(404);
    throw new Error("Subject not found");
  }
  subject.isActive = false;
  await subject.save();
  res.status(200).json({ success: true, message: "Subject deactivated" });
});

module.exports = { createSubject, getSubjects, getSubjectById, updateSubject, deactivateSubject };
