const TeacherProfile = require("../models/TeacherProfile");
const Class = require("../models/Class");
const Timetable = require("../models/Timetable");

// Resolves the calling teacher's own TeacherProfile from their userId - a
// teacher's JWT only carries userId/role/schoolId, not their profile id.
async function getOwnTeacherProfile(req) {
  return TeacherProfile.findOne({ schoolId: req.schoolId, userId: req.user.userId });
}

// A teacher is considered "assigned" to a class in two ways:
//   1. They're the class's homeroom/form teacher (Class.classTeacherId)
//   2. They teach at least one lesson on that class's timetable
//      (Timetable.entries[].teacherId)
// Returns an array of Class _id strings this teacher may act on.
async function getTeacherClassIds(schoolId, teacherProfileId) {
  const [homeroomClasses, timetablesWithThisTeacher] = await Promise.all([
    Class.find({ schoolId, classTeacherId: teacherProfileId }).select("_id"),
    Timetable.find({ schoolId, "entries.teacherId": teacherProfileId }).select("classId"),
  ]);

  const ids = new Set([
    ...homeroomClasses.map((c) => c._id.toString()),
    ...timetablesWithThisTeacher.map((t) => t.classId.toString()),
  ]);
  return [...ids];
}

module.exports = { getOwnTeacherProfile, getTeacherClassIds };
