-- Idempotent data migration: rename the original single-user Settings row
-- from "singleton" to "default-user" so the cookie-based getCurrentUserId()
-- helper (default = "default-user") can locate it.
UPDATE "Settings" SET "id" = 'default-user' WHERE "id" = 'singleton';
