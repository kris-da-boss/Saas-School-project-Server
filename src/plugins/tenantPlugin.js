const mongoose = require("mongoose");

/**
 * tenantPlugin
 * Adds a required schoolId field to any schema that uses it, plus a
 * `scoped(schoolId)` static so every tenant-owned model is always queried
 * the same, safe way:
 *
 *    const students = await StudentProfile.scoped(req.schoolId).find();
 *
 * We start applying this plugin from Phase 2 onward (Class, Subject,
 * Attendance, Assignment, etc.). School and User are NOT wrapped in this
 * plugin — School IS the tenant, and User has the special superadmin
 * (null schoolId) case handled directly in its own schema.
 */
module.exports = function tenantPlugin(schema) {
  schema.add({
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
      index: true,
    },
  });

  schema.statics.scoped = function (schoolId, extraFilter = {}) {
    if (!schoolId) {
      throw new Error("scoped() called without a schoolId — tenant isolation broken");
    }
    return this.find({ schoolId, ...extraFilter });
  };

  // Same idea, for counting (used alongside .scoped() for pagination totals)
  schema.statics.scopedCount = function (schoolId, extraFilter = {}) {
    if (!schoolId) {
      throw new Error("scopedCount() called without a schoolId — tenant isolation broken");
    }
    return this.countDocuments({ schoolId, ...extraFilter });
  };
};
