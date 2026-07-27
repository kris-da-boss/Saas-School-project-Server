const mongoose = require("mongoose");

/**
 * School = a tenant.
 * subdomain -> used for subdomain-based tenant resolution (maison.yourapp.com)
 * schoolCode -> human-typed fallback (used on raw preview URLs / manual login)
 */
const schoolSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, "School name is required"], trim: true },
    subdomain: {
      type: String,
      required: [true, "Subdomain is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[a-z0-9-]+$/, "Subdomain can only contain lowercase letters, numbers, and hyphens"],
    },
    schoolCode: {
      type: String,
      required: [true, "School code is required"],
      unique: true,
      uppercase: true,
      trim: true,
    },
    logoUrl: { type: String, default: "" },
    themeColor: { type: String, default: "#0f172a" },
    contactEmail: { type: String, trim: true, lowercase: true },
    plan: { type: String, enum: ["trial", "basic", "pro"], default: "trial" },
    billingStatus: {
      type: String,
      enum: ["active", "suspended", "cancelled"],
      default: "active", // Super Admin flips this to "suspended" for non-payment
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("School", schoolSchema);
