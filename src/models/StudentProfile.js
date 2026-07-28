const mongoose = require("mongoose");
const tenantPlugin = require("../plugins/tenantPlugin");

const studentProfileSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    // Duplicated from User.fullName on purpose. Searching/sorting a list
    // endpoint by name is far cheaper against a field on THIS collection
    // than joining back to Users on every request. The cost: whenever
    // fullName changes, we must update both places (see updateStudent).
    // This is a deliberate, common denormalization trade-off in MongoDB.
    fullName: { type: String, required: true, trim: true },
    admissionNo: { type: String, required: true, trim: true },
    dob: { type: Date },
    gender: { type: String, enum: ["male", "female"] },
    // Not wired up until Phase 3 (Classes) — kept here so the shape is
    // already right when that feature arrives.
    classId: { type: mongoose.Schema.Types.ObjectId, ref: "Class", default: null },
    parentIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "ParentProfile" }],
    photoUrl: { type: String, default: "" },
    photoPublicId: { type: String, default: "" }, // needed to replace/delete the Cloudinary asset later
    address: { type: String, trim: true },
    isActive: { type: Boolean, default: true }, // soft-delete flag — see deactivateStudent
  },
  { timestamps: true }
);

studentProfileSchema.plugin(tenantPlugin);

// Admission numbers must be unique within a school, not globally
studentProfileSchema.index({ schoolId: 1, admissionNo: 1 }, { unique: true });

module.exports = mongoose.model("StudentProfile", studentProfileSchema);
