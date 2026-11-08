import prisma from '@/lib/prisma';
import type {
  GiftCodeRecord,
  PaymentProviderName,
  PaymentRecord,
  SupporterHistoryResponse,
} from '@/types/supporter';

export async function getHistory(
  userId: number,
): Promise<SupporterHistoryResponse> {
  const [payments, gifts] = await Promise.all([
    prisma.payment.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.giftCode.findMany({
      where: { purchaserUserId: userId },
      include: {
        recipient: { select: { display_name: true } },
        redeemedBy: { select: { display_name: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
  ]);
  return {
    payments: payments.map(
      (p): PaymentRecord => ({
        id: p.id,
        kind: p.kind,
        status: p.status,
        amountCents: p.amountCents,
        refundedCents: p.refundedCents,
        taxCents: p.taxCents,
        currency: p.currency,
        description: p.description,
        createdAt: p.createdAt.toISOString(),
        allianceId: p.allianceId,
        provider: p.provider as PaymentProviderName,
        billingCountry: p.billingCountry,
      }),
    ),
    gifts: gifts.map(
      (g): GiftCodeRecord => ({
        id: g.id,
        codePrefix: g.codePrefix,
        months: g.months,
        status: g.revokedAt
          ? 'REVOKED'
          : g.redeemedAt
            ? 'REDEEMED'
            : g.expiresAt && g.expiresAt <= new Date()
              ? 'EXPIRED'
              : 'UNREDEEMED',
        recipientName: g.recipient?.display_name ?? null,
        redeemedByName: g.redeemedBy?.display_name ?? null,
        redeemedAt: g.redeemedAt?.toISOString() ?? null,
        expiresAt: g.expiresAt?.toISOString() ?? null,
        createdAt: g.createdAt.toISOString(),
      }),
    ),
  };
}
