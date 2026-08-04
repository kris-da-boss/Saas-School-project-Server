const mongoose = require("mongoose");
const tenantPlugin = require("../plugins/tenantPlugin");

const notificationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: { type: String, enum: ["announcement"], default: "announcement" },
    announcementId: { type: mongoose.Schema.Types.ObjectId, ref: "Announcement", default: null },
    isRead: { type: Boolean, default: false },
  },
  { timestamps: true }
);

notificationSchema.plugin(tenantPlugin);

module.exports = mongoose.model("Notification", notificationSchema);
