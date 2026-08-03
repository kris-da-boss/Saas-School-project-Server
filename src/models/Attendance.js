const mongoose = require("mongoose");
const tenantPlugin = require("../plugins/tenantPlugin");

// _id: false here (unlike Timetable's entries) because these records are
// always replaced as a whole batch when attendance is (re)submitted for a
// day - nothing ever targets a single record by its own id.
const recordSchema = new mongoose.Schema(
  {
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: "StudentProfile", required: true },
    status: { type: String, enum: ["present", "absent", "late", "excused"], required: true },
  },
  { _id: false }
);

const attendanceSchema = new mongoose.Schema(
  {
    classId: { type: mongoose.Schema.Types.ObjectId, ref: "Class", required: true },
    date: { type: Date, required: true }, // always normalized to UTC midnight - see controller
    // Optional (older records won't have these) but going forward this is
    // what lets a report card compute a real attendance summary for a
    // specific term/session, instead of guessing from a date range.
    term: { type: String, default: null },
    session: { type: String, default: null },
    records: [recordSchema],
    markedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

attendanceSchema.plugin(tenantPlugin);

// One attendance document per class per day
attendanceSchema.index({ schoolId: 1, classId: 1, date: 1 }, { unique: true });
// Supports the report card's attendance-summary query
attendanceSchema.index({ schoolId: 1, classId: 1, term: 1, session: 1 });

module.exports = mongoose.model("Attendance", attendanceSchema);
