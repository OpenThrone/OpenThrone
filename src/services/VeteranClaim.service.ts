import { createHash, randomBytes } from 'crypto';

import prisma from '@/lib/prisma';
import type { Prisma } from '@/lib/prisma-exports';
import { sendImmediate } from '@/services/Email.service';
import { renderEmail } from '@/services/emailTemplates';
import { logActionStrict } from '@/utils/auditLogger';
import { hashIdentity } from '@/utils/identityHash';
import { logError } from '@/utils/logger';

type Db = Prisma.TransactionClient | typeof prisma;

/** PasswordReset.type for veteran claim links. */
const CLAIM_TOKEN_TYPE = 'VETERAN_CLAIM';
/** A claim link stays valid for 30 days. */
const CLAIM_TOKEN_DAYS = 30;

const hashToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');

/** Why a claim was refused; the API maps each to a status and message. */
export type VeteranClaimError =
  | 'INVALID_LINK'
  | 'NOTHING_TO_CLAIM'
  | 'NAME_MISMATCH'
  | 'NAME_TAKEN';

export class VeteranClaimRefused extends Error {
  constructor(readonly code: VeteranClaimError) {
    super(code);
    this.name = 'VeteranClaimRefused';
  }
}

/** The unclaimed, unexpired veteran record for an email, if any. */
export function findClaimableRecord(db: Db, email: string) {
  return db.veteranRecord.findFirst({
    where: {
      emailHash: hashIdentity('EMAIL', email),
      claimedByUserId: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
  });
}

/**
 * Returning veterans prove they own the address before anything is granted:
 * sign-up never verifies email ownership, so the title, join date and
 * reserved name are released only through a link sent to that address.
 */
export class VeteranClaimService {
  /**
   * Emails a single-use claim link to the account's own address when a
   * record matches it. Earlier links are invalidated. Returns whether a link
   * was sent; never says why not.
   */
  static async sendClaimLink(userId: number): Promise<boolean> {
    const user = await prisma.users.findUnique({
      where: { id: userId },
      select: {
        email: true,
        display_name: true,
        locale: true,
        veteranTitle: true,
        anonymizedAt: true,
      },
    });
    if (!user?.email || user.anonymizedAt || user.veteranTitle) return false;
    if (!(await findClaimableRecord(prisma, user.email))) return false;

    const token = randomBytes(32).toString('hex');
    const reset = await prisma.$transaction(async (tx) => {
      await tx.passwordReset.updateMany({
        where: { userId, status: 0, type: CLAIM_TOKEN_TYPE },
        data: { status: 1 },
      });
      return tx.passwordReset.create({
        data: {
          userId,
          verificationCode: hashToken(token),
          type: CLAIM_TOKEN_TYPE,
          // Binds the link to the address it was sent to (keyed hash, never
          // the address): an email change voids it.
          oldEmail: hashIdentity('EMAIL', user.email),
        },
      });
    });

    try {
      // Sent directly, not queued: the outbox would store the link.
      const { subject, text, html } = renderEmail({
        kind: 'VETERAN_CLAIM',
        locale: user.locale,
        vars: { userId, display_name: user.display_name, claimToken: token },
      });
      await sendImmediate({ to: user.email, subject, text, html });
      return true;
    } catch (error) {
      await prisma.passwordReset.updateMany({
        where: { id: reset.id, status: 0 },
        data: { status: 1 },
      });
      logError('Failed to send veteran claim link', { userId, error });
      return false;
    }
  }

  /**
   * Redeems a claim link for the signed-in account: grants the title and
   * original join date and, when `displayName` matches the erased account's
   * reserved name, renames the account to it and releases the reservation.
   * All in one transaction; the link is used up on success.
   */
  static async claim(
    userId: number,
    token: string,
    displayName: string | undefined,
    ip: string,
  ) {
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
      const user = await tx.users.findUnique({
        where: { id: userId },
        select: { email: true, display_name: true, anonymizedAt: true },
      });
      if (!user?.email || user.anonymizedAt) {
        throw new VeteranClaimRefused('INVALID_LINK');
      }

      const link = await tx.passwordReset.findFirst({
        where: {
          userId,
          type: CLAIM_TOKEN_TYPE,
          status: 0,
          verificationCode: hashToken(token),
          oldEmail: hashIdentity('EMAIL', user.email),
          createdAt: {
            gt: new Date(Date.now() - CLAIM_TOKEN_DAYS * 86_400_000),
          },
        },
        select: { id: true },
      });
      if (!link) throw new VeteranClaimRefused('INVALID_LINK');

      const record = await findClaimableRecord(tx, user.email);
      if (!record) throw new VeteranClaimRefused('NOTHING_TO_CLAIM');

      let newName: string | null = null;
      const wanted = displayName?.trim();
      if (wanted && wanted !== user.display_name) {
        const nameHash = hashIdentity('DISPLAY_NAME', wanted);
        const block = await tx.identityBlock.findUnique({
          where: { kind_hash: { kind: 'DISPLAY_NAME', hash: nameHash } },
          select: { reason: true, sourceUserId: true },
        });
        if (
          nameHash !== record.displayNameHash ||
          block?.reason !== 'RESERVED_NAME' ||
          block.sourceUserId === null ||
          block.sourceUserId !== record.sourceUserId
        ) {
          throw new VeteranClaimRefused('NAME_MISMATCH');
        }
        const holder = await tx.users.findFirst({
          where: {
            display_name: { equals: wanted, mode: 'insensitive' },
            id: { not: userId },
          },
          select: { id: true },
        });
        if (holder) throw new VeteranClaimRefused('NAME_TAKEN');
        newName = wanted;
      }

      const claimed = await tx.veteranRecord.updateMany({
        where: { id: record.id, claimedByUserId: null },
        data: { claimedByUserId: userId, claimedAt: new Date() },
      });
      if (claimed.count !== 1) {
        throw new VeteranClaimRefused('NOTHING_TO_CLAIM');
      }
      await tx.users.update({
        where: { id: userId },
        data: {
          veteranTitle: record.title,
          veteranSince: record.originalJoinedAt,
          ...(newName ? { display_name: newName } : {}),
        },
      });
      if (newName) {
        await tx.identityBlock.deleteMany({
          where: {
            kind: 'DISPLAY_NAME',
            hash: record.displayNameHash,
            reason: 'RESERVED_NAME',
            sourceUserId: record.sourceUserId,
          },
        });
      }
      await tx.passwordReset.updateMany({
        where: { userId, type: CLAIM_TOKEN_TYPE, status: 0 },
        data: { status: 1 },
      });
      await logActionStrict(
        {
          userId,
          action: 'VETERAN_CLAIMED',
          ip,
          entityType: 'VeteranRecord',
          entityId: record.id,
          details: { title: record.title, nameRestored: Boolean(newName) },
        },
        tx,
      );

      return {
        title: record.title,
        veteranSince: record.originalJoinedAt,
        displayName: newName ?? user.display_name,
      };
    });
  }
}
