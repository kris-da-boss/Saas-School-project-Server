const asyncHandler = require("express-async-handler");
const Exam = require("../models/Exam");
const Class = require("../models/Class");
const Subject = require("../models/Subject");
const Term = require("../models/Term");
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

// POST /api/v1/exams/bulk  (admin, teacher)
// Body: { classId, term, session, subjects: [{ subjectId, examDate, maxScore }] }
// Creates every subject's exam sitting in ONE request instead of requiring
// class/term/session to be re-typed per subject. Uses upsert, so calling
// this again for the same class/term/session (e.g. adding one more subject
// later) updates rather than errors on the duplicate-key index.
const bulkCreateExams = asyncHandler(async (req, res) => {
  const { classId, term, session, subjects, termStartDate, termEndDate } = req.body;

  if (!classId || !term || !session || !Array.isArray(subjects) || subjects.length === 0) {
    res.status(400);
    throw new Error("classId, term, session and a non-empty subjects array are required");
  }

  const classDoc = await Class.findOne({ _id: classId, schoolId: req.schoolId });
  if (!classDoc) {
    res.status(404);
    throw new Error("Class not found");
  }
  await assertClassAccess(req, res, classDoc._id);

  // Confirm every subject listed is actually assigned to this class - same
  // integrity rule as single exam creation, just checked for the whole
  // batch at once.
  const subjectIds = subjects.map((s) => s.subjectId);
  const validSubjects = await Subject.find({
    _id: { $in: subjectIds },
    schoolId: req.schoolId,
    classIds: classDoc._id,
  });
  if (validSubjects.length !== subjectIds.length) {
    res.status(409);
    throw new Error("One or more subjects are not assigned to this class");
  }

  const ops = subjects.map((s) => ({
    updateOne: {
      filter: { schoolId: req.schoolId, classId: classDoc._id, subjectId: s.subjectId, term, session },
      update: {
        $set: {
          schoolId: req.schoolId,
          classId: classDoc._id,
          subjectId: s.subjectId,
          term,
          session,
          name: `${term} Examination`,
          maxCA: s.maxCA || 40,
          maxScore: s.maxScore || 100,
          examDate: s.examDate || undefined,
          isActive: true,
        },
      },
      upsert: true,
    },
  }));

  await Exam.bulkWrite(ops);

  // Term date range is school-wide (not per-class), so only upsert it if
  // dates were actually provided - a class that reschedules doesn't need
  // to touch the whole school's term boundaries.
  if (termStartDate && termEndDate) {
    await Term.updateOne(
      { schoolId: req.schoolId, term, session },
      { $set: { schoolId: req.schoolId, term, session, startDate: termStartDate, endDate: termEndDate } },
      { upsert: true }
    );
  }

  const exams = await Exam.find({ schoolId: req.schoolId, classId: classDoc._id, term, session }).populate(
    "subjectId",
    "name code"
  );

  res.status(201).json({ success: true, data: exams });
});

// GET /api/v1/exams/term?term=&session=  (admin, teacher)
// Fetches an existing term's date range, if one has been set - used by the
// frontend to pre-fill the term-dates fields when scheduling exams for a
// term that's already been dated via a different class.
const getTermDates = asyncHandler(async (req, res) => {
  const { term, session } = req.query;
  if (!term || !session) {
    res.status(400);
    throw new Error("term and session query parameters are required");
  }

  const termDoc = await Term.findOne({ schoolId: req.schoolId, term, session });
  res.status(200).json({ success: true, data: termDoc });
});

// POST /api/v1/exams  (admin, teacher)
const createExam = asyncHandler(async (req, res) => {
  const { name, term, session, classId, subjectId, maxCA, maxScore, examDate } = req.body;

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
      maxCA: maxCA || 40,
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

module.exports = {
  createExam,
  bulkCreateExams,
  getExams,
  getExamById,
  deactivateExam,
  getTermDates,
  assertClassAccess,
};
