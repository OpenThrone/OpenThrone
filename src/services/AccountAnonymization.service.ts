import { randomBytes } from 'crypto';

import { hashPassword } from '@/lib/passwordHash';
import prisma from '@/lib/prisma';
import type {
  IdentityBlockKind,
  IdentityBlockReason,
} from '@/lib/prisma-exports';
import { Prisma } from '@/lib/prisma-exports';
import { AdminService } from '@/services/Admin.service';
import {
  eraseAuthoredMessages,
  eraseRemainingPersonalData,
} from '@/services/PrivacyRetention.service';
import { getActiveAccountStatus } from '@/services/User.service';
import { resolveColorScheme } from '@/services/UserDefaults.service';
import { logActionStrict } from '@/utils/auditLogger';
import { hashIdentity, legacyEmailHash } from '@/utils/identityHash';
import { generateUniquePseudonym } from '@/utils/pseudonym';

/** Days a clean (unsanctioned) deletion keeps its email hash before purge. */
export const DELETION_COOLDOWN_DAYS = 30;

/** How long an erased account's veteran fingerprint stays claimable. */
export const VETERAN_RECORD_DAYS = 730;

/**
 * True for an erased account. `anonymizedAt` is the only marker: players can
 * choose their own email address (even one ending `@deleted.local`), but not
 * this. Accounts erased before the column existed were backfilled by the
 * migration that added it.
 */
export const isAnonymizedUser = (user: { anonymizedAt?: Date | null }) =>
  Boolean(user.anonymizedAt);

/** Which flow triggered an erasure. */
export type AnonymizationInitiator = 'SELF' | 'ADMIN' | 'INACTIVITY';

export interface AnonymizeAccountOptions {
  /** Human-readable reason recorded on the CLOSED status row and audit log. */
  reason: string;
  /** Which flow triggered the erasure. */
  initiatedBy: AnonymizationInitiator;
  /** Acting staff user for ADMIN flows; also the audit actor. */
  actorUserId?: number;
  /** Extra facts recorded on the audit row (for example the request it came from). */
  auditDetails?: Record<string, unknown>;
}

export interface AnonymizeAccountResult {
  /** The random display name the account was renamed to. */
  pseudonym: string;
}

export interface IdentityBlockCheck {
  emailBlocked: boolean;
  displayNameBlocked: boolean;
}

type TransactionClient = Prisma.TransactionClient;

/** Block strength: SANCTION outranks DELETION_COOLDOWN for email hashes. */
const REASON_RANK: Record<IdentityBlockReason, number> = {
  SANCTION: 2,
  DELETION_COOLDOWN: 1,
  // Never competes with the email reasons (separate kind); rank is unused.
  RESERVED_NAME: 2,
};

interface BlockWrite {
  kind: IdentityBlockKind;
  hash: string;
  reason: IdentityBlockReason;
  sourceUserId?: number;
  expiresAt: Date | null;
}

/**
 * true when the candidate (reason, expiry) is at least as strong as the
 * existing block: a higher-ranked reason always wins; an equal-ranked reason
 * must not shorten the window (permanent null > later date > earlier date).
 */
function isAtLeastAsStrong(
  existingReason: IdentityBlockReason,
  existingExpiry: Date | null,
  newReason: IdentityBlockReason,
  newExpiry: Date | null,
): boolean {
  if (REASON_RANK[newReason] > REASON_RANK[existingReason]) return true;
  if (REASON_RANK[newReason] < REASON_RANK[existingReason]) return false;
  if (existingExpiry === null) return newExpiry === null;
  if (newExpiry === null) return true;
  return newExpiry.getTime() >= existingExpiry.getTime();
}

/**
 * Writes an IdentityBlock without ever weakening an existing one: a stronger
 * reason or a later/permanent expiry replaces the row, anything weaker is
 * ignored. Expired rows are replaced regardless of rank. Replacement also
 * transfers source attribution; migrated rows with no source are enriched.
 */
async function upsertIdentityBlock(
  tx: TransactionClient,
  block: BlockWrite,
): Promise<void> {
  const existing = await tx.identityBlock.findUnique({
    where: { kind_hash: { kind: block.kind, hash: block.hash } },
    select: { reason: true, expiresAt: true, sourceUserId: true },
  });

  if (!existing) {
    await tx.identityBlock.create({
      data: {
        kind: block.kind,
        hash: block.hash,
        reason: block.reason,
        sourceUserId: block.sourceUserId ?? null,
        expiresAt: block.expiresAt,
      },
    });
    return;
  }

  const strengthens =
    (existing.expiresAt !== null && existing.expiresAt <= new Date()) ||
    isAtLeastAsStrong(
      existing.reason,
      existing.expiresAt,
      block.reason,
      block.expiresAt,
    );
  // Retain live stronger blocks; replacements carry their new source.
  if (!strengthens && existing.sourceUserId !== null) return;

  await tx.identityBlock.update({
    where: { kind_hash: { kind: block.kind, hash: block.hash } },
    data: {
      reason: strengthens ? block.reason : existing.reason,
      expiresAt: strengthens ? block.expiresAt : existing.expiresAt,
      ...((strengthens || existing.sourceUserId === null) &&
      block.sourceUserId != null
        ? { sourceUserId: block.sourceUserId }
        : {}),
    },
  });
}

/**
 * Shared erasure path for the privacy erasure job, inactivity expiry and admin
 * erase: scrubs PII, renames to a random pseudonym, writes IdentityBlocks per
 * the retention policy and closes the account. The users row and all game
 * history remain so foreign keys never break. Must run inside the caller's
 * transaction.
 */
export class AccountAnonymizationService {
  /**
   * Anonymizes an account. Locks the user row, refuses self/inactivity
   * erasure of staff accounts (an admin erasure revokes their access
   * instead), writes the retention blocks, assigns a collision-checked
   * pseudonym, scrubs credentials and profile data, revokes API access and
   * pending mail, closes the account and writes an audit row in the same
   * transaction. Returns the assigned pseudonym.
   */
  static async anonymizeAccount(
    tx: TransactionClient,
    userId: number,
    options: AnonymizeAccountOptions,
  ): Promise<AnonymizeAccountResult> {
    const now = new Date();

    // Serialize against account-action and other status writers.
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;

    const user = await tx.users.findUnique({
      where: { id: userId },
      select: {
        email: true,
        display_name: true,
        race: true,
        colorScheme: true,
        anonymizedAt: true,
        created_at: true,
      },
    });
    if (!user) {
      throw new Error('User not found');
    }
    if (isAnonymizedUser(user)) {
      throw new Error('Account is already anonymized');
    }

    if (options.initiatedBy === 'ADMIN') {
      // Soft-revokes staff roles and permission grants; also scrambles the
      // password hash, which the scrub below overwrites anyway.
      await AdminService.revokeAccountAccess(tx, userId);
    } else {
      const staff = await tx.staffRoleAssignment.findFirst({
        where: { userId, revokedAt: null },
        select: { id: true },
      });
      if (staff) {
        throw new Error('Staff accounts must be closed by an administrator');
      }
    }

    // Current sanction, if any, decides the email-hash retention window.
    const activeStatus = await getActiveAccountStatus(userId, tx);
    let sanction =
      activeStatus &&
      (activeStatus.status === 'BANNED' || activeStatus.status === 'SUSPENDED')
        ? activeStatus
        : null;
    if (!sanction && activeStatus?.status === 'CLOSED') {
      // The grace period of an erasure request writes a CLOSED row on top of
      // the history, which must not hide a ban or suspension still running
      // underneath it. The longest-running sanction wins (no end = permanent).
      const underneath = await tx.accountStatusHistory.findFirst({
        where: {
          user_id: userId,
          status: { in: ['BANNED', 'SUSPENDED'] },
          start_date: { lte: now },
          OR: [{ end_date: null }, { end_date: { gt: now } }],
        },
        orderBy: [
          { end_date: { sort: 'desc', nulls: 'first' } },
          { id: 'desc' },
        ],
        select: { status: true, end_date: true },
      });
      if (underneath) {
        sanction = {
          status: underneath.status as 'BANNED' | 'SUSPENDED',
          endDate: underneath.end_date,
        };
      }
    }

    if (user.email) {
      if (sanction) {
        // Sanctioned: hash retained for the sanction's duration (null =
        // permanent), never shortening a stronger existing block.
        await upsertIdentityBlock(tx, {
          kind: 'EMAIL',
          hash: hashIdentity('EMAIL', user.email),
          reason: 'SANCTION',
          sourceUserId: userId,
          expiresAt: sanction.endDate,
        });
      } else if (options.initiatedBy !== 'INACTIVITY') {
        // Clean deletion: 30-day anti-churn cooldown. Inactivity erasure
        // writes no email block: the email was already warned for months and
        // the returning player must be able to re-register to claim their
        // veteran record.
        await upsertIdentityBlock(tx, {
          kind: 'EMAIL',
          hash: hashIdentity('EMAIL', user.email),
          reason: 'DELETION_COOLDOWN',
          sourceUserId: userId,
          expiresAt: new Date(
            now.getTime() + DELETION_COOLDOWN_DAYS * 24 * 60 * 60 * 1000,
          ),
        });
      }
    }

    // A returned veteran being erased again takes their claimed record (email
    // fingerprint and the link to the earlier account) with them.
    await tx.veteranRecord.deleteMany({ where: { claimedByUserId: userId } });

    // Veterans of a finished era: before the scrub, keep a keyed fingerprint
    // of the identity so a returning registration can restore the title and
    // original join date. Only for unsanctioned inactivity erasure of
    // accounts that joined before the current era started.
    if (
      options.initiatedBy === 'INACTIVITY' &&
      !sanction &&
      user.email &&
      user.created_at
    ) {
      const era = await tx.era.findFirst({
        where: { endDate: null },
        orderBy: { startDate: 'desc' },
        select: { startDate: true },
      });
      if (era && user.created_at < era.startDate) {
        await tx.veteranRecord.upsert({
          where: { emailHash: hashIdentity('EMAIL', user.email) },
          create: {
            emailHash: hashIdentity('EMAIL', user.email),
            displayNameHash: hashIdentity('DISPLAY_NAME', user.display_name),
            title: 'ERA1_TESTER',
            sourceUserId: userId,
            originalJoinedAt: user.created_at,
            expiresAt: new Date(
              now.getTime() + VETERAN_RECORD_DAYS * 24 * 60 * 60 * 1000,
            ),
          },
          // A record already claimed by a returning player keeps its claim.
          update: {},
        });
      }
    }

    // The original display name stays reserved permanently.
    await upsertIdentityBlock(tx, {
      kind: 'DISPLAY_NAME',
      hash: hashIdentity('DISPLAY_NAME', user.display_name),
      reason: 'RESERVED_NAME',
      sourceUserId: userId,
      expiresAt: null,
    });

    // Unique pseudonym: collisions with existing names (case-insensitive) and
    // with reserved-name blocks are retried.
    const isTaken = async (name: string) => {
      const [existingUser, reserved] = await Promise.all([
        tx.users.findFirst({
          where: { display_name: { equals: name, mode: 'insensitive' } },
          select: { id: true },
        }),
        tx.identityBlock.findUnique({
          where: {
            kind_hash: {
              kind: 'DISPLAY_NAME',
              hash: hashIdentity('DISPLAY_NAME', name),
            },
          },
          select: { id: true },
        }),
      ]);
      return Boolean(existingUser) || Boolean(reserved);
    };
    const pseudonym = await generateUniquePseudonym(isTaken);

    // Scrub PII and credentials. recruit_link is regenerated because it is
    // md5(userId) and would otherwise still encode the account id.
    await tx.users.update({
      where: { id: userId },
      data: {
        email: `${userId}-deleted@deleted.local`,
        anonymizedAt: now,
        display_name: pseudonym,
        password_hash: await hashPassword(randomBytes(24).toString('hex')),
        twoFactorSecret: null,
        avatar: null,
        bio: '',
        recruit_link: randomBytes(16).toString('hex'),
        colorScheme: resolveColorScheme(user.colorScheme, user.race),
        veteranTitle: null,
        veteranSince: null,
      },
    });

    // Password resets can carry the old address (oldEmail) — remove all rows.
    await tx.passwordReset.deleteMany({ where: { userId } });

    // Revoke API clients owned by the account and their tokens.
    await tx.apiToken.updateMany({
      where: { client: { ownerUserId: userId }, revokedAt: null },
      data: { revokedAt: now },
    });
    await tx.apiClient.updateMany({
      where: { ownerUserId: userId, status: 'ACTIVE' },
      data: { status: 'DISABLED' },
    });

    // Sessions are JWT-based with no server store; the next-auth jwt
    // callback rejects sessions once the CLOSED row below is visible.

    // Email lifecycle data tied to the erased identity.
    await tx.emailPreference.deleteMany({ where: { userId } });
    await tx.emailOutbox.updateMany({
      where: { userId },
      data: {
        toAddress: `${userId}-deleted@deleted.local`,
        // The existing schema requires textBody; empty text erases it without a migration.
        textBody: '',
        htmlBody: null,
        headers: Prisma.DbNull,
      },
    });
    await tx.emailOutbox.updateMany({
      where: { userId, status: { in: ['PENDING', 'SENDING'] } },
      data: { status: 'SKIPPED' },
    });
    // Discord identity and queued DMs go with the account. Subscription
    // billing is cancelled after commit (endSupporterBilling) and by the
    // daily supporter job.
    await tx.discordOutbox.deleteMany({ where: { userId } });
    await tx.discordLinkCode.deleteMany({ where: { userId } });
    await tx.discordLink.deleteMany({ where: { userId } });
    // Words the player wrote to others go too; avatar files are deleted
    // after commit by the caller (deleteUserAvatarFiles).
    await eraseAuthoredMessages(tx, userId);
    // Sign-in history, raw addresses, social links, chat participation and
    // (unless a sanction still runs) the moderation file.
    await eraseRemainingPersonalData(tx, userId, {
      sanctionInEffect: Boolean(sanction),
    });
    await tx.accountInactivityNotice.updateMany({
      where: { userId, completedAt: null },
      data: { completedAt: now },
    });

    // Close the account, ending any in-effect status row first.
    await tx.accountStatusHistory.updateMany({
      where: { user_id: userId, end_date: null },
      data: { end_date: now },
    });
    await tx.accountStatusHistory.create({
      data: {
        user_id: userId,
        status: 'CLOSED',
        start_date: now,
        reason: options.reason,
        admin_id:
          options.initiatedBy === 'ADMIN'
            ? (options.actorUserId ?? null)
            : null,
      },
    });

    await logActionStrict(
      {
        userId: options.actorUserId ?? userId,
        action: 'ACCOUNT_ANONYMIZED',
        ip: 'unknown',
        targetUserId: userId,
        entityType: 'users',
        entityId: userId,
        details: {
          initiatedBy: options.initiatedBy,
          reason: options.reason,
          sanctionStatus: sanction?.status ?? null,
          ...(options.auditDetails ?? {}),
        },
      },
      tx,
    );

    return { pseudonym };
  }

  /**
   * Checks whether an email and/or display name may be (re-)registered.
   * Considers non-expired IdentityBlocks under the new keyed hash and, for
   * emails, the legacy salted hash — both in IdentityBlock rows (the
   * 20261011120000 migration copies legacy hashes verbatim) and in leftover
   * AntiAbuseShadow deletion rows.
   */
  static async isIdentityBlocked(identities: {
    email?: string;
    displayName?: string;
  }): Promise<IdentityBlockCheck> {
    const now = new Date();
    const notExpired = {
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    } as const;
    const result: IdentityBlockCheck = {
      emailBlocked: false,
      displayNameBlocked: false,
    };

    if (identities.email) {
      const legacyHash = legacyEmailHash(identities.email);
      const hashes = Array.from(
        new Set([hashIdentity('EMAIL', identities.email), legacyHash]),
      );
      const [block, legacyShadow] = await Promise.all([
        prisma.identityBlock.findFirst({
          where: { kind: 'EMAIL', hash: { in: hashes }, ...notExpired },
          select: { id: true },
        }),
        prisma.antiAbuseShadow.findFirst({
          where: { hash: legacyHash, ...notExpired },
          select: { id: true },
        }),
      ]);
      result.emailBlocked = Boolean(block) || Boolean(legacyShadow);
    }

    if (identities.displayName) {
      const block = await prisma.identityBlock.findFirst({
        where: {
          kind: 'DISPLAY_NAME',
          hash: hashIdentity('DISPLAY_NAME', identities.displayName),
          ...notExpired,
        },
        select: { id: true },
      });
      result.displayNameBlocked = Boolean(block);
    }

    return result;
  }

  /**
   * Records the email IdentityBlock for a ban/suspension, expiring with the
   * sanction's end date (null = permanent). Runs in the same transaction as
   * the status change and never weakens a stronger existing block.
   * Anonymized accounts have no plaintext address left to block.
   */
  static async recordSanctionBlock(
    tx: TransactionClient,
    userId: number,
    endDate: Date | null,
  ): Promise<void> {
    const user = await tx.users.findUnique({
      where: { id: userId },
      select: { email: true, anonymizedAt: true },
    });
    if (!user?.email || user.anonymizedAt) return;

    await upsertIdentityBlock(tx, {
      kind: 'EMAIL',
      hash: hashIdentity('EMAIL', user.email),
      reason: 'SANCTION',
      sourceUserId: userId,
      expiresAt: endDate,
    });
  }

  /**
   * Removes the user's SANCTION email blocks when a sanction is lifted
   * (account reactivated to ACTIVE by an admin action).
   */
  static async clearSanctionBlocks(
    tx: TransactionClient,
    userId: number,
  ): Promise<void> {
    const user = await tx.users.findUnique({
      where: { id: userId },
      select: { email: true, anonymizedAt: true },
    });
    if (!user?.email || user.anonymizedAt) return;
    await tx.identityBlock.deleteMany({
      where: {
        kind: 'EMAIL',
        hash: hashIdentity('EMAIL', user.email),
        reason: 'SANCTION',
        sourceUserId: userId,
      },
    });
  }

  /** Deletes expired IdentityBlocks and VeteranRecords (both retention windows). */
  static async purgeExpiredIdentityBlocks(): Promise<number> {
    const now = new Date();
    const [blocks, veterans] = await Promise.all([
      prisma.identityBlock.deleteMany({ where: { expiresAt: { lte: now } } }),
      prisma.veteranRecord.deleteMany({ where: { expiresAt: { lte: now } } }),
    ]);
    return blocks.count + veterans.count;
  }
}
