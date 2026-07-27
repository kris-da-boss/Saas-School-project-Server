// Usage: router.post("/students", protect, tenantScope, requireRole("admin"), createStudent)
// Must run AFTER `protect` (needs req.user to already exist).
const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      res.status(403);
      return next(new Error("You do not have permission to perform this action"));
    }
    next();
  };
};

module.exports = requireRole;
