const mongoose = require("mongoose");
const tenantPlugin = require("../plugins/tenantPlugin");

const announcementSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    body: { type: String, required: true, trim: true },
    audience: [{ type: String, enum: ["admin", "teacher", "student", "parent"], required: true }],
    // null = school-wide; set = scoped to one class (e.g. a teacher's homework reminder)
    classId: { type: mongoose.Schema.Types.ObjectId, ref: "Class", default: null },
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

announcementSchema.plugin(tenantPlugin);

module.exports = mongoose.model("Announcement", announcementSchema);
