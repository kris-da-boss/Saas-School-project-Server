const asyncHandler = require("express-async-handler");
const Exam = require("../models/Exam");
const Class = require("../models/Class");
const Subject = require("../models/Subject");
const { getOwnTeacherProfile, getTeacherClassIds } = require("../utils/teacherAccess");
const { buildPagination } = require("../utils/pagination");

// Same ownership pattern as attendance/assignment controllers - a teacher
// role check alone doesn't prove this teacher owns THIS class.
async function assertClassAccess(req, res, classId) {
  if (req.user.role !== "teacher") return;

  const teacherProfile = await getOwnTeacherProfile(req);
  if (!teacherProfile) {
    res.status(404);
    throw new Error("Teacher profile not found for this account");
  }

  const allowedClassIds = await getTeacherClassIds(req.schoolId, teacherProfile._id);
  if (!allowedClassIds.includes(classId.toString())) {
    res.status(403);
    throw new Error("You are not assigned to this class");
  }
}

// POST /api/v1/exams  (admin, teacher)
const createExam = asyncHandler(async (req, res) => {
  const { name, term, session, classId, subjectId, maxScore, examDate } = req.body;

  if (!name || !term || !session || !classId || !subjectId) {
    res.status(400);
    throw new Error("name, term, session, classId and subjectId are required");
  }

  const classDoc = await Class.findOne({ _id: classId, schoolId: req.schoolId });
  if (!classDoc) {
    res.status(404);
    throw new Error("Class not found");
  }
  await assertClassAccess(req, res, classDoc._id);

  const subject = await Subject.findOne({ _id: subjectId, schoolId: req.schoolId });
  if (!subject) {
    res.status(404);
    throw new Error("Subject not found");
  }
  if (!subject.classIds.some((id) => id.equals(classDoc._id))) {
    res.status(409);
    throw new Error(`"${subject.name}" is not assigned to this class`);
  }

  try {
    const exam = await Exam.create({
      schoolId: req.schoolId,
      name,
      term,
      session,
      classId,
      subjectId,
      maxScore: maxScore || 100,
      examDate: examDate || undefined,
    });
    res.status(201).json({ success: true, data: exam });
  } catch (error) {
    if (error.code === 11000) {
      res.status(409);
      throw new Error("An exam for this class, subject, term and session already exists");
    }
    throw error;
  }
});

// GET /api/v1/exams?classId=&term=&session=&page=&limit=&search=  (admin, teacher)
const getExams = asyncHandler(async (req, res) => {
  const { page, limit, skip } = buildPagination(req.query);
  const filter = { isActive: true };

  if (req.query.term) filter.term = req.query.term;
  if (req.query.session) filter.session = req.query.session;
  if (req.query.search) filter.name = new RegExp(req.query.search.trim(), "i");

  if (req.user.role === "teacher") {
    const teacherProfile = await getOwnTeacherProfile(req);
    if (!teacherProfile) {
      res.status(404);
      throw new Error("Teacher profile not found for this account");
    }
    const myClassIds = await getTeacherClassIds(req.schoolId, teacherProfile._id);

    if (req.query.classId) {
      if (!myClassIds.includes(req.query.classId)) {
        res.status(403);
        throw new Error("You are not assigned to this class");
      }
      filter.classId = req.query.classId;
    } else {
      filter.classId = { $in: myClassIds };
    }
  } else if (req.query.classId) {
    filter.classId = req.query.classId;
  }

  const [exams, total] = await Promise.all([
    Exam.scoped(req.schoolId, filter)
      .populate("classId", "name")
      .populate("subjectId", "name code")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Exam.scopedCount(req.schoolId, filter),
  ]);

  res.status(200).json({
    success: true,
    data: exams,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
  });
});

// GET /api/v1/exams/:id  (admin, teacher)
const getExamById = asyncHandler(async (req, res) => {
  const exam = await Exam.findOne({ _id: req.params.id, schoolId: req.schoolId })
    .populate("classId", "name")
    .populate("subjectId", "name code");
  if (!exam) {
    res.status(404);
    throw new Error("Exam not found");
  }
  res.status(200).json({ success: true, data: exam });
});

// DELETE /api/v1/exams/:id  (admin, teacher) - soft delete
const deactivateExam = asyncHandler(async (req, res) => {
  const exam = await Exam.findOne({ _id: req.params.id, schoolId: req.schoolId });
  if (!exam) {
    res.status(404);
    throw new Error("Exam not found");
  }
  await assertClassAccess(req, res, exam.classId);

  exam.isActive = false;
  await exam.save();
  res.status(200).json({ success: true, message: "Exam deactivated" });
});

module.exports = { createExam, getExams, getExamById, deactivateExam, assertClassAccess };
