const asyncHandler = require("express-async-handler");
const Class = require("../models/Class");
const TeacherProfile = require("../models/TeacherProfile");
const StudentProfile = require("../models/StudentProfile");
const { buildPagination } = require("../utils/pagination");

// POST /api/v1/classes  (admin only)
const createClass = asyncHandler(async (req, res) => {
  const { name, classTeacherStaffId, capacity } = req.body;

  if (!name) {
    res.status(400);
    throw new Error("name is required");
  }

  // Resolved from the teacher's staff ID (what an admin actually has in
  // front of them) rather than requiring the raw Mongo _id.
  let classTeacherId = null;
  if (classTeacherStaffId) {
    const teacher = await TeacherProfile.findOne({
      schoolId: req.schoolId,
      staffId: classTeacherStaffId,
    });
    if (!teacher) {
      res.status(404);
      throw new Error(`No teacher with staff ID "${classTeacherStaffId}" was found at this school`);
    }
    classTeacherId = teacher._id;
  }

  try {
    const newClass = await Class.create({
      schoolId: req.schoolId,
      name,
      classTeacherId,
      capacity: capacity || null,
    });
    res.status(201).json({ success: true, data: newClass });
  } catch (error) {
    if (error.code === 11000) {
      res.status(409);
      throw new Error("A class with this name already exists at this school");
    }
    throw error;
  }
});

// GET /api/v1/classes  (admin, teacher)
const getClasses = asyncHandler(async (req, res) => {
  const { page, limit, skip } = buildPagination(req.query);

  const filter = { isActive: true };
  if (req.query.search) {
    filter.name = new RegExp(req.query.search.trim(), "i");
  }

  const [classes, total] = await Promise.all([
    Class.scoped(req.schoolId, filter)
      .populate("classTeacherId", "fullName staffId")
      .sort({ name: 1 })
      .skip(skip)
      .limit(limit),
    Class.scopedCount(req.schoolId, filter),
  ]);

  // Attach a student count per class using ONE aggregation query, instead of
  // looping and running StudentProfile.countDocuments() once per class
  // (which would be an N+1 query problem — slow and wasteful at scale).
  const classIds = classes.map((c) => c._id);
  const counts = await StudentProfile.aggregate([
    { $match: { schoolId: req.schoolId, classId: { $in: classIds }, isActive: true } },
    { $group: { _id: "$classId", count: { $sum: 1 } } },
  ]);
  const countMap = Object.fromEntries(counts.map((c) => [c._id.toString(), c.count]));

  const classesWithCounts = classes.map((c) => ({
    ...c.toObject(),
    studentCount: countMap[c._id.toString()] || 0,
  }));

  res.status(200).json({
    success: true,
    data: classesWithCounts,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
  });
});

// GET /api/v1/classes/:id  (admin, teacher) - includes the full roster
const getClassById = asyncHandler(async (req, res) => {
  const classDoc = await Class.findOne({ _id: req.params.id, schoolId: req.schoolId }).populate(
    "classTeacherId",
    "fullName staffId"
  );
  if (!classDoc) {
    res.status(404);
    throw new Error("Class not found");
  }

  // Roster computed on demand from the single source of truth
  // (StudentProfile.classId) - see the model file comment for why we never
  // store this list twice.
  const roster = await StudentProfile.find({
    schoolId: req.schoolId,
    classId: classDoc._id,
    isActive: true,
  }).select("fullName admissionNo photoUrl");

  res.status(200).json({ success: true, data: { ...classDoc.toObject(), roster } });
});

// PATCH /api/v1/classes/:id  (admin only)
const updateClass = asyncHandler(async (req, res) => {
  const classDoc = await Class.findOne({ _id: req.params.id, schoolId: req.schoolId });
  if (!classDoc) {
    res.status(404);
    throw new Error("Class not found");
  }

  const { name, classTeacherStaffId, capacity } = req.body;

  if (classTeacherStaffId !== undefined) {
    if (classTeacherStaffId === "") {
      classDoc.classTeacherId = null;
    } else {
      const teacher = await TeacherProfile.findOne({
        schoolId: req.schoolId,
        staffId: classTeacherStaffId,
      });
      if (!teacher) {
        res.status(404);
        throw new Error(`No teacher with staff ID "${classTeacherStaffId}" was found at this school`);
      }
      classDoc.classTeacherId = teacher._id;
    }
  }

  if (name) classDoc.name = name;
  if (capacity !== undefined) classDoc.capacity = capacity || null;

  try {
    await classDoc.save();
  } catch (error) {
    if (error.code === 11000) {
      res.status(409);
      throw new Error("A class with this name already exists at this school");
    }
    throw error;
  }

  res.status(200).json({ success: true, data: classDoc });
});

// DELETE /api/v1/classes/:id  (admin only) - soft delete, with a guardrail
const deactivateClass = asyncHandler(async (req, res) => {
  const classDoc = await Class.findOne({ _id: req.params.id, schoolId: req.schoolId });
  if (!classDoc) {
    res.status(404);
    throw new Error("Class not found");
  }

  // Don't let an admin silently orphan a class full of students — they must
  // reassign students to another class first.
  const activeStudentCount = await StudentProfile.countDocuments({
    schoolId: req.schoolId,
    classId: classDoc._id,
    isActive: true,
  });
  if (activeStudentCount > 0) {
    res.status(409);
    throw new Error(
      `Reassign ${activeStudentCount} student(s) to another class before deactivating this one`
    );
  }

  classDoc.isActive = false;
  await classDoc.save();

  res.status(200).json({ success: true, message: "Class deactivated" });
});

module.exports = { createClass, getClasses, getClassById, updateClass, deactivateClass };
