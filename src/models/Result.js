const mongoose = require("mongoose");
const tenantPlugin = require("../plugins/tenantPlugin");

const resultSchema = new mongoose.Schema(
  {
    examId: { type: mongoose.Schema.Types.ObjectId, ref: "Exam", required: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: "StudentProfile", required: true },
    // Copied from the Exam at write time. A report card needs "every result
    // for this student in this term/session" - without these fields, that
    // query would need to join back to Exam for every single result. Same
    // denormalize-for-read-performance trade-off as StudentProfile.fullName.
    classId: { type: mongoose.Schema.Types.ObjectId, ref: "Class", required: true },
    subjectId: { type: mongoose.Schema.Types.ObjectId, ref: "Subject", required: true },
    term: { type: String, required: true },
    session: { type: String, required: true },
    // Standard school report card breakdown: CA (continuous assessment,
    // e.g. class tests/homework) is scored separately from the exam itself.
    // "score" here is the EXAM component only; total = caScore + score.
    caScore: { type: Number, default: 0, min: 0 },
    score: { type: Number, required: true, min: 0 },
    maxScore: { type: Number, required: true }, // max for the TOTAL (CA + exam combined)
    grade: { type: String },
    remark: { type: String },
  },
  { timestamps: true }
);

resultSchema.plugin(tenantPlugin);

// One result per student per exam - resubmitting a score updates it
resultSchema.index({ schoolId: 1, examId: 1, studentId: 1 }, { unique: true });
// Supports the report card's main query: all of a student's results for a term
resultSchema.index({ schoolId: 1, studentId: 1, term: 1, session: 1 });

module.exports = mongoose.model("Result", resultSchema);
