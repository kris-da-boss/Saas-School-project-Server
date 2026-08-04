const express = require("express");
const protect = require("../middlewares/auth");
const tenantScope = require("../middlewares/tenantScope");
const requireRole = require("../middlewares/rbac");
const {
  createAnnouncement,
  getAnnouncements,
  deactivateAnnouncement,
} = require("../controllers/announcement.controller");
const {
  getMyAnnouncements,
  getUnreadCount,
  markAsRead,
  markAllRead,
} = require("../controllers/notification.controller");

const router = express.Router();

router.use(protect, tenantScope);

// Every authenticated role can view/manage their OWN notification inbox -
// registered before /:id below so "mine" is never mistaken for an id.
router.get("/mine", getMyAnnouncements);
router.get("/mine/unread-count", getUnreadCount);
router.patch("/mine/read-all", markAllRead);
router.patch("/mine/:notificationId/read", markAsRead);

// Admin/teacher management of announcements they're allowed to post
router.get("/", requireRole("admin", "teacher"), getAnnouncements);
router.post("/", requireRole("admin", "teacher"), createAnnouncement);
router.delete("/:id", requireRole("admin", "teacher"), deactivateAnnouncement);

module.exports = router;
