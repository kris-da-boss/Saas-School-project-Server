const asyncHandler = require("express-async-handler");
const Assignment = require("../models/Assignment");
const Submission = require("../models/Submission");
const StudentProfile = require("../models/StudentProfile");
const cloudinary = require("../config/cloudinary");
const uploadBufferToCloudinary = require("../utils/cloudinaryUpload");
const detectImageType = require("../utils/detectImageType");

// A student's own StudentProfile isn't in their JWT (only userId/role/schoolId
// are), so every route here starts by resolving it from userId.
async function getOwnStudentProfile(req) {
  return StudentProfile.findOne({ schoolId: req.schoolId, userId: req.user.userId });
}

// GET /api/v1/submissions/mine  (student)
// Every assignment for the student's own class, merged with their
// submission status - same "merge roster/records" pattern used for
// Attendance and the assignment roster view.
const getMyAssignments = asyncHandler(async (req, res) => {
  const studentProfile = await getOwnStudentProfile(req);
  if (!studentProfile) {
    res.status(404);
    throw new Error("Student profile not found for this account");
  }

  const assignments = await Assignment.find({
    schoolId: req.schoolId,
    classId: studentProfile.classId,
    isActive: true,
  })
    .populate("subjectId", "name code")
    .sort({ dueDate: 1 });

  const submissions = await Submission.find({
    schoolId: req.schoolId,
    studentId: studentProfile._id,
  });
  const submissionMap = new Map(submissions.map((s) => [s.assignmentId.toString(), s]));

  const results = assignments.map((a) => ({
    assignment: a,
    submission: submissionMap.get(a._id.toString()) || null,
  }));

  res.status(200).json({ success: true, data: results });
});

// POST /api/v1/submissions/:assignmentId  (student, multipart/form-data, field "photo")
// Submits or resubmits work as an image (e.g. a photo of handwritten work).
const submitAssignment = asyncHandler(async (req, res) => {
  if (!req.file) {
    res.status(400);
    throw new Error("A file is required to submit this assignment");
  }

  const studentProfile = await getOwnStudentProfile(req);
  if (!studentProfile) {
    res.status(404);
    throw new Error("Student profile not found for this account");
  }

  // Can only submit to an assignment that belongs to YOUR OWN class - stops
  // a student from submitting into another class's assignment by guessing
  // its id.
  const assignment = await Assignment.findOne({
    _id: req.params.assignmentId,
    schoolId: req.schoolId,
    classId: studentProfile.classId,
  });
  if (!assignment) {
    res.status(404);
    throw new Error("Assignment not found for your class");
  }

  const imageType = await detectImageType(req.file.buffer);
  if (!imageType) {
    res.status(400);
    throw new Error("The uploaded file is not a valid image (JPEG, PNG, or WEBP)");
  }

  const result = await uploadBufferToCloudinary(req.file.buffer, `schools/${req.schoolId}/submissions`);

  // Resubmission: clean up the previous file so Cloudinary doesn't
  // accumulate orphaned uploads every time a student replaces their work.
  const existing = await Submission.findOne({
    schoolId: req.schoolId,
    assignmentId: assignment._id,
    studentId: studentProfile._id,
  });
  if (existing?.filePublicId) {
    await cloudinary.uploader.destroy(existing.filePublicId).catch(() => {});
  }

  const submission = await Submission.findOneAndUpdate(
    { schoolId: req.schoolId, assignmentId: assignment._id, studentId: studentProfile._id },
    {
      schoolId: req.schoolId,
      assignmentId: assignment._id,
      studentId: studentProfile._id,
      fileUrl: result.secure_url,
      filePublicId: result.public_id,
      submittedAt: new Date(),
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  res.status(200).json({ success: true, data: submission });
});

module.exports = { getMyAssignments, submitAssignment };
