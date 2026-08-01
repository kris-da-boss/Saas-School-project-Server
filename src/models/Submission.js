const mongoose = require("mongoose");
const tenantPlugin = require("../plugins/tenantPlugin");

const submissionSchema = new mongoose.Schema(
  {
    assignmentId: { type: mongoose.Schema.Types.ObjectId, ref: "Assignment", required: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: "StudentProfile", required: true },
    fileUrl: { type: String, default: "" },
    filePublicId: { type: String, default: "" },
    submittedAt: { type: Date, default: null },
    grade: { type: Number, default: null },
    feedback: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

submissionSchema.plugin(tenantPlugin);

// One submission per student per assignment - resubmitting updates it
submissionSchema.index({ schoolId: 1, assignmentId: 1, studentId: 1 }, { unique: true });

module.exports = mongoose.model("Submission", submissionSchema);
