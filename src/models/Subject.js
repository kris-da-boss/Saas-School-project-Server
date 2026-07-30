const mongoose = require("mongoose");
const tenantPlugin = require("../plugins/tenantPlugin");

const subjectSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, "Subject name is required"], trim: true },
    code: { type: String, required: [true, "Subject code is required"], trim: true, uppercase: true },
    // Which classes currently offer this subject. We deliberately do NOT
    // also store a "subjectIds" array on Class — asking "what subjects does
    // this class take?" is answered by querying Subject.find({classIds}),
    // which stays correct automatically since there's only one array to update.
    classIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Class" }],
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

subjectSchema.plugin(tenantPlugin);

// Subject codes unique within a school, not globally
subjectSchema.index({ schoolId: 1, code: 1 }, { unique: true });

module.exports = mongoose.model("Subject", subjectSchema);
