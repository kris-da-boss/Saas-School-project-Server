const mongoose = require("mongoose");
const tenantPlugin = require("../plugins/tenantPlugin");

const TERMS = ["First Term", "Second Term", "Third Term"];

const examSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true }, // e.g. "First Term Examination"
    term: { type: String, enum: TERMS, required: true },
    session: { type: String, required: true, trim: true }, // e.g. "2025/2026"
    classId: { type: mongoose.Schema.Types.ObjectId, ref: "Class", required: true },
    subjectId: { type: mongoose.Schema.Types.ObjectId, ref: "Subject", required: true },
    // Standard report card breakdown: maxScore is the COMBINED total (e.g.
    // 100); maxCA is how much of that total the CA (continuous assessment)
    // portion is worth (e.g. 40, leaving 60 for the exam itself).
    maxCA: { type: Number, default: 40 },
    maxScore: { type: Number, default: 100 },
    examDate: { type: Date },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

examSchema.plugin(tenantPlugin);

// One exam sitting per class+subject+term+session - stops an admin from
// accidentally creating two "First Term Maths exams" for the same class.
examSchema.index({ schoolId: 1, classId: 1, subjectId: 1, term: 1, session: 1 }, { unique: true });

const Exam = mongoose.model("Exam", examSchema);
Exam.TERMS = TERMS;

module.exports = Exam;
