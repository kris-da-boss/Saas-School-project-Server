const User = require("../models/User");
const StudentProfile = require("../models/StudentProfile");
const ParentProfile = require("../models/ParentProfile");
const TeacherProfile = require("../models/TeacherProfile");
const Class = require("../models/Class");
const Timetable = require("../models/Timetable");
const Notification = require("../models/Notification");

// Resolves an announcement's {audience, classId} into the exact set of
// User _ids it should reach.
async function resolveTargetUserIds(schoolId, audience, classId) {
  const userIds = new Set();

  if (audience.includes("admin")) {
    const admins = await User.find({ schoolId, role: "admin" }).select("_id");
    admins.forEach((a) => userIds.add(a._id.toString()));
  }

  if (audience.includes("teacher")) {
    if (classId) {
      // "Teachers of this class" = the homeroom teacher + anyone teaching
      // a lesson on its timetable - same definition used everywhere else
      // in the app for "does this teacher own this class".
      const [classDoc, timetable] = await Promise.all([
        Class.findOne({ schoolId, _id: classId }),
        Timetable.findOne({ schoolId, classId }),
      ]);
      const teacherProfileIds = new Set();
      if (classDoc?.classTeacherId) teacherProfileIds.add(classDoc.classTeacherId.toString());
      timetable?.entries.forEach((e) => e.teacherId && teacherProfileIds.add(e.teacherId.toString()));
      const teachers = await TeacherProfile.find({ _id: { $in: [...teacherProfileIds] } }).select(
        "userId"
      );
      teachers.forEach((t) => userIds.add(t.userId.toString()));
    } else {
      const teachers = await User.find({ schoolId, role: "teacher" }).select("_id");
      teachers.forEach((t) => userIds.add(t._id.toString()));
    }
  }

  if (audience.includes("student")) {
    const filter = { schoolId, isActive: true };
    if (classId) filter.classId = classId;
    const students = await StudentProfile.find(filter).select("userId");
    students.forEach((s) => userIds.add(s.userId.toString()));
  }

  if (audience.includes("parent")) {
    const filter = { schoolId, isActive: true };
    if (classId) {
      const students = await StudentProfile.find({ schoolId, classId, isActive: true }).select("_id");
      filter.childrenIds = { $in: students.map((s) => s._id) };
    }
    const parents = await ParentProfile.find(filter).select("userId");
    parents.forEach((p) => userIds.add(p.userId.toString()));
  }

  return [...userIds];
}

// Fans an announcement out into one Notification per targeted user. This is
// the SINGLE SOURCE OF TRUTH for "who can see this announcement" - a user's
// "my announcements" list is just their own Notification rows, so the
// audience/classId matching logic never has to be re-implemented for
// viewing separately from creation.
async function fanOutAnnouncement(schoolId, announcement) {
  const userIds = await resolveTargetUserIds(schoolId, announcement.audience, announcement.classId);
  if (userIds.length === 0) return;

  await Notification.insertMany(
    userIds.map((userId) => ({
      schoolId,
      userId,
      type: "announcement",
      announcementId: announcement._id,
    }))
  );
}

module.exports = { resolveTargetUserIds, fanOutAnnouncement };
