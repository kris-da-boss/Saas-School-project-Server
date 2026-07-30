const mongoose = require("mongoose");
const tenantPlugin = require("../plugins/tenantPlugin");

const parentProfileSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    fullName: { type: String, required: true, trim: true }, // denormalized, same trade-off as elsewhere
    // References EXISTING StudentProfile documents. Nothing here creates a
    // student — a parent is always linked to children who already exist.
    childrenIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "StudentProfile" }],
    phone: { type: String, trim: true },
    occupation: { type: String, trim: true },
    photoUrl: { type: String, default: "" },
    photoPublicId: { type: String, default: "" },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

parentProfileSchema.plugin(tenantPlugin);

module.exports = mongoose.model("ParentProfile", parentProfileSchema);
