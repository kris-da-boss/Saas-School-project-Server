const asyncHandler = require("express-async-handler");
const Timetable = require("../models/Timetable");
const Class = require("../models/Class");
const Subject = require("../models/Subject");
const TeacherProfile = require("../models/TeacherProfile");
const StudentProfile = require("../models/StudentProfile");

// "08:00" -> 480 (minutes since midnight) - makes overlap comparison a
// simple numeric check instead of parsing strings repeatedly.
function toMinutes(time) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function rangesOverlap(startA, endA, startB, endB) {
  return toMinutes(startA) < toMinutes(endB) && toMinutes(startB) < toMinutes(endA);
}

async function findAndPopulate(filter) {
  return Timetable.findOne(filter)
    .populate("entries.subjectId", "name code")
    .populate("entries.teacherId", "fullName staffId");
}

// GET /api/v1/timetables/mine  (student only)
// Resolves the student's own class server-side - same "no id needed, we
// know who you are from the token" pattern as /submissions/mine etc.
const getMyTimetable = asyncHandler(async (req, res) => {
  const studentProfile = await StudentProfile.findOne({ schoolId: req.schoolId, userId: req.user.userId });
  if (!studentProfile) {
    res.status(404);
    throw new Error("Student profile not found for this account");
  }
  if (!studentProfile.classId) {
    return res.status(200).json({ success: true, data: { entries: [] } });
  }

  let timetable = await findAndPopulate({ classId: studentProfile.classId, schoolId: req.schoolId });
  if (!timetable) {
    return res.status(200).json({ success: true, data: { entries: [] } });
  }

  res.status(200).json({ success: true, data: timetable });
});

// GET /api/v1/timetables/class/:classId  (admin, teacher)
// Returns the timetable for a class, creating an empty one on first request.
const getTimetableForClass = asyncHandler(async (req, res) => {
  const classDoc = await Class.findOne({ _id: req.params.classId, schoolId: req.schoolId });
  if (!classDoc) {
    res.status(404);
    throw new Error("Class not found");
  }

  let timetable = await findAndPopulate({ classId: classDoc._id, schoolId: req.schoolId });

  if (!timetable) {
    timetable = await Timetable.create({ schoolId: req.schoolId, classId: classDoc._id, entries: [] });
  }

  res.status(200).json({ success: true, data: timetable });
});

// POST /api/v1/timetables/class/:classId/entries  (admin only)
const addEntry = asyncHandler(async (req, res) => {
  const { day, startTime, endTime, subjectId, teacherId } = req.body;

  if (!day || !startTime || !endTime || !subjectId) {
    res.status(400);
    throw new Error("day, startTime, endTime and subjectId are required");
  }
  if (toMinutes(startTime) >= toMinutes(endTime)) {
    res.status(400);
    throw new Error("startTime must be before endTime");
  }

  const classDoc = await Class.findOne({ _id: req.params.classId, schoolId: req.schoolId });
  if (!classDoc) {
    res.status(404);
    throw new Error("Class not found");
  }

  const subject = await Subject.findOne({ _id: subjectId, schoolId: req.schoolId });
  if (!subject) {
    res.status(404);
    throw new Error("Subject not found");
  }
  // Data-integrity guardrail: a subject shouldn't appear on a class's
  // timetable unless it's actually been assigned to that class.
  if (!subject.classIds.some((id) => id.equals(classDoc._id))) {
    res.status(409);
    throw new Error(`"${subject.name}" is not assigned to this class yet — update the subject first`);
  }

  if (teacherId) {
    const teacher = await TeacherProfile.findOne({ _id: teacherId, schoolId: req.schoolId });
    if (!teacher) {
      res.status(404);
      throw new Error("Teacher not found");
    }
  }

  let timetable = await Timetable.findOne({ classId: classDoc._id, schoolId: req.schoolId });
  if (!timetable) {
    timetable = await Timetable.create({ schoolId: req.schoolId, classId: classDoc._id, entries: [] });
  }

  // Conflict check #1: this class can't have two lessons at once
  const classConflict = timetable.entries.some(
    (e) => e.day === day && rangesOverlap(e.startTime, e.endTime, startTime, endTime)
  );
  if (classConflict) {
    res.status(409);
    throw new Error("This class already has a lesson scheduled during that time");
  }

  // Conflict check #2: the same teacher can't teach two classes at once.
  // This means looking at every OTHER class's timetable too, not just this
  // one — a genuinely cross-document check.
  if (teacherId) {
    const otherTimetables = await Timetable.find({
      schoolId: req.schoolId,
      classId: { $ne: classDoc._id },
      "entries.teacherId": teacherId,
      "entries.day": day,
    }).populate("classId", "name");

    for (const other of otherTimetables) {
      const conflict = other.entries.find(
        (e) =>
          e.day === day &&
          e.teacherId?.toString() === teacherId &&
          rangesOverlap(e.startTime, e.endTime, startTime, endTime)
      );
      if (conflict) {
        res.status(409);
        throw new Error(`This teacher is already teaching ${other.classId.name} at that time`);
      }
    }
  }

  timetable.entries.push({ day, startTime, endTime, subjectId, teacherId: teacherId || null });
  await timetable.save();

  const populated = await findAndPopulate({ _id: timetable._id });
  res.status(201).json({ success: true, data: populated });
});

// PATCH /api/v1/timetables/class/:classId/entries/:entryId  (admin only)
const updateEntry = asyncHandler(async (req, res) => {
  const classDoc = await Class.findOne({ _id: req.params.classId, schoolId: req.schoolId });
  if (!classDoc) {
    res.status(404);
    throw new Error("Class not found");
  }

  const timetable = await Timetable.findOne({ classId: classDoc._id, schoolId: req.schoolId });
  if (!timetable) {
    res.status(404);
    throw new Error("Timetable not found");
  }

  const entry = timetable.entries.id(req.params.entryId);
  if (!entry) {
    res.status(404);
    throw new Error("Entry not found");
  }

  const { day, startTime, endTime, subjectId, teacherId } = req.body;
  const newDay = day || entry.day;
  const newStart = startTime || entry.startTime;
  const newEnd = endTime || entry.endTime;

  if (toMinutes(newStart) >= toMinutes(newEnd)) {
    res.status(400);
    throw new Error("startTime must be before endTime");
  }

  if (subjectId) {
    const subject = await Subject.findOne({ _id: subjectId, schoolId: req.schoolId });
    if (!subject) {
      res.status(404);
      throw new Error("Subject not found");
    }
    if (!subject.classIds.some((id) => id.equals(classDoc._id))) {
      res.status(409);
      throw new Error(`"${subject.name}" is not assigned to this class yet — update the subject first`);
    }
  }

  // teacherId sent as "" explicitly means "unassign"; not sent at all means
  // "leave whatever was there before" - same pattern used elsewhere.
  const newTeacherId = teacherId !== undefined ? teacherId : entry.teacherId?.toString();

  if (newTeacherId) {
    const teacher = await TeacherProfile.findOne({ _id: newTeacherId, schoolId: req.schoolId });
    if (!teacher) {
      res.status(404);
      throw new Error("Teacher not found");
    }
  }

  // Conflict check #1: same class, excluding this entry itself
  const classConflict = timetable.entries.some(
    (e) =>
      e._id.toString() !== req.params.entryId &&
      e.day === newDay &&
      rangesOverlap(e.startTime, e.endTime, newStart, newEnd)
  );
  if (classConflict) {
    res.status(409);
    throw new Error("This class already has a lesson scheduled during that time");
  }

  // Conflict check #2: same teacher, other classes
  if (newTeacherId) {
    const otherTimetables = await Timetable.find({
      schoolId: req.schoolId,
      classId: { $ne: classDoc._id },
      "entries.teacherId": newTeacherId,
      "entries.day": newDay,
    }).populate("classId", "name");

    for (const other of otherTimetables) {
      const conflict = other.entries.find(
        (e) =>
          e.day === newDay &&
          e.teacherId?.toString() === newTeacherId &&
          rangesOverlap(e.startTime, e.endTime, newStart, newEnd)
      );
      if (conflict) {
        res.status(409);
        throw new Error(`This teacher is already teaching ${other.classId.name} at that time`);
      }
    }
  }

  entry.day = newDay;
  entry.startTime = newStart;
  entry.endTime = newEnd;
  if (subjectId) entry.subjectId = subjectId;
  entry.teacherId = newTeacherId || null;

  await timetable.save();

  const populated = await findAndPopulate({ _id: timetable._id });
  res.status(200).json({ success: true, data: populated });
});

// DELETE /api/v1/timetables/class/:classId/entries/:entryId  (admin only)
const deleteEntry = asyncHandler(async (req, res) => {
  const classDoc = await Class.findOne({ _id: req.params.classId, schoolId: req.schoolId });
  if (!classDoc) {
    res.status(404);
    throw new Error("Class not found");
  }

  const timetable = await Timetable.findOne({ classId: classDoc._id, schoolId: req.schoolId });
  if (!timetable) {
    res.status(404);
    throw new Error("Timetable not found");
  }

  const entry = timetable.entries.id(req.params.entryId);
  if (!entry) {
    res.status(404);
    throw new Error("Entry not found");
  }

  entry.deleteOne(); // Mongoose 7+ subdocument method - removes it from the parent array
  await timetable.save();

  res.status(200).json({ success: true, message: "Entry removed" });
});

module.exports = { getTimetableForClass, getMyTimetable, addEntry, updateEntry, deleteEntry };
