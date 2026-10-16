import argon2 from 'argon2';
import { randomBytes } from 'crypto';

import prisma from '@/lib/prisma';
import type {
  IdentityBlockKind,
  IdentityBlockReason,
} from '@/lib/prisma-exports';
import { Prisma } from '@/lib/prisma-exports';
import { AdminService } from '@/services/Admin.service';
import { getActiveAccountStatus } from '@/services/User.service';
import { resolveColorScheme } from '@/services/UserDefaults.service';
import { logActionStrict } from '@/utils/auditLogger';
import { hashIdentity, legacyEmailHash } from '@/utils/identityHash';
import { generateUniquePseudonym } from '@/utils/pseudonym';

/** Days a clean (unsanctioned) deletion keeps its email hash before purge. */
export const DELETION_COOLDOWN_DAYS = 30;

/** Suffix of anonymized addresses; identifies already-erased accounts. */
export const DELETED_EMAIL_SUFFIX = '@deleted.local';

/** Which flow triggered an erasure. */
export type AnonymizationInitiator = 'SELF' | 'ADMIN' | 'INACTIVITY';

export interface AnonymizeAccountOptions {
  /** Human-readable reason recorded on the CLOSED status row and audit log. */
  reason: string;
  /** Which flow triggered the erasure. */
  initiatedBy: AnonymizationInitiator;
  /** Acting staff user for ADMIN flows; also the audit actor. */
  actorUserId?: number;
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
 * Shared erasure path for forget-me, inactivity expiry and (future) admin
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
      },
    });
    if (!user) {
      throw new Error('User not found');
    }
    if (
      (user.email ?? '').endsWith(DELETED_EMAIL_SUFFIX) ||
      user.display_name.startsWith('deleted-user-')
    ) {
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
    const sanction =
      activeStatus &&
      (activeStatus.status === 'BANNED' || activeStatus.status === 'SUSPENDED')
        ? activeStatus
        : null;

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
      } else {
        // Clean deletion: 30-day anti-churn cooldown.
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
        display_name: pseudonym,
        password_hash: await argon2.hash(randomBytes(24).toString('hex')),
        twoFactorSecret: null,
        avatar: null,
        bio: '',
        recruit_link: randomBytes(16).toString('hex'),
        colorScheme: resolveColorScheme(user.colorScheme, user.race),
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
      select: { email: true },
    });
    if (!user?.email || user.email.endsWith(DELETED_EMAIL_SUFFIX)) return;

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
      select: { email: true },
    });
    if (!user?.email || user.email.endsWith(DELETED_EMAIL_SUFFIX)) return;
    await tx.identityBlock.deleteMany({
      where: {
        kind: 'EMAIL',
        hash: hashIdentity('EMAIL', user.email),
        reason: 'SANCTION',
        sourceUserId: userId,
      },
    });
  }

  /** Deletes IdentityBlocks whose retention window has elapsed. */
  static async purgeExpiredIdentityBlocks(): Promise<number> {
    const result = await prisma.identityBlock.deleteMany({
      where: { expiresAt: { lte: new Date() } },
    });
    return result.count;
  }
}
