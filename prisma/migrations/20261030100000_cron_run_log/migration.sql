-- Run log for the scheduled jobs behind /api/cronJobs/* (docs/operations.md).
-- One row per authorized invocation: RUNNING when the job starts, then
-- SUCCESS or FAILED with a sanitized summary. Unauthorized or disabled
-- invocations record nothing. Rows older than 90 days are pruned by the
-- daily job.
CREATE TYPE "CronRunStatus" AS ENUM ('RUNNING', 'SUCCESS', 'FAILED');

CREATE TABLE "CronRun" (
    "id" SERIAL NOT NULL,
    "job" TEXT NOT NULL,
    "status" "CronRunStatus" NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMPTZ(3),
    "durationMs" INTEGER,
    "summary" JSONB,
    "error" TEXT,

    CONSTRAINT "CronRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CronRun_job_startedAt_idx" ON "CronRun"("job", "startedAt");
CREATE INDEX "CronRun_status_startedAt_idx" ON "CronRun"("status", "startedAt");
CREATE INDEX "CronRun_startedAt_idx" ON "CronRun"("startedAt");

-- Every table gets RLS (see 20261029120000_enable_row_level_security).
ALTER TABLE "CronRun" ENABLE ROW LEVEL SECURITY;
