// Must run AFTER `protect` (needs req.user to already exist).
// Reads schoolId off the verified token and attaches it as req.schoolId,
// which every controller then uses for tenant-scoped queries.
const tenantScope = (req, res, next) => {
  if (req.user.role === "superadmin") {
    req.schoolId = null; // superadmin isn't scoped to any single school
    return next();
  }

  if (!req.user.schoolId) {
    res.status(403);
    return next(new Error("This account has no school associated with it"));
  }

  req.schoolId = req.user.schoolId;
  next();
};

module.exports = tenantScope;
