-- Phase 8 — seed the legacy single-user "default-user" as a real User row
-- so existing Trip.userId = 'default-user' has a valid FK target.
INSERT OR IGNORE INTO "User" ("id", "displayName", "isGuest", "createdAt", "lastSeenAt")
VALUES ('default-user', '我', 0, datetime('now'), datetime('now'));
