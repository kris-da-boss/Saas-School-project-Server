const mongoose = require("mongoose");
const tenantPlugin = require("../plugins/tenantPlugin");

// A term applies school-wide, not per-class - "First Term 2026/2027" starts
// and ends on the same dates regardless of which class you're in. This is
// what lets a report card compute an accurate attendance summary: Attendance
// documents only store a raw date, with no idea which term that date falls
// in, so we need this date range to translate "First Term 2026/2027" into
// an actual [start, end] window to query attendance against.
const termSchema = new mongoose.Schema(
  {
    term: { type: String, required: true },
    session: { type: String, required: true, trim: true },
    startDate: { type: Date },
    endDate: { type: Date },
  },
  { timestamps: true }
);

termSchema.plugin(tenantPlugin);
termSchema.index({ schoolId: 1, term: 1, session: 1 }, { unique: true });

module.exports = mongoose.model("Term", termSchema);
