-- The daily job blanks audit-log IPs older than 90 days by timestamp.
CREATE INDEX "AuditLog_timestamp_idx" ON "AuditLog"("timestamp");
