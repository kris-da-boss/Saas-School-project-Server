const mongoose = require("mongoose");
const tenantPlugin = require("../plugins/tenantPlugin");

const teacherProfileSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    // Denormalized from User.fullName for fast search/sort - same
    // trade-off as StudentProfile. Kept in sync in updateTeacher.
    fullName: { type: String, required: true, trim: true },
    staffId: { type: String, required: true, trim: true },
    // Not wired up until Phase 3 (Subjects/Classes) — shape is ready for it
    subjectIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Subject" }],
    classIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Class" }],
    qualifications: { type: String, trim: true },
    phone: { type: String, trim: true },
    photoUrl: { type: String, default: "" },
    photoPublicId: { type: String, default: "" },
    isActive: { type: Boolean, default: true }, // soft-delete flag
  },
  { timestamps: true }
);

teacherProfileSchema.plugin(tenantPlugin);

// Staff IDs must be unique within a school, not globally
teacherProfileSchema.index({ schoolId: 1, staffId: 1 }, { unique: true });

module.exports = mongoose.model("TeacherProfile", teacherProfileSchema);
