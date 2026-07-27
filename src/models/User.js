const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

/**
 * User = login identity only (auth concerns live here).
 * Role-specific data (class, subjects, children, etc.) lives in separate
 * profile collections (StudentProfile / TeacherProfile / ParentProfile)
 * linked back to this document by userId. Keeps this model small and stable.
 */
const userSchema = new mongoose.Schema(
  {
    // schoolId is intentionally NOT required here: a superadmin belongs to
    // the platform, not to any single school, so it stays null for that role.
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: function () {
        return this.role !== "superadmin";
      },
      default: null,
      index: true,
    },
    fullName: { type: String, required: [true, "Name is required"], trim: true },
    email: { type: String, required: [true, "Email is required"], trim: true, lowercase: true },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: 6,
      select: false, // never returned by default on find queries
    },
    role: {
      type: String,
      enum: ["superadmin", "admin", "teacher", "student", "parent"],
      required: true,
    },
    status: { type: String, enum: ["active", "suspended"], default: "active" },
    lastLogin: { type: Date, default: null },
  },
  { timestamps: true }
);

// Email is unique per school, not globally — two different schools can each
// have their own "admin@school.com". Superadmins (schoolId: null) are checked
// for email uniqueness in application code instead, to avoid Mongo's
// null-in-unique-compound-index edge cases.
userSchema.index({ schoolId: 1, email: 1 }, { unique: true });

// Hash the password automatically whenever it's set or changed
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Instance method used during login to check the submitted password
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model("User", userSchema);
