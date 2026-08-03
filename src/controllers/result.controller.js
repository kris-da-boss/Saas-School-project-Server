const asyncHandler = require("express-async-handler");
const mongoose = require("mongoose");
const Exam = require("../models/Exam");
const Result = require("../models/Result");
const StudentProfile = require("../models/StudentProfile");
const ParentProfile = require("../models/ParentProfile");
const School = require("../models/School");
const Term = require("../models/Term");
const Attendance = require("../models/Attendance");
const ReportCardRemark = require("../models/ReportCardRemark");
const computeGrade = require("../utils/gradeScale");
const generateReportCardPdf = require("../utils/reportCardPdf");
const { getOwnTeacherProfile, getTeacherClassIds } = require("../utils/teacherAccess");

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

// Who can view a given student's report card:
//   admin    - anyone in the school
//   teacher  - only students in one of their own classes
//   student  - only themselves
//   parent   - only their own linked children
async function assertReportCardAccess(req, res, student) {
  const role = req.user.role;

  if (role === "admin") return;

  if (role === "teacher") {
    const teacherProfile = await getOwnTeacherProfile(req);
    if (!teacherProfile) {
      res.status(404);
      throw new Error("Teacher profile not found for this account");
    }
    const allowedClassIds = await getTeacherClassIds(req.schoolId, teacherProfile._id);
    if (!student.classId || !allowedClassIds.includes(student.classId.toString())) {
      res.status(403);
      throw new Error("You are not assigned to this student's class");
    }
    return;
  }

  if (role === "student") {
    const own = await StudentProfile.findOne({ schoolId: req.schoolId, userId: req.user.userId });
    if (!own || own._id.toString() !== student._id.toString()) {
      res.status(403);
      throw new Error("You can only view your own report card");
    }
    return;
  }

  if (role === "parent") {
    const own = await ParentProfile.findOne({ schoolId: req.schoolId, userId: req.user.userId });
    if (!own || !own.childrenIds.some((id) => id.toString() === student._id.toString())) {
      res.status(403);
      throw new Error("You can only view your own child's report card");
    }
    return;
  }

  res.status(403);
  throw new Error("Not authorized");
}

// GET /api/v1/exams/:examId/roster  (admin, teacher)
// Same "merge roster with existing records" pattern as attendance/assignments.
const getExamRoster = asyncHandler(async (req, res) => {
  const exam = await Exam.findOne({ _id: req.params.examId, schoolId: req.schoolId });
  if (!exam) {
    res.status(404);
    throw new Error("Exam not found");
  }
  await assertClassAccess(req, res, exam.classId);

  const roster = await StudentProfile.find({
    schoolId: req.schoolId,
    classId: exam.classId,
    isActive: true,
  })
    .select("fullName admissionNo")
    .sort({ fullName: 1 });

  const results = await Result.find({ schoolId: req.schoolId, examId: exam._id });
  const resultMap = new Map(results.map((r) => [r.studentId.toString(), r]));

  const rosterWithScores = roster.map((s) => {
    const result = resultMap.get(s._id.toString());
    return {
      studentId: s._id,
      fullName: s.fullName,
      admissionNo: s.admissionNo,
      caScore: result?.caScore ?? null,
      score: result?.score ?? null,
      grade: result?.grade ?? null,
    };
  });

  res.status(200).json({ success: true, data: { exam, roster: rosterWithScores } });
});

// POST /api/v1/exams/:examId/results  (admin, teacher)
// Body: { records: [{ studentId, score }] } - bulk upsert, same batch
// pattern as attendance submission.
const submitResults = asyncHandler(async (req, res) => {
  const exam = await Exam.findOne({ _id: req.params.examId, schoolId: req.schoolId });
  if (!exam) {
    res.status(404);
    throw new Error("Exam not found");
  }
  await assertClassAccess(req, res, exam.classId);

  const records = req.body.records;
  if (!Array.isArray(records) || records.length === 0) {
    res.status(400);
    throw new Error("records must be a non-empty array");
  }

  const maxExamScore = exam.maxScore - exam.maxCA;
  for (const r of records) {
    const caScore = r.caScore ?? 0;
    if (typeof r.score !== "number" || r.score < 0 || r.score > maxExamScore) {
      res.status(400);
      throw new Error(`Exam score must be a number between 0 and ${maxExamScore}`);
    }
    if (typeof caScore !== "number" || caScore < 0 || caScore > exam.maxCA) {
      res.status(400);
      throw new Error(`CA score must be a number between 0 and ${exam.maxCA}`);
    }
  }

  const studentIds = records.map((r) => r.studentId);
  const validCount = await StudentProfile.countDocuments({
    _id: { $in: studentIds },
    schoolId: req.schoolId,
    classId: exam.classId,
  });
  if (validCount !== studentIds.length) {
    res.status(400);
    throw new Error("One or more students do not belong to this class");
  }

  const ops = records.map((r) => {
    const caScore = r.caScore ?? 0;
    const total = caScore + r.score;
    const { grade, remark } = computeGrade(total, exam.maxScore);
    return {
      updateOne: {
        filter: { schoolId: req.schoolId, examId: exam._id, studentId: r.studentId },
        update: {
          $set: {
            schoolId: req.schoolId,
            examId: exam._id,
            studentId: r.studentId,
            classId: exam.classId,
            subjectId: exam.subjectId,
            term: exam.term,
            session: exam.session,
            caScore,
            score: r.score,
            maxScore: exam.maxScore,
            grade,
            remark,
          },
        },
        upsert: true,
      },
    };
  });

  await Result.bulkWrite(ops);

  res.status(200).json({ success: true, message: "Results saved" });
});

// Shared by both the JSON view and the PDF - every subject result for a
// student in a term/session, plus their rank within the class, attendance
// for that term (if the term's dates have been set), and any comments.
async function buildReportCardData(schoolId, student, term, session) {
  const schoolObjectId = new mongoose.Types.ObjectId(schoolId);

  const [school, results, termDoc, remark] = await Promise.all([
    School.findById(schoolId).select("name logoUrl"),
    Result.find({ schoolId, studentId: student._id, term, session })
      .populate("subjectId", "name code")
      .populate("examId", "maxCA"),
    Term.findOne({ schoolId, term, session }),
    ReportCardRemark.findOne({ schoolId, studentId: student._id, term, session }),
  ]);

  const totalScore = results.reduce((sum, r) => sum + r.caScore + r.score, 0);
  const totalMax = results.reduce((sum, r) => sum + r.maxScore, 0);
  const average = totalMax > 0 ? (totalScore / totalMax) * 100 : 0;
  const overallGrade = totalMax > 0 ? computeGrade(totalScore, totalMax).grade : null;

  // Class rank: total (CA + exam) per student across the same
  // class+term+session - previously this only summed the exam component,
  // silently ignoring CA scores when ranking. Aggregation needs a real
  // ObjectId, not the string schoolId a JWT hands us.
  const classTotals = student.classId
    ? await Result.aggregate([
        { $match: { schoolId: schoolObjectId, classId: student.classId, term, session } },
        { $group: { _id: "$studentId", total: { $sum: { $add: ["$caScore", "$score"] } } } },
        { $sort: { total: -1 } },
      ])
    : [];
  const positionIndex = classTotals.findIndex((c) => c._id.toString() === student._id.toString());

  // Attendance summary: only possible if this term's date range has been
  // set (via the exam-scheduling form). Without it, we have no way to know
  // which Attendance dates belong to "First Term 2026/2027" - Attendance
  // only stores a raw date, not a term label. Soft-fails to null rather
  // than blocking the whole report card.
  let attendanceSummary = null;
  if (termDoc?.startDate && termDoc?.endDate && student.classId) {
    const attendanceDocs = await Attendance.find({
      schoolId,
      classId: student.classId,
      date: { $gte: termDoc.startDate, $lte: termDoc.endDate },
    }).select("records");

    const tally = { present: 0, absent: 0, late: 0, excused: 0 };
    let totalDays = 0;
    for (const doc of attendanceDocs) {
      const record = doc.records.find((r) => r.studentId.toString() === student._id.toString());
      if (record?.status) {
        tally[record.status] = (tally[record.status] || 0) + 1;
        totalDays += 1;
      }
    }
    attendanceSummary = { ...tally, totalDays };
  }

  return {
    school: school ? { name: school.name, logoUrl: school.logoUrl } : null,
    student: {
      id: student._id,
      fullName: student.fullName,
      admissionNo: student.admissionNo,
      photoUrl: student.photoUrl,
      className: student.classId?.name || null,
    },
    term,
    session,
    subjects: results.map((r) => {
      const maxCA = r.examId?.maxCA ?? 0;
      return {
        subject: r.subjectId.name,
        code: r.subjectId.code,
        caScore: r.caScore,
        maxCA,
        examScore: r.score,
        maxExamScore: r.maxScore - maxCA,
        total: r.caScore + r.score,
        maxScore: r.maxScore,
        grade: r.grade,
        remark: r.remark,
      };
    }),
    totalScore,
    totalMax,
    average: Math.round(average * 10) / 10,
    overallGrade,
    position: positionIndex >= 0 ? positionIndex + 1 : null,
    classSize: classTotals.length,
    attendance: attendanceSummary,
    teacherComment: remark?.teacherComment || "",
    principalComment: remark?.principalComment || "",
  };
}

// GET /api/v1/results/report-card/:studentId?term=&session=
const getReportCard = asyncHandler(async (req, res) => {
  const { term, session } = req.query;
  if (!term || !session) {
    res.status(400);
    throw new Error("term and session query parameters are required");
  }

  const student = await StudentProfile.findOne({ _id: req.params.studentId, schoolId: req.schoolId }).populate(
    "classId",
    "name"
  );
  if (!student) {
    res.status(404);
    throw new Error("Student not found");
  }
  await assertReportCardAccess(req, res, student);

  const reportCard = await buildReportCardData(req.schoolId, student, term, session);
  res.status(200).json({ success: true, data: reportCard });
});

// GET /api/v1/results/report-card/:studentId/pdf?term=&session=
// Generated fresh on every request - NOT a persisted snapshot. If results
// change later, downloading again reflects the update. A future version
// could store an official signed-off snapshot for historical record-keeping,
// but that's a deliberate scope cut for now.
const downloadReportCardPdf = asyncHandler(async (req, res) => {
  const { term, session } = req.query;
  if (!term || !session) {
    res.status(400);
    throw new Error("term and session query parameters are required");
  }

  const student = await StudentProfile.findOne({ _id: req.params.studentId, schoolId: req.schoolId }).populate(
    "classId",
    "name"
  );
  if (!student) {
    res.status(404);
    throw new Error("Student not found");
  }
  await assertReportCardAccess(req, res, student);

  const reportCard = await buildReportCardData(req.schoolId, student, term, session);

  // Nothing to put in a PDF if no results have been recorded yet - a blank
  // "report card" with no scores isn't a real document, and silently
  // downloading one is confusing rather than helpful.
  if (reportCard.subjects.length === 0) {
    res.status(404);
    throw new Error("No results have been recorded for this term yet — nothing to download");
  }

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${student.fullName.replace(/\s+/g, "_")}_${term}_${session}.pdf"`
  );

  await generateReportCardPdf(reportCard, res); // streams the PDF directly into the response
});

// GET /api/v1/results/report-card/mine/view?term=&session=  (student only)
// A student's JWT only has userId, not their StudentProfile _id - this
// resolves it for them so the frontend doesn't need a separate lookup step.
const getMyReportCard = asyncHandler(async (req, res) => {
  const { term, session } = req.query;
  if (!term || !session) {
    res.status(400);
    throw new Error("term and session query parameters are required");
  }

  const student = await StudentProfile.findOne({ schoolId: req.schoolId, userId: req.user.userId }).populate(
    "classId",
    "name"
  );
  if (!student) {
    res.status(404);
    throw new Error("Student profile not found for this account");
  }

  const reportCard = await buildReportCardData(req.schoolId, student, term, session);
  res.status(200).json({ success: true, data: reportCard });
});

// GET /api/v1/results/report-card/mine/pdf?term=&session=  (student only)
const downloadMyReportCardPdf = asyncHandler(async (req, res) => {
  const { term, session } = req.query;
  if (!term || !session) {
    res.status(400);
    throw new Error("term and session query parameters are required");
  }

  const student = await StudentProfile.findOne({ schoolId: req.schoolId, userId: req.user.userId }).populate(
    "classId",
    "name"
  );
  if (!student) {
    res.status(404);
    throw new Error("Student profile not found for this account");
  }

  const reportCard = await buildReportCardData(req.schoolId, student, term, session);

  if (reportCard.subjects.length === 0) {
    res.status(404);
    throw new Error("No results have been recorded for this term yet — nothing to download");
  }

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${student.fullName.replace(/\s+/g, "_")}_${term}_${session}.pdf"`
  );
  await generateReportCardPdf(reportCard, res);
});

// PATCH /api/v1/results/report-card/:studentId/remarks  (admin, teacher)
// Body: { term, session, teacherComment?, principalComment? }
// A teacher may only set the teacher's comment, and only for their own
// class's students. Admin can set either field for anyone.
const saveReportCardRemarks = asyncHandler(async (req, res) => {
  const { term, session, teacherComment, principalComment } = req.body;
  if (!term || !session) {
    res.status(400);
    throw new Error("term and session are required");
  }

  const student = await StudentProfile.findOne({ _id: req.params.studentId, schoolId: req.schoolId });
  if (!student) {
    res.status(404);
    throw new Error("Student not found");
  }

  const update = { schoolId: req.schoolId, studentId: student._id, classId: student.classId, term, session };

  if (req.user.role === "teacher") {
    await assertClassAccess(req, res, student.classId);
    if (teacherComment !== undefined) update.teacherComment = teacherComment;
    if (principalComment !== undefined) {
      res.status(403);
      throw new Error("Only an admin can set the principal's comment");
    }
  } else if (req.user.role === "admin") {
    if (teacherComment !== undefined) update.teacherComment = teacherComment;
    if (principalComment !== undefined) update.principalComment = principalComment;
  } else {
    res.status(403);
    throw new Error("Not authorized");
  }

  const remark = await ReportCardRemark.findOneAndUpdate(
    { schoolId: req.schoolId, studentId: student._id, term, session },
    { $set: update },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  res.status(200).json({ success: true, data: remark });
});

module.exports = {
  getExamRoster,
  submitResults,
  getReportCard,
  downloadReportCardPdf,
  getMyReportCard,
  downloadMyReportCardPdf,
  saveReportCardRemarks,
};
