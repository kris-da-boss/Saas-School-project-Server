const asyncHandler = require("express-async-handler");
const Notification = require("../models/Notification");

// GET /api/v1/announcements/mine  (every role)
// Returns THIS user's own Notification rows, populated with the underlying
// announcement. This is the audience-facing view - visibility was already
// decided once, at fan-out time (see notifyAudience.js), so no
// role/classId matching logic is repeated here.
const getMyAnnouncements = asyncHandler(async (req, res) => {
  const notifications = await Notification.find({
    schoolId: req.schoolId,
    userId: req.user.userId,
    type: "announcement",
  })
    .populate({
      path: "announcementId",
      populate: [
        { path: "authorId", select: "fullName" },
        { path: "classId", select: "name" },
      ],
    })
    .sort({ createdAt: -1 })
    .limit(50);

  // An announcement deactivated after fan-out shouldn't still show up -
  // filter those out rather than deleting the notification history.
  const items = notifications
    .filter((n) => n.announcementId && n.announcementId.isActive)
    .map((n) => ({
      notificationId: n._id,
      isRead: n.isRead,
      createdAt: n.createdAt,
      announcement: n.announcementId,
    }));

  res.status(200).json({ success: true, data: items });
});

// GET /api/v1/announcements/mine/unread-count  (every role)
const getUnreadCount = asyncHandler(async (req, res) => {
  const count = await Notification.countDocuments({
    schoolId: req.schoolId,
    userId: req.user.userId,
    type: "announcement",
    isRead: false,
  });
  res.status(200).json({ success: true, data: { count } });
});

// PATCH /api/v1/announcements/mine/:notificationId/read  (every role)
const markAsRead = asyncHandler(async (req, res) => {
  const notification = await Notification.findOne({
    _id: req.params.notificationId,
    schoolId: req.schoolId,
    userId: req.user.userId, // can only mark YOUR OWN notifications read
  });
  if (!notification) {
    res.status(404);
    throw new Error("Notification not found");
  }
  notification.isRead = true;
  await notification.save();
  res.status(200).json({ success: true });
});

// PATCH /api/v1/announcements/mine/read-all  (every role)
const markAllRead = asyncHandler(async (req, res) => {
  await Notification.updateMany(
    { schoolId: req.schoolId, userId: req.user.userId, type: "announcement", isRead: false },
    { $set: { isRead: true } }
  );
  res.status(200).json({ success: true });
});

module.exports = { getMyAnnouncements, getUnreadCount, markAsRead, markAllRead };
