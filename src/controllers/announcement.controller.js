const asyncHandler = require("express-async-handler");
const Announcement = require("../models/Announcement");
const { fanOutAnnouncement } = require("../utils/notifyAudience");
const { getOwnTeacherProfile, getTeacherClassIds } = require("../utils/teacherAccess");
const { buildPagination } = require("../utils/pagination");

// POST /api/v1/announcements  (admin, teacher)
const createAnnouncement = asyncHandler(async (req, res) => {
  const { title, body, classId } = req.body;
  const audience = Array.isArray(req.body.audience)
    ? req.body.audience
    : req.body.audience
    ? [req.body.audience]
    : [];

  if (!title || !body || audience.length === 0) {
    res.status(400);
    throw new Error("title, body and at least one audience role are required");
  }

  if (req.user.role === "teacher") {
    // Teachers can only message their own class's students/parents - not
    // staff, and not the whole school.
    const disallowed = audience.filter((a) => !["student", "parent"].includes(a));
    if (disallowed.length > 0) {
      res.status(403);
      throw new Error("Teachers can only post announcements to students and parents");
    }
    if (!classId) {
      res.status(400);
      throw new Error("Teachers must scope an announcement to one of their own classes");
    }
    const teacherProfile = await getOwnTeacherProfile(req);
    if (!teacherProfile) {
      res.status(404);
      throw new Error("Teacher profile not found for this account");
    }
    const allowedClassIds = await getTeacherClassIds(req.schoolId, teacherProfile._id);
    if (!allowedClassIds.includes(classId)) {
      res.status(403);
      throw new Error("You are not assigned to this class");
    }
  }

  const announcement = await Announcement.create({
    schoolId: req.schoolId,
    title,
    body,
    audience,
    classId: classId || null,
    authorId: req.user.userId,
  });

  // Fan-out happens right away, not lazily on next read - a notification
  // that shows up "eventually" defeats the point of a notification.
  await fanOutAnnouncement(req.schoolId, announcement);

  res.status(201).json({ success: true, data: announcement });
});

// GET /api/v1/announcements  (admin, teacher) - management list, not the
// audience-facing view (see notification.controller.js for that)
const getAnnouncements = asyncHandler(async (req, res) => {
  const { page, limit, skip } = buildPagination(req.query);

  const filter = { isActive: true };
  if (req.query.search) filter.title = new RegExp(req.query.search.trim(), "i");
  // Teachers only manage what they themselves posted; admins see everything.
  if (req.user.role === "teacher") filter.authorId = req.user.userId;

  const [announcements, total] = await Promise.all([
    Announcement.scoped(req.schoolId, filter)
      .populate("classId", "name")
      .populate("authorId", "fullName")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Announcement.scopedCount(req.schoolId, filter),
  ]);

  res.status(200).json({
    success: true,
    data: announcements,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
  });
});

// DELETE /api/v1/announcements/:id  (admin, or the teacher who authored it)
const deactivateAnnouncement = asyncHandler(async (req, res) => {
  const announcement = await Announcement.findOne({ _id: req.params.id, schoolId: req.schoolId });
  if (!announcement) {
    res.status(404);
    throw new Error("Announcement not found");
  }
  if (req.user.role === "teacher" && announcement.authorId.toString() !== req.user.userId) {
    res.status(403);
    throw new Error("You can only remove announcements you posted");
  }

  announcement.isActive = false;
  await announcement.save();

  res.status(200).json({ success: true, message: "Announcement removed" });
});

module.exports = { createAnnouncement, getAnnouncements, deactivateAnnouncement };
