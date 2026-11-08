import { createHash, createHmac } from 'node:crypto';

import prisma from '@/lib/prisma';
import { grantDays } from '@/services/supporter/Entitlement.service';

import type { Prisma } from '../../../prisma/generated/prisma/client';

const hash = (code: string) =>
  createHash('sha256').update(code.trim().toUpperCase()).digest('hex');

type Db = Prisma.TransactionClient;

/**
 * Gift codes are derived from the paying payment and a server secret, so the
 * purchaser can be shown the code again (for example when the webhook
 * fulfilled the purchase before they returned from checkout). Only the hash
 * is stored.
 */
export function giftCodeFor(paymentId: number) {
  // JWT_SECRET is the secret .env.sample ships and the rest of the app (auth,
  // sealed replays) accepts in place of NEXTAUTH_SECRET. As a fallback it is
  // never used raw: like the replay and 2FA keys, a labelled key is derived
  // from it. The first two secrets keep their original derivation so codes
  // already issued under them still match.
  const jwtSecret = process.env.JWT_SECRET;
  const secret =
    process.env.GIFT_CODE_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    (jwtSecret
      ? createHmac('sha256', jwtSecret).update('ot-gift-key-v1').digest()
      : undefined);
  if (!secret)
    throw new Error(
      'GIFT_CODE_SECRET, NEXTAUTH_SECRET or JWT_SECRET is required',
    );
  const raw = createHmac('sha256', secret)
    .update(`ot-gift:${paymentId}`)
    .digest('hex')
    .slice(0, 12)
    .toUpperCase();
  return {
    code: `OT-${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8)}`,
    raw,
  };
}

/** The purchaser's still-redeemable code for a gift payment, or null. */
export async function revealGiftCode(
  purchaserUserId: number,
  paymentId: number,
  db: Db = prisma,
) {
  const gift = await db.giftCode.findFirst({
    where: { paymentId, purchaserUserId, redeemedAt: null, revokedAt: null },
  });
  if (!gift) return null;
  const { code } = giftCodeFor(paymentId);
  return hash(code) === gift.codeHash ? code : null;
}

/** Paid gift codes stay redeemable at least this long. */
export const GIFT_VALID_YEARS = 5;
/**
 * US states whose gift-certificate laws ban expiry (or may). Codes bought
 * with a billing address there, or with no known state, never expire. The
 * list errs on the generous side; counsel should confirm it before launch.
 */
export const NO_EXPIRY_GIFT_STATES = new Set([
  'CA',
  'CT',
  'FL',
  'MA',
  'ME',
  'MN',
  'NH',
  'NJ',
  'NY',
  'OR',
  'RI',
  'VT',
  'WA',
]);

export function giftExpiry(
  billing: { country?: string | null; state?: string | null },
  now = new Date(),
): Date | null {
  const state = billing.state?.toUpperCase();
  if (!state || billing.country !== 'US' || NO_EXPIRY_GIFT_STATES.has(state))
    return null;
  const end = new Date(now);
  end.setUTCFullYear(end.getUTCFullYear() + GIFT_VALID_YEARS);
  return end;
}

export async function createGift(
  purchaserUserId: number,
  paymentId: number,
  months: number,
  recipientUserId?: number,
  db: Db = prisma,
  billing: { country?: string | null; state?: string | null } = {},
) {
  if (![1, 3, 12].includes(months)) throw new Error('Invalid gift duration');
  const { code, raw } = giftCodeFor(paymentId);
  await db.giftCode.create({
    data: {
      codeHash: hash(code),
      codePrefix: raw.slice(0, 4),
      months,
      purchaserUserId,
      paymentId,
      recipientUserId,
      expiresAt: giftExpiry(billing),
    },
  });
  return code;
}

export async function redeemGift(userId: number, code: string) {
  return prisma.$transaction(async (tx) => {
    const gift = await tx.giftCode.findUnique({
      where: { codeHash: hash(code) },
    });
    if (!gift) throw new Error('Invalid gift code');
    const result = await tx.giftCode.updateMany({
      where: {
        id: gift.id,
        redeemedAt: null,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      data: { redeemedAt: new Date(), redeemedByUserId: userId },
    });
    if (result.count !== 1) throw new Error('Gift code is unavailable');
    const status = await grantDays(userId, gift.months * 30, 'GIFT', tx);
    return { status, monthsAdded: gift.months };
  });
}

export async function revokeUnredeemedGift(paymentId: number, db: Db = prisma) {
  await db.giftCode.updateMany({
    where: { paymentId, redeemedAt: null, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
