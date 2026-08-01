const mongoose = require("mongoose");
const tenantPlugin = require("../plugins/tenantPlugin");

const assignmentSchema = new mongoose.Schema(
  {
    classId: { type: mongoose.Schema.Types.ObjectId, ref: "Class", required: true },
    subjectId: { type: mongoose.Schema.Types.ObjectId, ref: "Subject", required: true },
    // Who set this assignment. Optional because an admin might create one
    // on a teacher's behalf.
    teacherId: { type: mongoose.Schema.Types.ObjectId, ref: "TeacherProfile", default: null },
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    dueDate: { type: Date, required: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

assignmentSchema.plugin(tenantPlugin);

module.exports = mongoose.model("Assignment", assignmentSchema);
