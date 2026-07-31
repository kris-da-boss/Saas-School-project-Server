const mongoose = require("mongoose");
const tenantPlugin = require("../plugins/tenantPlugin");

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

// Embedded, not a separate collection: a timetable entry has no identity or
// use outside its class's schedule, and we always read/write the whole
// schedule together. That's the classic signal to embed rather than
// reference. Each entry still gets its own _id (Mongoose default) so we can
// target one lesson slot for edit/delete without touching the rest.
const entrySchema = new mongoose.Schema({
  day: { type: String, enum: DAYS, required: true },
  startTime: { type: String, required: true }, // 24-hour "HH:MM", e.g. "08:00"
  endTime: { type: String, required: true },
  subjectId: { type: mongoose.Schema.Types.ObjectId, ref: "Subject", required: true },
  teacherId: { type: mongoose.Schema.Types.ObjectId, ref: "TeacherProfile", default: null },
});

const timetableSchema = new mongoose.Schema(
  {
    classId: { type: mongoose.Schema.Types.ObjectId, ref: "Class", required: true, unique: true },
    entries: [entrySchema],
  },
  { timestamps: true }
);

timetableSchema.plugin(tenantPlugin);

const Timetable = mongoose.model("Timetable", timetableSchema);
Timetable.DAYS = DAYS;

module.exports = Timetable;
