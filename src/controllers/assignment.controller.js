const asyncHandler = require("express-async-handler");
const Assignment = require("../models/Assignment");
const Submission = require("../models/Submission");
const Class = require("../models/Class");
const Subject = require("../models/Subject");
const StudentProfile = require("../models/StudentProfile");
const { buildPagination } = require("../utils/pagination");

// POST /api/v1/assignments  (admin, teacher)
const createAssignment = asyncHandler(async (req, res) => {
  const { classId, subjectId, title, description, dueDate } = req.body;

  if (!classId || !subjectId || !title || !dueDate) {
    res.status(400);
    throw new Error("classId, subjectId, title and dueDate are required");
  }

  const classDoc = await Class.findOne({ _id: classId, schoolId: req.schoolId });
  if (!classDoc) {
    res.status(404);
    throw new Error("Class not found");
  }

  const subject = await Subject.findOne({ _id: subjectId, schoolId: req.schoolId });
  if (!subject) {
    res.status(404);
    throw new Error("Subject not found");
  }
  if (!subject.classIds.some((id) => id.equals(classDoc._id))) {
    res.status(409);
    throw new Error(`"${subject.name}" is not assigned to this class`);
  }

  const assignment = await Assignment.create({
    schoolId: req.schoolId,
    classId,
    subjectId,
    title,
    description,
    dueDate,
  });

  res.status(201).json({ success: true, data: assignment });
});

// GET /api/v1/assignments?classId=&page=&limit=&search=  (admin, teacher)
const getAssignments = asyncHandler(async (req, res) => {
  const { page, limit, skip } = buildPagination(req.query);

  const filter = { isActive: true };
  if (req.query.classId) filter.classId = req.query.classId;
  if (req.query.search) filter.title = new RegExp(req.query.search.trim(), "i");

  const [assignments, total] = await Promise.all([
    Assignment.scoped(req.schoolId, filter)
      .populate("classId", "name")
      .populate("subjectId", "name code")
      .sort({ dueDate: -1 })
      .skip(skip)
      .limit(limit),
    Assignment.scopedCount(req.schoolId, filter),
  ]);

  res.status(200).json({
    success: true,
    data: assignments,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
  });
});

// GET /api/v1/assignments/:id  (admin, teacher)
const getAssignmentById = asyncHandler(async (req, res) => {
  const assignment = await Assignment.findOne({ _id: req.params.id, schoolId: req.schoolId })
    .populate("classId", "name")
    .populate("subjectId", "name code");
  if (!assignment) {
    res.status(404);
    throw new Error("Assignment not found");
  }
  res.status(200).json({ success: true, data: assignment });
});

// PATCH /api/v1/assignments/:id  (admin, teacher)
const updateAssignment = asyncHandler(async (req, res) => {
  const assignment = await Assignment.findOne({ _id: req.params.id, schoolId: req.schoolId });
  if (!assignment) {
    res.status(404);
    throw new Error("Assignment not found");
  }

  const { title, description, dueDate } = req.body;
  if (title) assignment.title = title;
  if (description !== undefined) assignment.description = description;
  if (dueDate) assignment.dueDate = dueDate;

  await assignment.save();
  res.status(200).json({ success: true, data: assignment });
});

// DELETE /api/v1/assignments/:id  (admin only) - soft delete
const deactivateAssignment = asyncHandler(async (req, res) => {
  const assignment = await Assignment.findOne({ _id: req.params.id, schoolId: req.schoolId });
  if (!assignment) {
    res.status(404);
    throw new Error("Assignment not found");
  }
  assignment.isActive = false;
  await assignment.save();
  res.status(200).json({ success: true, message: "Assignment deactivated" });
});

// GET /api/v1/assignments/:id/roster  (admin, teacher)
// Same "merge roster with related records" pattern as Attendance - every
// student in the class shows up, whether they've submitted yet or not.
const getAssignmentRoster = asyncHandler(async (req, res) => {
  const assignment = await Assignment.findOne({ _id: req.params.id, schoolId: req.schoolId });
  if (!assignment) {
    res.status(404);
    throw new Error("Assignment not found");
  }

  const roster = await StudentProfile.find({
    schoolId: req.schoolId,
    classId: assignment.classId,
    isActive: true,
  })
    .select("fullName admissionNo")
    .sort({ fullName: 1 });

  const submissions = await Submission.find({ schoolId: req.schoolId, assignmentId: assignment._id });
  const subMap = new Map(submissions.map((s) => [s.studentId.toString(), s]));

  const rosterWithStatus = roster.map((s) => {
    const sub = subMap.get(s._id.toString());
    return {
      studentId: s._id,
      fullName: s.fullName,
      admissionNo: s.admissionNo,
      submitted: !!sub?.submittedAt,
      grade: sub?.grade ?? null,
      feedback: sub?.feedback || "",
    };
  });

  res.status(200).json({ success: true, data: rosterWithStatus });
});

// PATCH /api/v1/assignments/:id/grade  (admin, teacher)
// Body: { studentId, grade, feedback }
// Upserts a Submission record - this deliberately also works for a student
// who never submitted anything through the app (e.g. handed in paper work),
// since a teacher should be able to record a grade either way.
const gradeSubmission = asyncHandler(async (req, res) => {
  const assignment = await Assignment.findOne({ _id: req.params.id, schoolId: req.schoolId });
  if (!assignment) {
    res.status(404);
    throw new Error("Assignment not found");
  }

  const { studentId, grade, feedback } = req.body;
  if (!studentId) {
    res.status(400);
    throw new Error("studentId is required");
  }

  const student = await StudentProfile.findOne({
    _id: studentId,
    schoolId: req.schoolId,
    classId: assignment.classId,
  });
  if (!student) {
    res.status(404);
    throw new Error("Student not found in this class");
  }

  const submission = await Submission.findOneAndUpdate(
    { schoolId: req.schoolId, assignmentId: assignment._id, studentId },
    {
      $set: {
        schoolId: req.schoolId,
        assignmentId: assignment._id,
        studentId,
        grade: grade ?? null,
        feedback: feedback || "",
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  res.status(200).json({ success: true, data: submission });
});

module.exports = {
  createAssignment,
  getAssignments,
  getAssignmentById,
  updateAssignment,
  deactivateAssignment,
  getAssignmentRoster,
  gradeSubmission,
};
