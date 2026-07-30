const mongoose = require("mongoose");
const tenantPlugin = require("../plugins/tenantPlugin");

const classSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, "Class name is required"], trim: true }, // e.g. "JSS2A"
    classTeacherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TeacherProfile",
      default: null,
    },
    capacity: { type: Number, default: null },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

classSchema.plugin(tenantPlugin);

// Class names unique within a school, not globally
classSchema.index({ schoolId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model("Class", classSchema);
