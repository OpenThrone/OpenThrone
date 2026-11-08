import { createHash, randomBytes } from 'node:crypto';

const url = process.env.POSTGRES_PRISMA_URL;
if (!url || process.env.NODE_ENV === 'production')
  throw new Error('A local development database is required');
const parsed = new URL(url);
if (
  !['postgres:', 'postgresql:'].includes(parsed.protocol) ||
  !['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname) ||
  ['host', 'hostaddr', 'service', 'servicefile', 'dbname', 'database'].some(
    (key) => parsed.searchParams.has(key),
  )
)
  throw new Error('A loopback database is required');

const { default: prisma } = await import('@/lib/prisma');
const DAY = 86_400_000;
const names = [
  'Supporter Active',
  'Supporter Past Due',
  'Supporter Canceling',
  'Supporter Gift',
  'Supporter Comp',
  'Supporter Expired',
  'Supporter Never',
  'Supporter Patron',
];
const now = Date.now();
try {
  await prisma.$transaction(async (tx) => {
    const raider = await tx.users.findUniqueOrThrow({
      where: { display_name: 'Dev Raider' },
    });
    const users = [];
    for (const [i, name] of names.entries()) {
      const user = await tx.users.upsert({
        where: { display_name: name },
        update: i < 2 ? { experience: raider.experience } : {},
        create: {
          experience: i < 2 ? raider.experience : 0,
          display_name: name,
          email: `supporter-seed-${i}@openthrone.local`,
          password_hash: `disabled-${randomBytes(32).toString('hex')}`,
          recruit_link: `supporter-seed-${i}`,
          race: 'HUMAN',
          class: 'FIGHTER',
          locale: 'en',
        },
      });
      users.push(user);
    }
    const states = [
      ['ACTIVE', 'SUBSCRIPTION'],
      ['PAST_DUE', 'SUBSCRIPTION'],
      ['ACTIVE', 'SUBSCRIPTION'],
      ['ACTIVE', 'GIFT'],
      ['ACTIVE', 'COMP'],
      ['EXPIRED', 'ONE_TIME'],
    ] as const;
    for (const [i, [status, source]] of states.entries()) {
      const end = new Date(now + [2, 90, 30, 120, 45, -10][i] * DAY);
      await tx.supporterMembership.upsert({
        where: { userId: users[i].id },
        create: {
          userId: users[i].id,
          status,
          source,
          provider: 'mock',
          currentPeriodEnd: end,
          cancelAtPeriodEnd: i === 2,
        },
        update: {
          status,
          source,
          currentPeriodEnd: end,
          cancelAtPeriodEnd: i === 2,
        },
      });
      await tx.users.update({
        where: { id: users[i].id },
        data: { supporter_until: status === 'EXPIRED' ? null : end },
      });
    }
    let alliance = await tx.alliances.findFirst({
      where: { name: 'Supporter Seed Alliance', leader_id: users[0].id },
    });
    if (!alliance)
      alliance = await tx.alliances.create({
        data: { name: 'Supporter Seed Alliance', leader_id: users[0].id },
      });
    let role = await tx.alliance_roles.findFirst({
      where: { alliance_id: alliance.id, name: 'Member' },
    });
    if (!role)
      role = await tx.alliance_roles.create({
        data: { alliance_id: alliance.id, name: 'Member' },
      });
    for (const user of users.slice(0, 3))
      await tx.alliance_memberships.upsert({
        where: {
          unique_alliance_user: { alliance_id: alliance.id, user_id: user.id },
        },
        create: {
          alliance_id: alliance.id,
          user_id: user.id,
          role_id: role.id,
        },
        update: { role_id: role.id },
      });
    await tx.allianceSponsorship.upsert({
      where: { allianceId: alliance.id },
      create: {
        allianceId: alliance.id,
        poolCents: 250,
        activeUntil: new Date(now + 60 * DAY),
      },
      update: { poolCents: 250, activeUntil: new Date(now + 60 * DAY) },
    });
    const payments = [];
    for (let i = 0; i < 18; i++) {
      const providerPaymentId = `supporter-seed-payment-${i}`;
      const payment = await tx.payment.upsert({
        where: { providerPaymentId },
        update: {},
        create: {
          userId: users[i % users.length].id,
          allianceId: i >= 16 ? alliance.id : null,
          kind:
            i >= 16
              ? 'ALLIANCE_SPONSORSHIP'
              : i >= 12
                ? 'GIFT'
                : 'SUBSCRIPTION',
          status:
            i === 0 ? 'REFUNDED' : i === 1 ? 'PARTIALLY_REFUNDED' : 'SUCCEEDED',
          amountCents: 499,
          refundedCents: i === 0 ? 499 : i === 1 ? 100 : 0,
          provider: 'mock',
          providerPaymentId,
          description: 'Supporter seed',
          createdAt: new Date(now - i * 5 * DAY),
        },
      });
      payments.push(payment);
      if (i < 2)
        await tx.paymentRefund.upsert({
          where: { providerRefundId: `supporter-seed-refund-${i}` },
          create: {
            paymentId: payment.id,
            amountCents: i === 0 ? 499 : 100,
            reason: 'Seed refund',
            providerRefundId: `supporter-seed-refund-${i}`,
          },
          update: {},
        });
    }
    for (let i = 0; i < 4; i++) {
      const codeHash = createHash('sha256')
        .update(`supporter-seed-code-${i}`)
        .digest('hex');
      await tx.giftCode.upsert({
        where: { codeHash },
        update: {},
        create: {
          codeHash,
          codePrefix: `SE${i}D`,
          months: 1,
          purchaserUserId: payments[12 + i].userId,
          paymentId: payments[12 + i].id,
          expiresAt: new Date(now + (i === 2 ? -1 : 365) * DAY),
          redeemedAt: i === 1 ? new Date(now - DAY) : null,
          redeemedByUserId: i === 1 ? users[3].id : null,
          revokedAt: i === 3 ? new Date(now - DAY) : null,
        },
      });
    }
    for (let i = 0; i < 5; i++)
      await tx.paymentEvent.upsert({
        where: { providerEventId: `supporter-seed-event-${i}` },
        update: {},
        create: {
          provider: 'mock',
          providerEventId: `supporter-seed-event-${i}`,
          type: 'invoice.paid',
          status: i === 0 ? 'FAILED' : 'PROCESSED',
          error: i === 0 ? 'Seeded failure' : null,
          summary: { userId: users[i].id, amountCents: 499 },
          processedAt: new Date(now - i * DAY),
        },
      });
    await tx.discordLink.upsert({
      where: { userId: users[0].id },
      update: {},
      create: {
        userId: users[0].id,
        discordUserId: 'supporter-seed-discord',
        discordUsername: 'Supporter Seed',
      },
    });
    await tx.serverSetting.upsert({
      where: { key: 'ENABLE_SUPPORTER' },
      create: {
        key: 'ENABLE_SUPPORTER',
        label: 'Enable supporter',
        type: 'BOOLEAN',
        value: true,
      },
      update: { value: true },
    });
  });
  for (const name of names) console.log(name);
} finally {
  await prisma.$disconnect();
}
