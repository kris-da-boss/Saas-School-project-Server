const asyncHandler = require("express-async-handler");
const StudentProfile = require("../models/StudentProfile");
const TeacherProfile = require("../models/TeacherProfile");
const ParentProfile = require("../models/ParentProfile");
const Class = require("../models/Class");
const Subject = require("../models/Subject");
const Attendance = require("../models/Attendance");
const Assignment = require("../models/Assignment");
const Submission = require("../models/Submission");
const Exam = require("../models/Exam");
const Result = require("../models/Result");
const Announcement = require("../models/Announcement");
const Notification = require("../models/Notification");
const Timetable = require("../models/Timetable");
const { getOwnTeacherProfile, getTeacherClassIds } = require("../utils/teacherAccess");

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function todayRangeUTC() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

// ============================================================
// ADMIN
// ============================================================
// GET /api/v1/dashboard/admin  (admin only)
const getAdminOverview = asyncHandler(async (req, res) => {
  const schoolId = req.schoolId;
  const { start, end } = todayRangeUTC();

  const [studentCount, teacherCount, parentCount, classCount, subjectCount] = await Promise.all([
    StudentProfile.countDocuments({ schoolId, isActive: true }),
    TeacherProfile.countDocuments({ schoolId, isActive: true }),
    ParentProfile.countDocuments({ schoolId, isActive: true }),
    Class.countDocuments({ schoolId, isActive: true }),
    Subject.countDocuments({ schoolId, isActive: true }),
  ]);

  // Today's attendance, tallied across every class that's been marked so far
  const todaysAttendance = await Attendance.find({ schoolId, date: { $gte: start, $lt: end } });
  const attendanceTally = { present: 0, absent: 0, late: 0, excused: 0 };
  todaysAttendance.forEach((doc) => {
    doc.records.forEach((r) => {
      if (r.status) attendanceTally[r.status] = (attendanceTally[r.status] || 0) + 1;
    });
  });

  const upcomingExams = await Exam.find({ schoolId, isActive: true, examDate: { $gte: new Date() } })
    .sort({ examDate: 1 })
    .limit(5)
    .populate("classId", "name")
    .populate("subjectId", "name code");

  // Recent activity: rather than a dedicated audit-log collection (a much
  // bigger retrofit touching every existing controller), pull the last few
  // documents from each relevant collection by their own createdAt and
  // merge them into one feed at request time. Cheap, no schema changes,
  // and good enough for "what's been happening lately".
  const [recentStudents, recentAttendance, recentAssignments, recentResults, recentAnnouncements] =
    await Promise.all([
      StudentProfile.find({ schoolId }).sort({ createdAt: -1 }).limit(5).select("fullName createdAt"),
      Attendance.find({ schoolId })
        .sort({ createdAt: -1 })
        .limit(5)
        .populate("classId", "name")
        .select("classId createdAt"),
      Assignment.find({ schoolId })
        .sort({ createdAt: -1 })
        .limit(5)
        .populate("classId", "name")
        .select("title classId createdAt"),
      Result.find({ schoolId })
        .sort({ createdAt: -1 })
        .limit(5)
        .populate("studentId", "fullName")
        .select("studentId subjectId createdAt"),
      Announcement.find({ schoolId, isActive: true })
        .sort({ createdAt: -1 })
        .limit(5)
        .select("title createdAt"),
    ]);

  const activity = [
    ...recentStudents.map((s) => ({
      type: "student",
      message: `${s.fullName} was registered`,
      timestamp: s.createdAt,
    })),
    ...recentAttendance.map((a) => ({
      type: "attendance",
      message: `Attendance taken for ${a.classId?.name || "a class"}`,
      timestamp: a.createdAt,
    })),
    ...recentAssignments.map((a) => ({
      type: "assignment",
      message: `Assignment "${a.title}" created for ${a.classId?.name || "a class"}`,
      timestamp: a.createdAt,
    })),
    ...recentResults.map((r) => ({
      type: "result",
      message: `Result entered for ${r.studentId?.fullName || "a student"}`,
      timestamp: r.createdAt,
    })),
    ...recentAnnouncements.map((a) => ({
      type: "announcement",
      message: `Announcement posted: "${a.title}"`,
      timestamp: a.createdAt,
    })),
  ]
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, 10);

  const recentNotifications = await Notification.find({ schoolId, userId: req.user.userId, type: "announcement" })
    .sort({ createdAt: -1 })
    .limit(5)
    .populate("announcementId", "title");

  res.status(200).json({
    success: true,
    data: {
      counts: { studentCount, teacherCount, parentCount, classCount, subjectCount },
      todaysAttendance: {
        ...attendanceTally,
        classesMarked: todaysAttendance.length,
        totalClasses: classCount,
      },
      upcomingExams,
      activity,
      recentNotifications: recentNotifications
        .filter((n) => n.announcementId)
        .map((n) => ({ id: n._id, title: n.announcementId.title, isRead: n.isRead, createdAt: n.createdAt })),
    },
  });
});

// ============================================================
// TEACHER
// ============================================================
// GET /api/v1/dashboard/teacher  (teacher only)
const getTeacherOverview = asyncHandler(async (req, res) => {
  const schoolId = req.schoolId;
  const teacherProfile = await getOwnTeacherProfile(req);
  if (!teacherProfile) {
    res.status(404);
    throw new Error("Teacher profile not found for this account");
  }

  const myClassIds = await getTeacherClassIds(schoolId, teacherProfile._id);
  const myClasses = await Class.find({ _id: { $in: myClassIds }, schoolId, isActive: true }).sort({
    name: 1,
  });

  const studentCount = await StudentProfile.countDocuments({
    schoolId,
    classId: { $in: myClassIds },
    isActive: true,
  });

  // Today's lessons: scan each of the teacher's classes' timetables for
  // entries on today's weekday where THIS teacher is the one teaching it
  // (a teacher can be a class's homeroom teacher without teaching every
  // lesson on its timetable, so we filter by entry.teacherId specifically).
  const todayName = DAY_NAMES[new Date().getDay()];
  const timetables = await Timetable.find({ schoolId, classId: { $in: myClassIds } })
    .populate("classId", "name")
    .populate("entries.subjectId", "name code");

  const todaysLessons = [];
  timetables.forEach((t) => {
    t.entries.forEach((e) => {
      if (e.day === todayName && e.teacherId?.toString() === teacherProfile._id.toString()) {
        todaysLessons.push({
          className: t.classId?.name,
          subject: e.subjectId?.name,
          startTime: e.startTime,
          endTime: e.endTime,
        });
      }
    });
  });
  todaysLessons.sort((a, b) => a.startTime.localeCompare(b.startTime));

  // Attendance pending today: any of the teacher's classes with no
  // Attendance document yet for today's date.
  const { start, end } = todayRangeUTC();
  const markedTodayClassIds = new Set(
    (await Attendance.find({ schoolId, classId: { $in: myClassIds }, date: { $gte: start, $lt: end } }).select(
      "classId"
    )).map((a) => a.classId.toString())
  );
  const pendingAttendance = myClasses.filter((c) => !markedTodayClassIds.has(c._id.toString()));

  // Assignments awaiting grading: submissions that exist but have no grade yet
  const myAssignments = await Assignment.find({ schoolId, classId: { $in: myClassIds }, isActive: true }).select(
    "_id"
  );
  const ungradedCount = await Submission.countDocuments({
    schoolId,
    assignmentId: { $in: myAssignments.map((a) => a._id) },
    grade: null,
  });

  const upcomingExams = await Exam.find({
    schoolId,
    classId: { $in: myClassIds },
    isActive: true,
    examDate: { $gte: new Date() },
  })
    .sort({ examDate: 1 })
    .limit(5)
    .populate("classId", "name")
    .populate("subjectId", "name code");

  const recentNotifications = await Notification.find({ schoolId, userId: req.user.userId, type: "announcement" })
    .sort({ createdAt: -1 })
    .limit(5)
    .populate("announcementId", "title");

  res.status(200).json({
    success: true,
    data: {
      classCount: myClasses.length,
      studentCount,
      todaysLessons,
      pendingAttendance: pendingAttendance.map((c) => ({ id: c._id, name: c.name })),
      ungradedCount,
      upcomingExams,
      recentNotifications: recentNotifications
        .filter((n) => n.announcementId)
        .map((n) => ({ id: n._id, title: n.announcementId.title, isRead: n.isRead, createdAt: n.createdAt })),
    },
  });
});

// ============================================================
// STUDENT
// ============================================================
// GET /api/v1/dashboard/student  (student only)
const getStudentOverview = asyncHandler(async (req, res) => {
  const schoolId = req.schoolId;
  const studentProfile = await StudentProfile.findOne({ schoolId, userId: req.user.userId }).populate(
    "classId",
    "name"
  );
  if (!studentProfile) {
    res.status(404);
    throw new Error("Student profile not found for this account");
  }

  let attendancePercentage = null;
  let todaysLessons = [];
  let upcomingExams = [];
  let assignmentsDue = [];
  let currentAverage = null;

  if (studentProfile.classId) {
    const classId = studentProfile.classId._id;

    // Attendance percentage: all-time, tallied from every Attendance
    // document that has a record for this specific student.
    const attendanceDocs = await Attendance.find({
      schoolId,
      classId,
      "records.studentId": studentProfile._id,
    }).select("records");
    let present = 0;
    let total = 0;
    attendanceDocs.forEach((doc) => {
      const rec = doc.records.find((r) => r.studentId.toString() === studentProfile._id.toString());
      if (rec?.status) {
        total += 1;
        if (rec.status === "present") present += 1;
      }
    });
    attendancePercentage = total > 0 ? Math.round((present / total) * 100) : null;

    // Today's lessons for their class
    const todayName = DAY_NAMES[new Date().getDay()];
    const timetable = await Timetable.find({ schoolId, classId }).populate("entries.subjectId", "name code");
    timetable.forEach((t) => {
      t.entries.forEach((e) => {
        if (e.day === todayName) {
          todaysLessons.push({ subject: e.subjectId?.name, startTime: e.startTime, endTime: e.endTime });
        }
      });
    });
    todaysLessons.sort((a, b) => a.startTime.localeCompare(b.startTime));

    upcomingExams = await Exam.find({ schoolId, classId, isActive: true, examDate: { $gte: new Date() } })
      .sort({ examDate: 1 })
      .limit(5)
      .populate("subjectId", "name code");

    // Assignments due: not yet submitted, due date in the future
    const allAssignments = await Assignment.find({ schoolId, classId, isActive: true })
      .populate("subjectId", "name")
      .sort({ dueDate: 1 });
    const mySubmissions = await Submission.find({ schoolId, studentId: studentProfile._id }).select(
      "assignmentId"
    );
    const submittedIds = new Set(mySubmissions.map((s) => s.assignmentId.toString()));
    assignmentsDue = allAssignments
      .filter((a) => !submittedIds.has(a._id.toString()) && new Date(a.dueDate) >= new Date())
      .slice(0, 5);

    // Current average: from the most recent term/session this student has
    // any results in, computed directly from Result's denormalized fields
    // (lighter than the full report card, which also builds attendance,
    // position, and comments this dashboard doesn't need).
    const latestResult = await Result.findOne({ schoolId, studentId: studentProfile._id }).sort({
      createdAt: -1,
    });
    if (latestResult) {
      const termResults = await Result.find({
        schoolId,
        studentId: studentProfile._id,
        term: latestResult.term,
        session: latestResult.session,
      });
      const totalScore = termResults.reduce((sum, r) => sum + r.caScore + r.score, 0);
      const totalMax = termResults.reduce((sum, r) => sum + r.maxScore, 0);
      currentAverage = totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : null;
    }
  }

  // Latest announcements this student can see (their own Notification inbox)
  const recentAnnouncements = await Notification.find({ schoolId, userId: req.user.userId, type: "announcement" })
    .sort({ createdAt: -1 })
    .limit(5)
    .populate("announcementId", "title body");

  res.status(200).json({
    success: true,
    data: {
      student: {
        fullName: studentProfile.fullName,
        admissionNo: studentProfile.admissionNo,
        photoUrl: studentProfile.photoUrl,
        className: studentProfile.classId?.name || null,
      },
      attendancePercentage,
      currentAverage,
      todaysLessons,
      upcomingExams,
      assignmentsDue,
      latestAnnouncements: recentAnnouncements
        .filter((n) => n.announcementId)
        .map((n) => ({ id: n._id, title: n.announcementId.title, body: n.announcementId.body, isRead: n.isRead })),
    },
  });
});

// ============================================================
// PARENT
// ============================================================
// GET /api/v1/dashboard/parent?childId=  (parent only)
const getParentOverview = asyncHandler(async (req, res) => {
  const schoolId = req.schoolId;
  const parentProfile = await ParentProfile.findOne({ schoolId, userId: req.user.userId }).populate(
    "childrenIds",
    "fullName admissionNo photoUrl classId"
  );
  if (!parentProfile) {
    res.status(404);
    throw new Error("Parent profile not found for this account");
  }

  const children = parentProfile.childrenIds;
  if (children.length === 0) {
    return res.status(200).json({ success: true, data: { children: [], selected: null } });
  }

  // Default to the first child unless a specific one was requested - the
  // frontend's child-selector then just re-calls this with ?childId=
  const requestedId = req.query.childId;
  const selectedChild = requestedId
    ? children.find((c) => c._id.toString() === requestedId)
    : children[0];

  if (!selectedChild) {
    res.status(403);
    throw new Error("That child is not linked to your account");
  }

  const studentDoc = await StudentProfile.findOne({ _id: selectedChild._id, schoolId }).populate(
    "classId",
    "name"
  );

  let attendancePercentage = null;
  let currentAverage = null;
  let upcomingExams = [];
  let assignmentsDue = [];

  if (studentDoc?.classId) {
    const classId = studentDoc.classId._id;

    const attendanceDocs = await Attendance.find({
      schoolId,
      classId,
      "records.studentId": studentDoc._id,
    }).select("records");
    let present = 0;
    let total = 0;
    attendanceDocs.forEach((doc) => {
      const rec = doc.records.find((r) => r.studentId.toString() === studentDoc._id.toString());
      if (rec?.status) {
        total += 1;
        if (rec.status === "present") present += 1;
      }
    });
    attendancePercentage = total > 0 ? Math.round((present / total) * 100) : null;

    upcomingExams = await Exam.find({ schoolId, classId, isActive: true, examDate: { $gte: new Date() } })
      .sort({ examDate: 1 })
      .limit(5)
      .populate("subjectId", "name code");

    const allAssignments = await Assignment.find({ schoolId, classId, isActive: true }).populate(
      "subjectId",
      "name"
    );
    const childSubmissions = await Submission.find({ schoolId, studentId: studentDoc._id }).select(
      "assignmentId"
    );
    const submittedIds = new Set(childSubmissions.map((s) => s.assignmentId.toString()));
    assignmentsDue = allAssignments
      .filter((a) => !submittedIds.has(a._id.toString()) && new Date(a.dueDate) >= new Date())
      .slice(0, 5);

    const latestResult = await Result.findOne({ schoolId, studentId: studentDoc._id }).sort({ createdAt: -1 });
    if (latestResult) {
      const termResults = await Result.find({
        schoolId,
        studentId: studentDoc._id,
        term: latestResult.term,
        session: latestResult.session,
      });
      const totalScore = termResults.reduce((sum, r) => sum + r.caScore + r.score, 0);
      const totalMax = termResults.reduce((sum, r) => sum + r.maxScore, 0);
      currentAverage = totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : null;
    }
  }

  const recentNotifications = await Notification.find({ schoolId, userId: req.user.userId, type: "announcement" })
    .sort({ createdAt: -1 })
    .limit(5)
    .populate("announcementId", "title body");

  res.status(200).json({
    success: true,
    data: {
      children: children.map((c) => ({ id: c._id, fullName: c.fullName })),
      selected: {
        id: selectedChild._id,
        fullName: selectedChild.fullName,
        photoUrl: selectedChild.photoUrl,
        className: studentDoc?.classId?.name || null,
      },
      attendancePercentage,
      currentAverage,
      upcomingExams,
      assignmentsDue,
      recentNotifications: recentNotifications
        .filter((n) => n.announcementId)
        .map((n) => ({ id: n._id, title: n.announcementId.title, body: n.announcementId.body, isRead: n.isRead })),
    },
  });
});

module.exports = { getAdminOverview, getTeacherOverview, getStudentOverview, getParentOverview };
