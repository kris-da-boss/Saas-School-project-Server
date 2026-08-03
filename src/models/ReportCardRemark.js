const mongoose = require("mongoose");
const tenantPlugin = require("../plugins/tenantPlugin");

// Everything else on a report card (subjects, totals, position, attendance)
// is computed live from Results/Attendance at request time - see the note
// in result.controller.js. Comments are the one exception: they're
// free-text authored by a person, not derivable from other data, so they
// need an actual place to live.
const reportCardRemarkSchema = new mongoose.Schema(
  {
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: "StudentProfile", required: true },
    classId: { type: mongoose.Schema.Types.ObjectId, ref: "Class", required: true },
    term: { type: String, required: true },
    session: { type: String, required: true },
    teacherComment: { type: String, trim: true, default: "" },
    principalComment: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

reportCardRemarkSchema.plugin(tenantPlugin);
reportCardRemarkSchema.index({ schoolId: 1, studentId: 1, term: 1, session: 1 }, { unique: true });

module.exports = mongoose.model("ReportCardRemark", reportCardRemarkSchema);
