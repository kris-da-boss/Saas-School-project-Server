const asyncHandler = require("express-async-handler");
const Attendance = require("../models/Attendance");
const Class = require("../models/Class");
const StudentProfile = require("../models/StudentProfile");

const STATUSES = ["present", "absent", "late", "excused"];

// Normalizes any date input to UTC midnight, so "2024-05-01" always maps to
// the exact same stored value regardless of what time component (if any)
// was attached - this is what makes the unique index actually work as
// "one record per calendar day" rather than accidentally allowing near-
// duplicate documents a few milliseconds apart.
function normalizeDate(input) {
  const d = new Date(input);
  if (isNaN(d.getTime())) return null;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

// GET /api/v1/attendance/class/:classId?date=YYYY-MM-DD  (admin, teacher)
// Returns the FULL class roster merged with that date's attendance, so the
// frontend always has something to render - a blank form for a new day, or
// a pre-filled one for a day that's already been marked.
const getAttendanceForDate = asyncHandler(async (req, res) => {
  const date = normalizeDate(req.query.date);
  if (!date) {
    res.status(400);
    throw new Error("A valid date query parameter is required");
  }

  const classDoc = await Class.findOne({ _id: req.params.classId, schoolId: req.schoolId });
  if (!classDoc) {
    res.status(404);
    throw new Error("Class not found");
  }

  const roster = await StudentProfile.find({
    schoolId: req.schoolId,
    classId: classDoc._id,
    isActive: true,
  })
    .select("fullName admissionNo")
    .sort({ fullName: 1 });

  const attendance = await Attendance.findOne({ schoolId: req.schoolId, classId: classDoc._id, date });
  const statusMap = new Map((attendance?.records || []).map((r) => [r.studentId.toString(), r.status]));

  const rosterWithStatus = roster.map((s) => ({
    studentId: s._id,
    fullName: s.fullName,
    admissionNo: s.admissionNo,
    status: statusMap.get(s._id.toString()) || null, // null = not yet marked
  }));

  res.status(200).json({
    success: true,
    data: { date, classId: classDoc._id, roster: rosterWithStatus, alreadyMarked: !!attendance },
  });
});

// POST /api/v1/attendance/class/:classId  (admin, teacher)
// Body: { date, records: [{ studentId, status }] }
// Upserted: resubmitting the same class+date UPDATES the existing record
// rather than throwing a duplicate-key error - taking attendance twice in a
// day (e.g. a correction) should just work.
const markAttendance = asyncHandler(async (req, res) => {
  const date = normalizeDate(req.body.date);
  if (!date) {
    res.status(400);
    throw new Error("A valid date is required");
  }

  const records = req.body.records;
  if (!Array.isArray(records) || records.length === 0) {
    res.status(400);
    throw new Error("records must be a non-empty array");
  }
  for (const r of records) {
    if (!STATUSES.includes(r.status)) {
      res.status(400);
      throw new Error(`Invalid status "${r.status}"`);
    }
  }

  const classDoc = await Class.findOne({ _id: req.params.classId, schoolId: req.schoolId });
  if (!classDoc) {
    res.status(404);
    throw new Error("Class not found");
  }

  // Never trust student IDs blindly - confirm every one actually belongs to
  // this class at this school before recording anything against them.
  const studentIds = records.map((r) => r.studentId);
  const validCount = await StudentProfile.countDocuments({
    _id: { $in: studentIds },
    schoolId: req.schoolId,
    classId: classDoc._id,
  });
  if (validCount !== studentIds.length) {
    res.status(400);
    throw new Error("One or more students do not belong to this class");
  }

  const attendance = await Attendance.findOneAndUpdate(
    { schoolId: req.schoolId, classId: classDoc._id, date },
    {
      schoolId: req.schoolId,
      classId: classDoc._id,
      date,
      records: records.map((r) => ({ studentId: r.studentId, status: r.status })),
      markedBy: req.user.userId,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  res.status(200).json({ success: true, data: attendance });
});

// GET /api/v1/attendance/class/:classId/dates  (admin, teacher)
// A lightweight history list: which dates have been marked, with a quick
// present/total count - enough for a browsable history without needing a
// full calendar UI yet.
const getAttendanceDates = asyncHandler(async (req, res) => {
  const classDoc = await Class.findOne({ _id: req.params.classId, schoolId: req.schoolId });
  if (!classDoc) {
    res.status(404);
    throw new Error("Class not found");
  }

  const records = await Attendance.find({ schoolId: req.schoolId, classId: classDoc._id })
    .select("date records")
    .sort({ date: -1 })
    .limit(60);

  const summary = records.map((r) => ({
    date: r.date,
    presentCount: r.records.filter((x) => x.status === "present").length,
    totalCount: r.records.length,
  }));

  res.status(200).json({ success: true, data: summary });
});

module.exports = { getAttendanceForDate, markAttendance, getAttendanceDates };
