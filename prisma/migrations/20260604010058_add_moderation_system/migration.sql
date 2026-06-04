-- CreateEnum
CREATE TYPE "StaffRole" AS ENUM ('ADMINISTRATOR', 'MODERATOR', 'COMMUNITY_MANAGER', 'GAME_MASTER');

-- CreateEnum
CREATE TYPE "ReportCategory" AS ENUM ('HARASSMENT', 'SPAM', 'CHEATING', 'MULTI_ACCOUNT', 'BUG_EXPLOIT', 'INAPPROPRIATE_NAME', 'CHAT_ABUSE', 'ALLIANCE_ABUSE', 'OTHER');

-- CreateEnum
CREATE TYPE "ReportPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('OPEN', 'TRIAGED', 'IN_REVIEW', 'RESOLVED', 'DISMISSED', 'ESCALATED');

-- CreateEnum
CREATE TYPE "ReportResolution" AS ENUM ('NO_ACTION', 'WARNING', 'CHAT_MUTE', 'SUSPENSION', 'BAN', 'APPEAL_REFERRED', 'OTHER');

-- CreateEnum
CREATE TYPE "ReportActionType" AS ENUM ('CREATED', 'STATUS_CHANGED', 'PRIORITY_CHANGED', 'ASSIGNED', 'NOTE_ADDED', 'EVIDENCE_ADDED', 'USER_WARNED', 'USER_MUTED', 'USER_SUSPENDED', 'USER_BANNED', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "ModeratorNoteVisibility" AS ENUM ('STAFF', 'ADMINS_ONLY');

-- CreateEnum
CREATE TYPE "AnnouncementSeverity" AS ENUM ('INFO', 'SUCCESS', 'WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "GameEventType" AS ENUM ('GOLD_MODIFIER', 'TURN_MODIFIER', 'UNIT_COST_MODIFIER', 'BUILD_SPEED_MODIFIER', 'PVP_MODIFIER', 'CUSTOM');

-- CreateEnum
CREATE TYPE "GameEventStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BanAppealStatus" AS ENUM ('OPEN', 'IN_REVIEW', 'ACCEPTED', 'DENIED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "ServerSettingType" AS ENUM ('STRING', 'NUMBER', 'BOOLEAN', 'JSON');

-- CreateEnum
CREATE TYPE "SignalSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "InvestigationStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'DISMISSED', 'ACTION_TAKEN');

-- CreateEnum
CREATE TYPE "CheatSignalType" AS ENUM ('IMPOSSIBLE_ACTION', 'GOLD_SPIKE', 'SELF_FARMING', 'TRANSFER_RING', 'LINKED_ACCOUNT_ACTIVITY', 'CHAT_SPAM', 'ALLIANCE_BANK_ABUSE');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PermissionType" ADD VALUE 'VIEW_STAFF_DASHBOARD';
ALTER TYPE "PermissionType" ADD VALUE 'VIEW_AUDIT_LOGS';
ALTER TYPE "PermissionType" ADD VALUE 'MANAGE_USERS';
ALTER TYPE "PermissionType" ADD VALUE 'MANAGE_ACCOUNT_STATUS';
ALTER TYPE "PermissionType" ADD VALUE 'MANAGE_MODERATOR_NOTES';
ALTER TYPE "PermissionType" ADD VALUE 'MANAGE_BAN_APPEALS';
ALTER TYPE "PermissionType" ADD VALUE 'REVIEW_REPORTS';
ALTER TYPE "PermissionType" ADD VALUE 'ASSIGN_REPORTS';
ALTER TYPE "PermissionType" ADD VALUE 'MODERATE_CHAT';
ALTER TYPE "PermissionType" ADD VALUE 'VIEW_CHAT_LOGS';
ALTER TYPE "PermissionType" ADD VALUE 'MANAGE_ANNOUNCEMENTS';
ALTER TYPE "PermissionType" ADD VALUE 'MANAGE_CONTENT';
ALTER TYPE "PermissionType" ADD VALUE 'SEND_MASS_MESSAGES';
ALTER TYPE "PermissionType" ADD VALUE 'MANAGE_EVENTS';
ALTER TYPE "PermissionType" ADD VALUE 'MANAGE_ERAS';
ALTER TYPE "PermissionType" ADD VALUE 'MANAGE_ALLIANCES';
ALTER TYPE "PermissionType" ADD VALUE 'VIEW_ECONOMY';
ALTER TYPE "PermissionType" ADD VALUE 'VIEW_ANALYTICS';
ALTER TYPE "PermissionType" ADD VALUE 'VIEW_MULTI_ACCOUNTS';
ALTER TYPE "PermissionType" ADD VALUE 'VIEW_CHEAT_SIGNALS';
ALTER TYPE "PermissionType" ADD VALUE 'MANAGE_FEATURE_FLAGS';
ALTER TYPE "PermissionType" ADD VALUE 'MANAGE_SERVER_SETTINGS';
ALTER TYPE "PermissionType" ADD VALUE 'MANAGE_API_TOKENS';
ALTER TYPE "PermissionType" ADD VALUE 'USE_IMPERSONATION';

-- DropForeignKey
ALTER TABLE "PermissionGrant" DROP CONSTRAINT "PermissionGrant_user_id_fkey";

-- DropIndex
DROP INDEX "users_defense_pressure_date_idx";

-- DropIndex
DROP INDEX "users_spy_pressure_date_idx";

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "entityId" INTEGER,
ADD COLUMN     "entityType" TEXT,
ADD COLUMN     "ipHash" TEXT,
ADD COLUMN     "requestId" TEXT,
ADD COLUMN     "targetUserId" INTEGER;

-- AlterTable
ALTER TABLE "ChatMessage" ADD COLUMN     "deletedAt" TIMESTAMPTZ(3),
ADD COLUMN     "deletedByUserId" INTEGER,
ADD COLUMN     "editReason" TEXT,
ADD COLUMN     "moderatedByUserId" INTEGER,
ADD COLUMN     "originalContent" TEXT;

-- AlterTable
ALTER TABLE "PermissionGrant" ADD COLUMN     "grantedByUserId" INTEGER,
ADD COLUMN     "note" TEXT,
ADD COLUMN     "revokedAt" TIMESTAMPTZ(3),
ADD COLUMN     "sourceRole" "StaffRole",
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "blog_posts" ADD COLUMN     "excerpt" TEXT,
ADD COLUMN     "isPinned" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'BLOG',
ADD COLUMN     "publishedAt" TIMESTAMPTZ(3),
ADD COLUMN     "slug" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'DRAFT';

-- CreateTable
CREATE TABLE "StaffRoleAssignment" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "role" "StaffRole" NOT NULL,
    "grantedByUserId" INTEGER,
    "note" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMPTZ(3),

    CONSTRAINT "StaffRoleAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" SERIAL NOT NULL,
    "reporterUserId" INTEGER NOT NULL,
    "reportedUserId" INTEGER NOT NULL,
    "category" "ReportCategory" NOT NULL,
    "priority" "ReportPriority" NOT NULL DEFAULT 'NORMAL',
    "status" "ReportStatus" NOT NULL DEFAULT 'OPEN',
    "subject" TEXT,
    "description" TEXT NOT NULL,
    "roomId" INTEGER,
    "chatMessageId" INTEGER,
    "assignedToUserId" INTEGER,
    "resolution" "ReportResolution",
    "resolutionSummary" TEXT,
    "resolvedByUserId" INTEGER,
    "resolvedAt" TIMESTAMPTZ(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportAction" (
    "id" SERIAL NOT NULL,
    "reportId" INTEGER NOT NULL,
    "actorUserId" INTEGER NOT NULL,
    "type" "ReportActionType" NOT NULL,
    "body" TEXT,
    "fromStatus" "ReportStatus",
    "toStatus" "ReportStatus",
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModeratorNote" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "authorUserId" INTEGER NOT NULL,
    "relatedReportId" INTEGER,
    "visibility" "ModeratorNoteVisibility" NOT NULL DEFAULT 'STAFF',
    "note" TEXT NOT NULL,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "ModeratorNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Announcement" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "severity" "AnnouncementSeverity" NOT NULL DEFAULT 'INFO',
    "isBanner" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "dismissible" BOOLEAN NOT NULL DEFAULT true,
    "startsAt" TIMESTAMPTZ(3),
    "endsAt" TIMESTAMPTZ(3),
    "linkUrl" TEXT,
    "createdByUserId" INTEGER NOT NULL,
    "updatedByUserId" INTEGER,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameEvent" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "GameEventType" NOT NULL,
    "status" "GameEventStatus" NOT NULL DEFAULT 'DRAFT',
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "config" JSONB NOT NULL,
    "createdByUserId" INTEGER NOT NULL,
    "updatedByUserId" INTEGER,
    "activatedAt" TIMESTAMPTZ(3),
    "deactivatedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "GameEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BanAppeal" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "accountStatusHistoryId" INTEGER NOT NULL,
    "reportId" INTEGER,
    "status" "BanAppealStatus" NOT NULL DEFAULT 'OPEN',
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "assignedToUserId" INTEGER,
    "decisionSummary" TEXT,
    "decidedByUserId" INTEGER,
    "decidedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "BanAppeal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeatureFlag" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "rules" JSONB,
    "createdByUserId" INTEGER,
    "updatedByUserId" INTEGER,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "FeatureFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServerSetting" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "type" "ServerSettingType" NOT NULL,
    "value" JSONB NOT NULL,
    "validation" JSONB,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "isRuntimeEditable" BOOLEAN NOT NULL DEFAULT true,
    "updatedByUserId" INTEGER,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ServerSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMute" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "roomId" INTEGER,
    "createdByUserId" INTEGER NOT NULL,
    "reason" TEXT,
    "startsAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),
    "revokedByUserId" INTEGER,

    CONSTRAINT "ChatMute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoginEvent" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "ipHash" TEXT NOT NULL,
    "ipPrefixHash" TEXT,
    "deviceHash" TEXT,
    "userAgentHash" TEXT,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CheatSignal" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "relatedUserId" INTEGER,
    "type" "CheatSignalType" NOT NULL,
    "severity" "SignalSeverity" NOT NULL,
    "score" INTEGER NOT NULL,
    "status" "InvestigationStatus" NOT NULL DEFAULT 'OPEN',
    "summary" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "assignedToUserId" INTEGER,
    "resolvedByUserId" INTEGER,
    "resolvedAt" TIMESTAMPTZ(3),
    "firstSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CheatSignal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StaffRoleAssignment_userId_revokedAt_idx" ON "StaffRoleAssignment"("userId", "revokedAt");

-- CreateIndex
CREATE INDEX "StaffRoleAssignment_role_revokedAt_idx" ON "StaffRoleAssignment"("role", "revokedAt");

-- CreateIndex
CREATE INDEX "Report_status_priority_createdAt_idx" ON "Report"("status", "priority", "createdAt");

-- CreateIndex
CREATE INDEX "Report_assignedToUserId_status_idx" ON "Report"("assignedToUserId", "status");

-- CreateIndex
CREATE INDEX "Report_reportedUserId_createdAt_idx" ON "Report"("reportedUserId", "createdAt");

-- CreateIndex
CREATE INDEX "Report_reporterUserId_createdAt_idx" ON "Report"("reporterUserId", "createdAt");

-- CreateIndex
CREATE INDEX "ReportAction_reportId_createdAt_idx" ON "ReportAction"("reportId", "createdAt");

-- CreateIndex
CREATE INDEX "ModeratorNote_userId_deletedAt_createdAt_idx" ON "ModeratorNote"("userId", "deletedAt", "createdAt");

-- CreateIndex
CREATE INDEX "ModeratorNote_authorUserId_createdAt_idx" ON "ModeratorNote"("authorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "Announcement_isActive_startsAt_endsAt_idx" ON "Announcement"("isActive", "startsAt", "endsAt");

-- CreateIndex
CREATE UNIQUE INDEX "GameEvent_key_key" ON "GameEvent"("key");

-- CreateIndex
CREATE INDEX "GameEvent_status_startsAt_endsAt_idx" ON "GameEvent"("status", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "BanAppeal_status_createdAt_idx" ON "BanAppeal"("status", "createdAt");

-- CreateIndex
CREATE INDEX "BanAppeal_userId_createdAt_idx" ON "BanAppeal"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FeatureFlag_key_key" ON "FeatureFlag"("key");

-- CreateIndex
CREATE UNIQUE INDEX "ServerSetting_key_key" ON "ServerSetting"("key");

-- CreateIndex
CREATE INDEX "ChatMute_userId_endsAt_revokedAt_idx" ON "ChatMute"("userId", "endsAt", "revokedAt");

-- CreateIndex
CREATE INDEX "ChatMute_roomId_endsAt_revokedAt_idx" ON "ChatMute"("roomId", "endsAt", "revokedAt");

-- CreateIndex
CREATE INDEX "LoginEvent_userId_occurredAt_idx" ON "LoginEvent"("userId", "occurredAt");

-- CreateIndex
CREATE INDEX "LoginEvent_ipHash_occurredAt_idx" ON "LoginEvent"("ipHash", "occurredAt");

-- CreateIndex
CREATE INDEX "LoginEvent_ipPrefixHash_occurredAt_idx" ON "LoginEvent"("ipPrefixHash", "occurredAt");

-- CreateIndex
CREATE INDEX "LoginEvent_deviceHash_occurredAt_idx" ON "LoginEvent"("deviceHash", "occurredAt");

-- CreateIndex
CREATE INDEX "CheatSignal_status_severity_createdAt_idx" ON "CheatSignal"("status", "severity", "createdAt");

-- CreateIndex
CREATE INDEX "CheatSignal_userId_status_idx" ON "CheatSignal"("userId", "status");

-- CreateIndex
CREATE INDEX "AuditLog_targetUserId_timestamp_idx" ON "AuditLog"("targetUserId", "timestamp");

-- CreateIndex
CREATE INDEX "AuditLog_action_timestamp_idx" ON "AuditLog"("action", "timestamp");

-- CreateIndex
CREATE INDEX "PermissionGrant_user_id_revokedAt_idx" ON "PermissionGrant"("user_id", "revokedAt");

-- CreateIndex
CREATE INDEX "PermissionGrant_type_revokedAt_idx" ON "PermissionGrant"("type", "revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "blog_posts_slug_key" ON "blog_posts"("slug");

-- CreateIndex
CREATE INDEX "blog_posts_status_publishedAt_idx" ON "blog_posts"("status", "publishedAt");

-- CreateIndex
CREATE INDEX "blog_posts_kind_status_idx" ON "blog_posts"("kind", "status");

-- AddForeignKey
ALTER TABLE "PermissionGrant" ADD CONSTRAINT "PermissionGrant_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PermissionGrant" ADD CONSTRAINT "PermissionGrant_grantedByUserId_fkey" FOREIGN KEY ("grantedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffRoleAssignment" ADD CONSTRAINT "StaffRoleAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffRoleAssignment" ADD CONSTRAINT "StaffRoleAssignment_grantedByUserId_fkey" FOREIGN KEY ("grantedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_reporterUserId_fkey" FOREIGN KEY ("reporterUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_reportedUserId_fkey" FOREIGN KEY ("reportedUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_resolvedByUserId_fkey" FOREIGN KEY ("resolvedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "ChatRoom"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_chatMessageId_fkey" FOREIGN KEY ("chatMessageId") REFERENCES "ChatMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportAction" ADD CONSTRAINT "ReportAction_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportAction" ADD CONSTRAINT "ReportAction_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModeratorNote" ADD CONSTRAINT "ModeratorNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModeratorNote" ADD CONSTRAINT "ModeratorNote_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModeratorNote" ADD CONSTRAINT "ModeratorNote_relatedReportId_fkey" FOREIGN KEY ("relatedReportId") REFERENCES "Report"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameEvent" ADD CONSTRAINT "GameEvent_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameEvent" ADD CONSTRAINT "GameEvent_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BanAppeal" ADD CONSTRAINT "BanAppeal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BanAppeal" ADD CONSTRAINT "BanAppeal_accountStatusHistoryId_fkey" FOREIGN KEY ("accountStatusHistoryId") REFERENCES "AccountStatusHistory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BanAppeal" ADD CONSTRAINT "BanAppeal_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BanAppeal" ADD CONSTRAINT "BanAppeal_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BanAppeal" ADD CONSTRAINT "BanAppeal_decidedByUserId_fkey" FOREIGN KEY ("decidedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeatureFlag" ADD CONSTRAINT "FeatureFlag_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeatureFlag" ADD CONSTRAINT "FeatureFlag_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServerSetting" ADD CONSTRAINT "ServerSetting_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMute" ADD CONSTRAINT "ChatMute_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMute" ADD CONSTRAINT "ChatMute_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "ChatRoom"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMute" ADD CONSTRAINT "ChatMute_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMute" ADD CONSTRAINT "ChatMute_revokedByUserId_fkey" FOREIGN KEY ("revokedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoginEvent" ADD CONSTRAINT "LoginEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheatSignal" ADD CONSTRAINT "CheatSignal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheatSignal" ADD CONSTRAINT "CheatSignal_relatedUserId_fkey" FOREIGN KEY ("relatedUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheatSignal" ADD CONSTRAINT "CheatSignal_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheatSignal" ADD CONSTRAINT "CheatSignal_resolvedByUserId_fkey" FOREIGN KEY ("resolvedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

