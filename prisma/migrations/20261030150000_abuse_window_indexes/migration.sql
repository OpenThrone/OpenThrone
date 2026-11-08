-- Abuse sweep (#6): the daily detectors read time windows of transfers,
-- recruit clicks and login events. These indexes lead with the window column
-- so the scans stay range scans as history grows.
CREATE INDEX "bank_history_history_type_date_time_idx" ON "bank_history"("history_type", "date_time");
CREATE INDEX "recruit_history_source_timestamp_idx" ON "recruit_history"("source", "timestamp");
CREATE INDEX "LoginEvent_occurredAt_idx" ON "LoginEvent"("occurredAt");
