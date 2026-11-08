import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { beforeEach, describe, expect, spyOn, test } from 'bun:test';

import { ItemTypes } from '@/constants';
import prisma from '@/lib/prisma';
import {
  abandonExport,
  beginExport,
  completeExport,
  ExportError,
  streamAccountExport,
} from '@/services/AccountDataExport.service';
import {
  adminCancelErasure,
  adminExpediteErasure,
  adminOpenErasure,
  cancelErasure,
  confirmErasure,
  confirmInactivityErasure,
  ERASURE_GRACE_DAYS,
  ErasureError,
  executeErasure,
  hashErasureToken,
  processDueErasures,
  pruneErasureRecords,
  requestErasure,
} from '@/services/AccountErasure.service';
import { cancelInactivityOnLogin } from '@/services/AccountInactivity.service';
import { AllianceService } from '@/services/Alliance.service';
import { enqueueBattleAlert } from '@/services/BattleNotification.service';
import {
  enqueueDailyDigests,
  enqueueDiscordAlert,
  processDiscordOutboxOne,
} from '@/services/discord/DiscordAlerts.service';
import * as email from '@/services/Email.service';
import { purgeErasedModerationRecords } from '@/services/PrivacyRetention.service';
import * as billing from '@/services/supporter/AccountBilling.service';
import { TemporaryForceLedgerService as Ledger } from '@/services/TemporaryForceLedger.service';
import { createUser, getLoginBlockingStatus } from '@/services/User.service';
import { createInactivityErasureToken } from '@/utils/inactivityErasureToken';
import { ReauthError } from '@/utils/reauth';

import { resetDatabase } from './db';

const argon2 = require('argon2');

const PASSWORD = 'correct-horse-battery-staple';
const DAY_MS = 86_400_000;
process.env.NEXT_PUBLIC_URL_ROOT = 'https://example.test';

const sent: Array<{ to: string; subject: string; text: string }> = [];
spyOn(email, 'sendImmediate').mockImplementation((async (message: any) => {
  sent.push(message);
  return {};
}) as never);
const realStopBilling = billing.endSupporterBillingSoon;
const stopBilling = spyOn(billing, 'endSupporterBillingSoon').mockResolvedValue(
  undefined as never,
);
const lastToken = () => {
  const match = sent[sent.length - 1]?.text.match(/token=([0-9a-f]{64})/);
  if (!match) throw new Error('no confirmation token was emailed');
  return match[1];
};

let hash: string;
let alice: number; // erases her account
let bob: number; // the other side of shared records
let admin: number;
const ip = '203.0.113.7';

const newUser = async (name: string) =>
  (
    await createUser(
      `${name.toLowerCase()}@example.test`,
      hash,
      name,
      'HUMAN',
      'FIGHTER',
    )
  ).id;

/** request → email link → confirm: the account is now in its grace period. */
const scheduleErasure = async (userId: number) => {
  await requestErasure(userId, { password: PASSWORD, ip });
  return confirmErasure(lastToken(), ip);
};
const openRequest = (userId: number) =>
  prisma.accountErasureRequest.findFirstOrThrow({
    where: { userId },
    orderBy: { id: 'desc' },
  });
const makeDue = (requestId: number) =>
  prisma.accountErasureRequest.update({
    where: { id: requestId },
    data: { scheduledFor: new Date(Date.now() - 1000) },
  });

beforeEach(async () => {
  await resetDatabase();
  sent.length = 0;
  stopBilling.mockReset().mockResolvedValue(undefined as never);
  hash ??= await argon2.hash(PASSWORD);
  alice = await newUser('Alice');
  bob = await newUser('Bob');
  admin = await newUser('Admin');
  await prisma.staffRoleAssignment.create({
    data: { userId: admin, role: 'ADMINISTRATOR' },
  });
});

describe('erasure request state machine', () => {
  test('re-authentication is required and a wrong password creates nothing', async () => {
    await expect(
      requestErasure(alice, { password: 'wrong', ip }),
    ).rejects.toBeInstanceOf(ReauthError);
    expect(await prisma.accountErasureRequest.count()).toBe(0);
    expect(sent).toHaveLength(0);
  });

  test('request emails a single-use link and changes nothing until it is opened', async () => {
    const state = await requestErasure(alice, { password: PASSWORD, ip });
    expect(state.status).toBe('AWAITING_CONFIRMATION');
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe('alice@example.test');
    expect(await getLoginBlockingStatus(alice)).toBeNull();
    const request = await openRequest(alice);
    // Only the hash of the token is stored.
    expect(request.tokenHash).toBe(hashErasureToken(lastToken()));
    expect(JSON.stringify(request)).not.toContain(lastToken());
  });

  test('a second request replaces the first; at most one is ever open', async () => {
    await requestErasure(alice, { password: PASSWORD, ip });
    const firstToken = lastToken();
    await requestErasure(alice, { password: PASSWORD, ip });
    const rows = await prisma.accountErasureRequest.findMany({
      where: { userId: alice },
      orderBy: { id: 'asc' },
    });
    expect(rows.map((r) => r.status)).toEqual([
      'EXPIRED',
      'AWAITING_CONFIRMATION',
    ]);
    await expect(confirmErasure(firstToken, ip)).rejects.toMatchObject({
      code: 'invalid_token',
    });
    // The database also refuses a second live row.
    await expect(
      (async () =>
        prisma.accountErasureRequest.create({ data: { userId: alice } }))(),
    ).rejects.toThrow();
  });

  test('requests are limited to three an hour', async () => {
    for (let i = 0; i < 3; i++) {
      await requestErasure(alice, { password: PASSWORD, ip });
    }
    await expect(
      requestErasure(alice, { password: PASSWORD, ip }),
    ).rejects.toMatchObject({ code: 'rate_limited' });
  });

  test('confirming deactivates the account and starts the 14-day grace period', async () => {
    const before = Date.now();
    await requestErasure(alice, {
      password: PASSWORD,
      reason: 'taking a break',
      ip,
    });
    const token = lastToken();
    const { scheduledFor } = await confirmErasure(token, ip);

    const days = (scheduledFor.getTime() - before) / DAY_MS;
    expect(days).toBeGreaterThan(ERASURE_GRACE_DAYS - 0.01);
    expect(days).toBeLessThan(ERASURE_GRACE_DAYS + 0.01);
    expect(await getLoginBlockingStatus(alice)).toBe('CLOSED');
    const request = await openRequest(alice);
    expect(request.status).toBe('PENDING');
    expect(request.tokenHash).toBeNull();
    // The free text is never copied into the status history.
    const closed = await prisma.accountStatusHistory.findFirstOrThrow({
      where: { user_id: alice, status: 'CLOSED' },
    });
    expect(closed.reason).not.toContain('break');
    // Still intact: nothing is erased during the grace period.
    const user = await prisma.users.findUniqueOrThrow({ where: { id: alice } });
    expect(user.email).toBe('alice@example.test');
    expect(sent).toHaveLength(2); // confirmation link, then the scheduled notice
    // Using the link again does nothing.
    await expect(confirmErasure(token, ip)).rejects.toBeInstanceOf(
      ErasureError,
    );
  });

  test('an expired confirmation link is refused and the request lapses', async () => {
    await requestErasure(alice, { password: PASSWORD, ip });
    const token = lastToken();
    await prisma.accountErasureRequest.updateMany({
      where: { userId: alice },
      data: { tokenExpiresAt: new Date(Date.now() - 1000) },
    });
    await expect(confirmErasure(token, ip)).rejects.toMatchObject({
      code: 'invalid_token',
    });
    expect((await openRequest(alice)).status).toBe('EXPIRED');
    expect(await getLoginBlockingStatus(alice)).toBeNull();
  });

  test('cancelling during the grace period reactivates the account intact', async () => {
    await scheduleErasure(alice);
    expect(await getLoginBlockingStatus(alice)).toBe('CLOSED');

    expect(await cancelErasure(alice, { by: 'USER', ip })).toBe(true);

    expect(await getLoginBlockingStatus(alice)).toBeNull();
    const request = await openRequest(alice);
    expect(request.status).toBe('CANCELLED');
    expect(request.cancelledBy).toBe('USER');
    expect(request.userReason).toBeNull();
    // A cancelled request is never erased, even once it would have been due.
    await prisma.accountErasureRequest.update({
      where: { id: request.id },
      data: { scheduledFor: new Date(Date.now() - 1000) },
    });
    expect(await processDueErasures()).toMatchObject({ erased: 0 });
    const user = await prisma.users.findUniqueOrThrow({ where: { id: alice } });
    expect(user.email).toBe('alice@example.test');
    // A later request starts clean.
    await scheduleErasure(alice);
    expect((await openRequest(alice)).status).toBe('PENDING');
  });

  test('cancelling with nothing open does nothing', async () => {
    expect(await cancelErasure(alice, { by: 'USER', ip })).toBe(false);
  });

  test('staff accounts are refused: an administrator closes them instead', async () => {
    await expect(
      requestErasure(admin, { password: PASSWORD, ip }),
    ).rejects.toMatchObject({ code: 'staff_account' });
    await expect(
      adminOpenErasure(admin, {
        adminId: admin,
        reason: 'a long enough reason',
        ip,
      }),
    ).rejects.toMatchObject({ code: 'staff_account' });
  });

  test('nothing is erased before the grace period ends', async () => {
    await scheduleErasure(alice);
    expect(await processDueErasures()).toMatchObject({ erased: 0, failed: 0 });
    expect(await executeErasure((await openRequest(alice)).id)).toBe('not_due');
    const user = await prisma.users.findUniqueOrThrow({ where: { id: alice } });
    expect(user.email).toBe('alice@example.test');
  });

  test('after the grace period the daily job erases once, and repeating it is harmless', async () => {
    await scheduleErasure(alice);
    const request = await openRequest(alice);
    await makeDue(request.id);

    expect(await processDueErasures()).toEqual({
      erased: 1,
      failed: 0,
      expired: 0,
    });
    const user = await prisma.users.findUniqueOrThrow({ where: { id: alice } });
    expect(user.email).toBe(`${alice}-deleted@deleted.local`);
    expect(user.display_name).not.toBe('Alice');
    const done = await prisma.accountErasureRequest.findUniqueOrThrow({
      where: { id: request.id },
    });
    expect(done.status).toBe('COMPLETED');
    expect(done.completedAt).toBeInstanceOf(Date);
    expect(done.userReason).toBeNull();

    expect(await processDueErasures()).toEqual({
      erased: 0,
      failed: 0,
      expired: 0,
    });
    expect(await executeErasure(request.id)).toBe('not_pending');
    expect(
      await prisma.auditLog.count({
        where: { userId: alice, action: 'ACCOUNT_ANONYMIZED' },
      }),
    ).toBe(1);
  });

  test('a run that committed the erasure but not the bookkeeping is completed, not repeated', async () => {
    await scheduleErasure(alice);
    const request = await openRequest(alice);
    await makeDue(request.id);
    await prisma.$transaction((tx) =>
      import('@/services/AccountAnonymization.service').then(
        ({ AccountAnonymizationService }) =>
          AccountAnonymizationService.anonymizeAccount(tx, alice, {
            reason: 'User requested deletion',
            initiatedBy: 'SELF',
          }),
      ),
    );
    expect(await executeErasure(request.id)).toBe('already_erased');
    expect(
      (
        await prisma.accountErasureRequest.findUniqueOrThrow({
          where: { id: request.id },
        })
      ).status,
    ).toBe('COMPLETED');
  });

  test('a failing erasure is recorded for staff and retried, not lost', async () => {
    await scheduleErasure(alice);
    const request = await openRequest(alice);
    await makeDue(request.id);
    // Staff privileges granted during the grace period block a self-erasure.
    await prisma.staffRoleAssignment.create({
      data: { userId: alice, role: 'MODERATOR' },
    });

    const result = await processDueErasures();
    expect(result).toMatchObject({ erased: 0, failed: 1 });
    const stuck = await prisma.accountErasureRequest.findUniqueOrThrow({
      where: { id: request.id },
    });
    expect(stuck.status).toBe('PENDING');
    expect(stuck.attempts).toBe(1);
    expect(stuck.lastError).toContain('Staff accounts');

    await prisma.staffRoleAssignment.updateMany({
      where: { userId: alice },
      data: { revokedAt: new Date() },
    });
    expect(await processDueErasures()).toMatchObject({ erased: 1, failed: 0 });
    // A finished request keeps no error text.
    expect(
      (
        await prisma.accountErasureRequest.findUniqueOrThrow({
          where: { id: request.id },
        })
      ).lastError,
    ).toBeNull();
  });

  test('unopened confirmations lapse in the daily job', async () => {
    await requestErasure(alice, { password: PASSWORD, ip });
    await prisma.accountErasureRequest.updateMany({
      where: { userId: alice },
      data: { tokenExpiresAt: new Date(Date.now() - 1000) },
    });
    expect(await processDueErasures()).toMatchObject({ expired: 1 });
    expect((await openRequest(alice)).status).toBe('EXPIRED');
  });

  test('finished requests are pruned after a year', async () => {
    await scheduleErasure(alice);
    const request = await openRequest(alice);
    await makeDue(request.id);
    await processDueErasures();
    await pruneErasureRecords();
    expect(await prisma.accountErasureRequest.count()).toBe(1);
    await prisma.accountErasureRequest.update({
      where: { id: request.id },
      data: { requestedAt: new Date(Date.now() - 400 * DAY_MS) },
    });
    await pruneErasureRecords();
    expect(await prisma.accountErasureRequest.count()).toBe(0);
  });
});

describe('what erasure removes, anonymizes and keeps', () => {
  const seed = async () => {
    await prisma.users.update({
      where: { id: alice },
      data: { bio: 'private bio', avatar: 'custom.png' },
    });
    await prisma.loginEvent.create({
      data: { userId: alice, ipHash: 'hash-1', deviceHash: 'dev-1' },
    });
    await prisma.auditLog.create({
      data: {
        userId: alice,
        action: 'LOGIN',
        ip: '198.51.100.4',
        ipHash: 'h',
        requestId: 'r-1',
      },
    });
    await prisma.social.create({
      data: {
        playerId: alice,
        friendId: bob,
        relationshipType: 'friend',
        status: 'accepted',
      },
    });
    await prisma.recruit_history.createMany({
      data: [
        {
          to_user: alice,
          from_user: bob,
          ip_addr: 'alice-own-ip',
          timestamp: new Date(),
        },
        {
          to_user: bob,
          from_user: alice,
          ip_addr: 'bobs-recruit-ip',
          timestamp: new Date(),
        },
      ],
    });
    await prisma.messages.createMany({
      data: [
        {
          from_user_id: alice,
          to_user_id: bob,
          subject: 'ALICE-SUBJECT',
          body: 'ALICE-WORDS',
        },
        {
          from_user_id: bob,
          to_user_id: alice,
          subject: 'BOB-SUBJECT',
          body: 'BOB-WORDS',
        },
      ],
    });
    const log = await prisma.attack_log.create({
      data: {
        attacker_id: alice,
        defender_id: bob,
        winner: alice,
        stats: { turns: 3 },
        timestamp: new Date(),
      },
    });
    await prisma.payment.create({
      data: {
        userId: alice,
        kind: 'SUBSCRIPTION',
        status: 'SUCCEEDED',
        amountCents: 499,
        provider: 'mock',
        providerPaymentId: 'pay_alice_1',
        description: 'supporter_monthly',
        billingCountry: 'US',
      },
    });
    const client = await prisma.apiClient.create({
      data: { ownerUserId: alice, name: 'My private bot' },
    });
    const token = await prisma.apiToken.create({
      data: {
        clientId: client.id,
        tokenPrefix: 'tp1',
        tokenHash: 'th',
        lastIpHash: 'ip-h',
      },
    });
    await prisma.apiTokenAudit.create({
      data: {
        tokenId: token.id,
        action: 'use',
        route: '/x',
        method: 'GET',
        statusCode: 200,
        ipHash: 'a',
        uaHash: 'b',
      },
    });
    await prisma.accountDataExport.create({ data: { userId: alice } });
    await prisma.cheatSignal.create({
      data: {
        userId: alice,
        type: 'GOLD_SPIKE',
        severity: 'LOW',
        score: 1,
        summary: 'INTERNAL-CHEAT-NOTE',
        evidence: {},
      },
    });
    await prisma.moderatorNote.create({
      data: { userId: alice, authorUserId: admin, note: 'INTERNAL-STAFF-NOTE' },
    });
    await prisma.activityDay.create({
      data: { userId: alice, day: new Date('2026-10-01'), lastAt: new Date() },
    });
    // Another player's signal that links to Alice.
    await prisma.cheatSignal.create({
      data: {
        userId: bob,
        type: 'GOLD_SPIKE',
        severity: 'LOW',
        score: 1,
        summary: 'bob signal',
        evidence: {},
        linkedUserIds: [alice, admin],
      },
    });
    await prisma.report.create({
      data: {
        reporterUserId: alice,
        reportedUserId: bob,
        category: 'SPAM',
        status: 'RESOLVED',
        subject: 'S',
        description: 'ALICE-REPORT-TEXT',
      },
    });
    await prisma.report.create({
      data: {
        reporterUserId: bob,
        reportedUserId: alice,
        category: 'SPAM',
        status: 'OPEN',
        description: 'BOB-REPORT-ABOUT-ALICE',
      },
    });
    return log.id;
  };

  test('table by table', async () => {
    const logId = await seed();
    await scheduleErasure(alice);
    await makeDue((await openRequest(alice)).id);
    await processDueErasures();

    // Erased
    expect(await prisma.loginEvent.count({ where: { userId: alice } })).toBe(0);
    expect(await prisma.social.count()).toBe(0);
    expect(
      await prisma.accountDataExport.count({ where: { userId: alice } }),
    ).toBe(0);
    expect(await prisma.apiTokenAudit.count()).toBe(0);
    expect(await prisma.cheatSignal.count({ where: { userId: alice } })).toBe(
      0,
    );
    expect(await prisma.moderatorNote.count({ where: { userId: alice } })).toBe(
      0,
    );
    expect(await prisma.activityDay.count({ where: { userId: alice } })).toBe(
      0,
    );
    expect(
      (await prisma.cheatSignal.findFirstOrThrow({ where: { userId: bob } }))
        .linkedUserIds,
    ).toEqual([admin]);
    const apiClient = await prisma.apiClient.findFirstOrThrow({
      where: { ownerUserId: alice },
    });
    expect(apiClient.name).toBe('deleted');
    expect(apiClient.status).toBe('DISABLED');
    expect(
      (
        await prisma.apiToken.findFirstOrThrow({
          where: { tokenPrefix: 'tp1' },
        })
      ).lastIpHash,
    ).toBeNull();
    const user = await prisma.users.findUniqueOrThrow({ where: { id: alice } });
    expect(user.bio).toBe('');
    expect(user.avatar).toBeNull();

    // Anonymized: the rows stay, the identifiers go
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { userId: alice, action: 'LOGIN' },
    });
    expect([audit.ip, audit.ipHash, audit.requestId]).toEqual(['', null, null]);
    const own = await prisma.recruit_history.findFirstOrThrow({
      where: { to_user: alice },
    });
    expect(own.ip_addr).toBe('');
    const authored = await prisma.messages.findFirstOrThrow({
      where: { from_user_id: alice },
    });
    expect([authored.subject, authored.body]).toEqual(['', '']);
    const filed = await prisma.report.findFirstOrThrow({
      where: { reporterUserId: alice },
    });
    expect([filed.subject, filed.description]).toEqual([null, '']);
    const banned = await prisma.banAppeal.count({ where: { userId: alice } });
    expect(banned).toBe(0);

    // Kept: other players' records, and records the law or accounting needs
    const recruited = await prisma.recruit_history.findFirstOrThrow({
      where: { from_user: alice },
    });
    expect(recruited.ip_addr).toBe('bobs-recruit-ip');
    const received = await prisma.messages.findFirstOrThrow({
      where: { to_user_id: alice },
    });
    expect(received.body).toBe('BOB-WORDS');
    const against = await prisma.report.findFirstOrThrow({
      where: { reportedUserId: alice },
    });
    expect(against.description).toBe('BOB-REPORT-ABOUT-ALICE');
    const payment = await prisma.payment.findFirstOrThrow({
      where: { userId: alice },
    });
    expect([payment.amountCents, payment.billingCountry]).toEqual([499, 'US']);
    // Bob still sees the battle, now against a pseudonym rather than Alice.
    const battle = await prisma.attack_log.findUniqueOrThrow({
      where: { id: logId },
      include: {
        attackerPlayer: { select: { display_name: true, email: true } },
      },
    });
    expect(battle.attackerPlayer.display_name).not.toBe('Alice');
    expect(battle.attackerPlayer.email).toContain('@deleted.local');
  });

  test('a sanction keeps the moderation file until it ends, then the daily purge removes it', async () => {
    await seed();
    await prisma.accountStatusHistory.create({
      data: {
        user_id: alice,
        status: 'BANNED',
        start_date: new Date(Date.now() - DAY_MS),
        reason: 'cheating',
      },
    });
    await prisma.users.update({ where: { id: alice }, data: {} });
    // A banned player cannot sign in, so staff open the request on a verified support request.
    await adminOpenErasure(alice, {
      adminId: admin,
      reason: 'verified support ticket 1',
      ip,
    });
    await makeDue((await openRequest(alice)).id);
    await processDueErasures();

    expect(await prisma.cheatSignal.count({ where: { userId: alice } })).toBe(
      1,
    );
    expect(await prisma.moderatorNote.count({ where: { userId: alice } })).toBe(
      1,
    );
    // Sign-in data is erased regardless.
    expect(await prisma.loginEvent.count({ where: { userId: alice } })).toBe(0);
    // While the sanction block is live the purge leaves the file alone.
    expect(await purgeErasedModerationRecords()).toBe(0);
    expect(await prisma.cheatSignal.count({ where: { userId: alice } })).toBe(
      1,
    );

    await prisma.identityBlock.updateMany({
      where: { sourceUserId: alice, reason: 'SANCTION' },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(await purgeErasedModerationRecords()).toBe(1);
    expect(await prisma.cheatSignal.count({ where: { userId: alice } })).toBe(
      0,
    );
    expect(await prisma.moderatorNote.count({ where: { userId: alice } })).toBe(
      0,
    );
    expect(await purgeErasedModerationRecords()).toBe(0);
  });
});

describe('references in other accounts’ signals', () => {
  test('an account erased during a sanction, with no signals of its own, is cleaned once the sanction ends', async () => {
    await prisma.cheatSignal.create({
      data: {
        userId: bob,
        relatedUserId: alice,
        type: 'GOLD_SPIKE',
        severity: 'LOW',
        score: 1,
        summary: 'bob signal',
        evidence: {},
        linkedUserIds: [alice, admin],
      },
    });
    await prisma.accountStatusHistory.create({
      data: {
        user_id: alice,
        status: 'BANNED',
        start_date: new Date(Date.now() - DAY_MS),
      },
    });
    await adminOpenErasure(alice, {
      adminId: admin,
      reason: 'verified support ticket 20',
      ip,
    });
    await makeDue((await openRequest(alice)).id);
    await processDueErasures();

    const signal = () =>
      prisma.cheatSignal.findFirstOrThrow({ where: { userId: bob } });
    // Kept while the sanction runs.
    expect((await signal()).linkedUserIds).toEqual([alice, admin]);
    expect(await purgeErasedModerationRecords()).toBe(0);

    await prisma.identityBlock.updateMany({
      where: { sourceUserId: alice, reason: 'SANCTION' },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(await purgeErasedModerationRecords()).toBe(1);
    const cleaned = await signal();
    expect(cleaned.linkedUserIds).toEqual([admin]);
    expect(cleaned.relatedUserId).toBeNull();
    expect(await purgeErasedModerationRecords()).toBe(0);
  });
});

describe('alliance free text', () => {
  test('the erased player’s own text goes; what others wrote about them stays; the export lists their own', async () => {
    await prisma.users.update({
      where: { id: alice },
      data: { experience: 1000000, gold: 100000000n },
    });
    const alliance = await AllianceService.createAlliance(alice, {
      name: 'Privacy test',
      motto: 'Synthetic data only',
    });
    const a = alliance.id;
    // #318: erasing the last member dissolves the alliance, but this suite
    // asserts which rows survive erasure — keep the alliance alive with a
    // second member (who also succeeds alice as leader).
    const privacyRole = await prisma.alliance_roles.findFirstOrThrow({
      where: { alliance_id: a },
    });
    await prisma.alliance_memberships.create({
      data: { alliance_id: a, user_id: bob, role_id: privacyRole.id },
    });
    const log = await prisma.attack_log.create({
      data: {
        attacker_id: alice,
        defender_id: bob,
        winner: alice,
        stats: {},
        timestamp: new Date(),
      },
    });
    await prisma.alliance_bank_history.createMany({
      data: [
        {
          alliance_id: a,
          transaction_type: 'DEPOSIT',
          amount: 5n,
          performed_by_user_id: alice,
          notes: 'ALICE-BANK-NOTE',
        },
        {
          alliance_id: a,
          transaction_type: 'DEPOSIT',
          amount: 5n,
          performed_by_user_id: bob,
          related_user_id: alice,
          notes: 'BOB-BANK-NOTE',
        },
      ],
    });
    await prisma.alliance_gold_requests.create({
      data: {
        alliance_id: a,
        requester_id: alice,
        amount: 10n,
        reason: 'ALICE-GOLD-REASON',
      },
    });
    await prisma.alliance_loans.create({
      data: {
        alliance_id: a,
        borrower_id: alice,
        principal: 10n,
        interest_pct: 1,
        amount_owed: 10n,
        reason: 'ALICE-LOAN-REASON',
      },
    });
    await prisma.alliance_list_entries.createMany({
      data: [
        {
          alliance_id: a,
          list_type: 'HIT',
          target_user_id: bob,
          added_by: alice,
          note: 'ALICE-LIST-NOTE',
        },
        {
          alliance_id: a,
          list_type: 'HIT',
          target_user_id: alice,
          added_by: bob,
          note: 'BOB-ABOUT-ALICE',
        },
      ],
    });
    await prisma.alliance_target_calls.createMany({
      data: [
        {
          alliance_id: a,
          target_user_id: bob,
          call_type: 'HIT',
          created_by: alice,
          note: 'ALICE-CALL-NOTE',
        },
        {
          alliance_id: a,
          target_user_id: alice,
          call_type: 'HIT',
          created_by: bob,
          note: 'BOB-CALL-ABOUT-ALICE',
        },
      ],
    });
    await prisma.alliance_intel_shares.create({
      data: {
        alliance_id: a,
        attack_log_id: log.id,
        shared_by: alice,
        note: 'ALICE-INTEL-NOTE',
      },
    });
    await prisma.alliance_announcements.create({
      data: {
        alliance_id: a,
        author_id: alice,
        title: 'ALICE-ANNOUNCEMENT',
        body: 'kept text',
      },
    });

    // The export lists the player's own alliance text before erasure.
    let text = '';
    await streamAccountExport(alice, (chunk) => {
      text += chunk;
    });
    for (const own of [
      'ALICE-BANK-NOTE',
      'ALICE-GOLD-REASON',
      'ALICE-LOAN-REASON',
      'ALICE-LIST-NOTE',
      'ALICE-CALL-NOTE',
      'ALICE-INTEL-NOTE',
      'ALICE-ANNOUNCEMENT',
    ]) {
      expect(text, own).toContain(own);
    }
    for (const others of [
      'BOB-BANK-NOTE',
      'BOB-ABOUT-ALICE',
      'BOB-CALL-ABOUT-ALICE',
    ]) {
      expect(text, others).not.toContain(others);
    }

    await adminOpenErasure(alice, {
      adminId: admin,
      reason: 'verified support ticket 30',
      ip,
    }).catch(() => undefined);
    await scheduleErasure(alice).catch(() => undefined);
    const open = await openRequest(alice);
    await makeDue(open.id);
    await processDueErasures();

    const notes = async () =>
      JSON.stringify([
        await prisma.alliance_bank_history.findMany({
          select: { notes: true },
          orderBy: { id: 'asc' },
        }),
        await prisma.alliance_gold_requests.findMany({
          select: { reason: true },
        }),
        await prisma.alliance_loans.findMany({ select: { reason: true } }),
        await prisma.alliance_list_entries.findMany({
          select: { note: true },
          orderBy: { id: 'asc' },
        }),
        await prisma.alliance_target_calls.findMany({
          select: { note: true },
          orderBy: { id: 'asc' },
        }),
        await prisma.alliance_intel_shares.findMany({ select: { note: true } }),
      ]);
    const after = await notes();
    for (const own of [
      'ALICE-BANK-NOTE',
      'ALICE-GOLD-REASON',
      'ALICE-LOAN-REASON',
      'ALICE-LIST-NOTE',
      'ALICE-CALL-NOTE',
      'ALICE-INTEL-NOTE',
    ]) {
      expect(after, own).not.toContain(own);
    }
    for (const others of [
      'BOB-BANK-NOTE',
      'BOB-ABOUT-ALICE',
      'BOB-CALL-ABOUT-ALICE',
    ]) {
      expect(after, others).toContain(others);
    }
    // Owner decision: announcements stay under the pseudonym.
    expect((await prisma.alliance_announcements.findFirstOrThrow()).title).toBe(
      'ALICE-ANNOUNCEMENT',
    );
  });
});

describe('erasure leaves alliances (#318)', () => {
  const DAY = 86_400_000;
  const equipment = [
    ...new Set(
      ItemTypes.filter((item) => item.usage === 'OFFENSE').map(
        (item) => item.type,
      ),
    ),
  ].map((type) => ({ type, level: 1 }));

  const erase = async (userId: number) => {
    await scheduleErasure(userId);
    const open = await openRequest(userId);
    await makeDue(open.id);
    await processDueErasures();
  };

  test('an erased leader is succeeded by the highest-ranked member', async () => {
    await prisma.users.update({
      where: { id: alice },
      data: { experience: 1_000_000, gold: 100_000_000n },
    });
    const alliance = await AllianceService.createAlliance(alice, {
      name: 'Succession pact',
    });
    const officerRole = await prisma.alliance_roles.create({
      data: { alliance_id: alliance.id, name: 'Officer', rank_order: 1 },
    });
    const elderRole = await prisma.alliance_roles.create({
      data: { alliance_id: alliance.id, name: 'Elder', rank_order: 5 },
    });
    const carol = await newUser('Carol');
    await prisma.alliance_memberships.createMany({
      data: [
        {
          alliance_id: alliance.id,
          user_id: bob,
          role_id: officerRole.id,
          created_at: new Date(Date.now() - DAY),
        },
        {
          alliance_id: alliance.id,
          user_id: carol,
          role_id: elderRole.id,
          created_at: new Date(Date.now() - 30 * DAY),
        },
      ],
    });

    await erase(alice);

    // Highest role wins even though the elder member joined first.
    const after = await prisma.alliances.findUniqueOrThrow({
      where: { id: alliance.id },
      select: { leader_id: true },
    });
    expect(after.leader_id).toBe(bob);
    expect(
      await prisma.alliance_memberships.findFirst({
        where: { alliance_id: alliance.id, user_id: alice },
      }),
    ).toBeNull();
    expect(
      await prisma.alliance_memberships.count({
        where: { alliance_id: alliance.id },
      }),
    ).toBe(2);
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'ALLIANCE_LEADER_SUCCEEDED_ON_ERASURE' },
    });
    expect(audit.entityId).toBe(alliance.id);
    expect(audit.details).toMatchObject({
      previousLeaderId: alice,
      newLeaderId: bob,
      reason: 'ACCOUNT_ERASURE',
    });
  });

  test('role ties in succession go to the longest-standing member', async () => {
    await prisma.users.update({
      where: { id: alice },
      data: { experience: 1_000_000, gold: 100_000_000n },
    });
    const alliance = await AllianceService.createAlliance(alice, {
      name: 'Tiebreak pact',
    });
    const role = await prisma.alliance_roles.findFirstOrThrow({
      where: { alliance_id: alliance.id },
    });
    const carol = await newUser('Carol');
    await prisma.alliance_memberships.createMany({
      data: [
        {
          alliance_id: alliance.id,
          user_id: bob,
          role_id: role.id,
          created_at: new Date(Date.now() - DAY),
        },
        {
          alliance_id: alliance.id,
          user_id: carol,
          role_id: role.id,
          created_at: new Date(Date.now() - 30 * DAY),
        },
      ],
    });

    await erase(alice);

    const after = await prisma.alliances.findUniqueOrThrow({
      where: { id: alliance.id },
      select: { leader_id: true },
    });
    expect(after.leader_id).toBe(carol);
  });

  test("an erased last member's alliance is dissolved through the disband path", async () => {
    await prisma.users.update({
      where: { id: alice },
      data: { gold: 100_000_000n },
    });
    const alliance = await prisma.alliances.create({
      data: {
        name: 'Lone wolves',
        leader_id: alice,
        gold_in_bank: 5_000_000n,
        alliance_roles: { create: { name: 'Member' } },
      },
      include: { alliance_roles: true },
    });
    await prisma.alliance_memberships.create({
      data: {
        alliance_id: alliance.id,
        user_id: alice,
        role_id: alliance.alliance_roles[0]!.id,
      },
    });

    await erase(alice);

    expect(
      await prisma.alliances.findUnique({ where: { id: alliance.id } }),
    ).toBeNull();
    expect(
      await prisma.alliance_memberships.count({
        where: { alliance_id: alliance.id },
      }),
    ).toBe(0);
    // The shared disband teardown pays the treasury out to the members.
    expect(
      (await prisma.users.findUniqueOrThrow({ where: { id: alice } })).gold,
    ).toBe(105_000_000n);
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'ALLIANCE_DISSOLVED_ON_ERASURE' },
    });
    expect(audit.entityId).toBe(alliance.id);
  });

  test('forces the erased player borrowed from the reserve are returned', async () => {
    for (const userId of [bob, alice]) {
      await prisma.users.update({
        where: { id: userId },
        data: { fort_level: 12, gold: 100_000_000n },
      });
      await prisma.userStructureUpgrade.updateMany({
        where: { userId, type: 'ARMORY' },
        data: { level: 12 },
      });
      await prisma.userUnit.updateMany({
        where: { userId, type: 'OFFENSE', level: 1 },
        data: { quantity: 100 },
      });
      for (const item of equipment)
        await prisma.userItem.upsert({
          where: {
            userId_type_usage_level: {
              userId,
              type: item.type,
              level: 1,
              usage: 'OFFENSE',
            },
          },
          create: {
            userId,
            type: item.type,
            level: 1,
            usage: 'OFFENSE',
            quantity: 100,
          },
          update: { quantity: 100 },
        });
    }
    const alliance = await prisma.alliances.create({
      data: {
        name: 'Force pact',
        leader_id: bob,
        alliance_roles: { create: { name: 'Member' } },
      },
      include: { alliance_roles: true },
    });
    const roleId = alliance.alliance_roles[0]!.id;
    await prisma.alliance_memberships.createMany({
      data: [bob, alice].map((user_id) => ({
        alliance_id: alliance.id,
        user_id,
        role_id: roleId,
      })),
    });
    await Ledger.savePolicy(alliance.id, bob, {
      lendingMode: 'ROLE_ALLOWANCE',
      roleAllowances: [
        {
          roleId,
          maxBorrowed: 100,
          maxTermDays: 7,
          pillageRateBps: 200,
          loanRateBps: 500,
        },
      ],
    });
    const donorUnit = await prisma.userUnit.findFirstOrThrow({
      where: { userId: bob, type: 'OFFENSE' },
    });
    await Ledger.contribute({
      allianceId: alliance.id,
      userId: bob,
      unitId: donorUnit.id,
      quantity: 10,
      equipment,
      operationId: randomUUID(),
    });
    const contract = await Ledger.requestLoan({
      allianceId: alliance.id,
      userId: alice,
      reserveId: (
        await prisma.forceReserve.findFirstOrThrow({
          where: { allianceId: alliance.id },
        })
      ).id,
      quantity: 8,
      termDays: 1,
      operationId: randomUUID(),
    });
    expect(contract.status).toBe('ACTIVE');

    await erase(alice);

    expect(
      (
        await prisma.forceContract.findUniqueOrThrow({
          where: { id: contract.id },
        })
      ).status,
    ).toBe('RECALLED');
    expect(
      await prisma.forceReserve.findFirstOrThrow({
        where: { allianceId: alliance.id },
      }),
    ).toMatchObject({ available: 10, woundedQuantity: 0 });
    expect(
      await prisma.alliance_memberships.count({
        where: { alliance_id: alliance.id },
      }),
    ).toBe(1);
  });

  test("an erased member's outstanding loan is collected but never forgiven", async () => {
    const alliance = await prisma.alliances.create({
      data: {
        name: 'Debt pact',
        leader_id: bob,
        gold_in_bank: 1_000_000n,
        alliance_roles: { create: { name: 'Member' } },
      },
      include: { alliance_roles: true },
    });
    const roleId = alliance.alliance_roles[0]!.id;
    await prisma.alliance_memberships.createMany({
      data: [bob, alice].map((user_id) => ({
        alliance_id: alliance.id,
        user_id,
        role_id: roleId,
      })),
    });
    await prisma.users.update({
      where: { id: alice },
      data: { gold: 100_000n, gold_in_bank: 0n },
    });
    await prisma.alliance_loans.create({
      data: {
        alliance_id: alliance.id,
        borrower_id: alice,
        principal: 1_000_000n,
        interest_pct: 10,
        amount_owed: 1_100_000n,
        status: 'ACTIVE',
        due_at: new Date(Date.now() + DAY),
      },
    });

    await erase(alice);

    // Collection takes the gold on hand; the rest of the debt stays on the
    // pseudonymous account (#13: leaving never forgives).
    const loan = await prisma.alliance_loans.findFirstOrThrow({
      where: { alliance_id: alliance.id, borrower_id: alice },
    });
    expect(loan.status).toBe('ACTIVE');
    expect(loan.amount_repaid).toBe(100_000n);
    expect(
      (await prisma.users.findUniqueOrThrow({ where: { id: alice } })).gold,
    ).toBe(0n);
    expect(
      await prisma.alliance_memberships.count({
        where: { alliance_id: alliance.id },
      }),
    ).toBe(1);
    expect(
      (
        await prisma.alliances.findUniqueOrThrow({
          where: { id: alliance.id },
          select: { leader_id: true },
        })
      ).leader_id,
    ).toBe(bob);
  });
});

describe('accounts erased before the marker existed', () => {
  test('the migration backfill marks them, and the purge then treats them like any erased account', async () => {
    const legacy = await createUser(
      'old@example.test',
      hash,
      'LegacyOne',
      'HUMAN',
      'FIGHTER',
    );
    // What alpha wrote before: the scrubbed address, no marker, and an audit row.
    await prisma.users.update({
      where: { id: legacy.id },
      data: { email: `${legacy.id}-deleted@deleted.local` },
    });
    await prisma.auditLog.create({
      data: {
        userId: legacy.id,
        action: 'ACCOUNT_ANONYMIZED',
        ip: 'unknown',
        targetUserId: legacy.id,
        timestamp: new Date('2026-10-01T00:00:00Z'),
      },
    });
    await prisma.cheatSignal.create({
      data: {
        userId: legacy.id,
        type: 'GOLD_SPIKE',
        severity: 'LOW',
        score: 1,
        summary: 'old signal',
        evidence: {},
      },
    });
    await prisma.moderatorNote.create({
      data: { userId: legacy.id, authorUserId: admin, note: 'old note' },
    });
    // A look-alike a player could have chosen is not backfilled.
    const lookalike = await createUser(
      'x@deleted.local',
      hash,
      'Lookalike',
      'HUMAN',
      'FIGHTER',
    );
    await prisma.cheatSignal.create({
      data: {
        userId: lookalike.id,
        type: 'GOLD_SPIKE',
        severity: 'LOW',
        score: 1,
        summary: 'live signal',
        evidence: {},
      },
    });

    // Without the backfill nothing is eligible.
    expect(await purgeErasedModerationRecords()).toBe(0);

    // The statement exactly as the migration runs it.
    const migration = readFileSync(
      path.join(
        process.cwd(),
        'prisma/migrations/20261030180000_privacy_self_service/migration.sql',
      ),
      'utf8',
    );
    const backfill = migration
      .split('\n')
      .find((line) => line.startsWith('UPDATE "users"'));
    expect(backfill).toBeDefined();
    await prisma.$executeRawUnsafe(backfill as string);

    const marked = await prisma.users.findUniqueOrThrow({
      where: { id: legacy.id },
    });
    expect(marked.anonymizedAt?.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(
      (await prisma.users.findUniqueOrThrow({ where: { id: lookalike.id } }))
        .anonymizedAt,
    ).toBeNull();

    expect(await purgeErasedModerationRecords()).toBe(1);
    expect(
      await prisma.cheatSignal.count({ where: { userId: legacy.id } }),
    ).toBe(0);
    expect(
      await prisma.moderatorNote.count({ where: { userId: legacy.id } }),
    ).toBe(0);
    expect(
      await prisma.cheatSignal.count({ where: { userId: lookalike.id } }),
    ).toBe(1);
  });
});

describe('older erased-account checks use the marker', () => {
  test('a live account on the reserved domain keeps its billing in the daily sweep', async () => {
    const live = await createUser(
      'old-player@deleted.local',
      hash,
      'OldLive',
      'HUMAN',
      'FIGHTER',
    );
    await prisma.supporterMembership.create({
      data: {
        userId: live.id,
        status: 'ACTIVE',
        source: 'SUBSCRIPTION',
        provider: 'mock',
        providerSubscriptionId: 'sub_live',
        subscriptionPeriodEnd: new Date(Date.now() + 20 * DAY_MS),
        currentPeriodEnd: new Date(Date.now() + 20 * DAY_MS),
        cancelAtPeriodEnd: false,
      },
    });
    await billing.sweepEndedAccountBilling();
    expect(
      (
        await prisma.supporterMembership.findUniqueOrThrow({
          where: { userId: live.id },
        })
      ).status,
    ).toBe('ACTIVE');

    // An erased account's subscription is still ended at once.
    await prisma.users.update({
      where: { id: live.id },
      data: { anonymizedAt: new Date() },
    });
    await billing.sweepEndedAccountBilling();
    expect(
      (
        await prisma.supporterMembership.findUniqueOrThrow({
          where: { userId: live.id },
        })
      ).status,
    ).not.toBe('ACTIVE');
  });

  test('cancelling clears an earlier failure from the request', async () => {
    await scheduleErasure(alice);
    const request = await openRequest(alice);
    await prisma.accountErasureRequest.update({
      where: { id: request.id },
      data: { attempts: 2, lastError: 'earlier failure' },
    });
    await cancelErasure(alice, { by: 'USER', ip });
    expect(
      (
        await prisma.accountErasureRequest.findUniqueOrThrow({
          where: { id: request.id },
        })
      ).lastError,
    ).toBeNull();
  });
});

describe('which accounts count as erased', () => {
  const withFile = async (userId: number) => {
    await prisma.cheatSignal.create({
      data: {
        userId,
        type: 'GOLD_SPIKE',
        severity: 'LOW',
        score: 1,
        summary: 'live signal',
        evidence: {},
      },
    });
    await prisma.moderatorNote.create({
      data: { userId, authorUserId: admin, note: 'live staff note' },
    });
  };

  test('only an erased account is purged: not an admin-reset one, nor a live one on the reserved domain', async () => {
    const reset = await createUser(
      `${alice}-reset@deleted.local`,
      hash,
      'ResetOne',
      'HUMAN',
      'FIGHTER',
    );
    const live = await createUser(
      'x@deleted.local',
      hash,
      'LiveOne',
      'HUMAN',
      'FIGHTER',
    );
    await withFile(reset.id);
    await withFile(live.id);

    expect(await purgeErasedModerationRecords()).toBe(0);

    for (const id of [reset.id, live.id]) {
      expect(await prisma.cheatSignal.count({ where: { userId: id } })).toBe(1);
      expect(await prisma.moderatorNote.count({ where: { userId: id } })).toBe(
        1,
      );
    }
  });

  test('erasure sets the marker, and a live account on the reserved domain can still be erased', async () => {
    const live = await createUser(
      'y@deleted.local',
      hash,
      'LiveTwo',
      'HUMAN',
      'FIGHTER',
    );
    expect(
      (await prisma.users.findUniqueOrThrow({ where: { id: live.id } }))
        .anonymizedAt,
    ).toBeNull();
    await requestErasure(live.id, { password: PASSWORD, ip });
    await confirmErasure(lastToken(), ip);
    await makeDue((await openRequest(live.id)).id);
    await processDueErasures();
    const erased = await prisma.users.findUniqueOrThrow({
      where: { id: live.id },
    });
    expect(erased.anonymizedAt).toBeInstanceOf(Date);
    expect(erased.email).toBe(`${live.id}-deleted@deleted.local`);
  });
});

describe('staff handling', () => {
  test('opening a request for a player who cannot sign in starts the full grace period', async () => {
    const created = await adminOpenErasure(alice, {
      adminId: admin,
      reason: 'verified support ticket 42',
      ip,
    });
    expect(created.status).toBe('PENDING');
    expect(await getLoginBlockingStatus(alice)).toBe('CLOSED');
    const days = ((created.scheduledFor?.getTime() ?? 0) - Date.now()) / DAY_MS;
    expect(days).toBeGreaterThan(ERASURE_GRACE_DAYS - 0.01);
    await expect(
      adminOpenErasure(alice, {
        adminId: admin,
        reason: 'verified support ticket 42',
        ip,
      }),
    ).rejects.toMatchObject({ code: 'already_scheduled' });
  });

  test('erasing early or cancelling needs a written reason, which is audited', async () => {
    await scheduleErasure(alice);
    const request = await openRequest(alice);

    for (const attempt of [
      () =>
        adminExpediteErasure(request.id, { adminId: admin, reason: '', ip }),
      () =>
        adminExpediteErasure(request.id, {
          adminId: admin,
          reason: 'short',
          ip,
        }),
      () =>
        adminCancelErasure(request.id, { adminId: admin, reason: 'no', ip }),
    ]) {
      await expect(attempt()).rejects.toMatchObject({
        code: 'reason_required',
      });
    }
    expect((await openRequest(alice)).status).toBe('PENDING');

    const reason = 'player confirmed identity by phone';
    await adminExpediteErasure(request.id, { adminId: admin, reason, ip });
    const done = await prisma.accountErasureRequest.findUniqueOrThrow({
      where: { id: request.id },
    });
    expect(done.status).toBe('COMPLETED');
    expect(done.expeditedByUserId).toBe(admin);
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'ADMIN_ACCOUNT_ERASURE_EXPEDITED' },
    });
    expect([audit.userId, audit.targetUserId]).toEqual([admin, alice]);
    expect((audit.details as any).reason).toBe(reason);
    await expect(
      adminExpediteErasure(request.id, { adminId: admin, reason, ip }),
    ).rejects.toMatchObject({ code: 'not_pending' });
  });

  test('staff can cancel a live request; the player is reactivated and the cancel is audited', async () => {
    await scheduleErasure(alice);
    const request = await openRequest(alice);
    await adminCancelErasure(request.id, {
      adminId: admin,
      reason: 'player asked support to stop',
      ip,
    });
    const kept = await prisma.accountErasureRequest.findUniqueOrThrow({
      where: { id: request.id },
    });
    // Free text lives in the audit row, never on the retained request.
    expect(kept.lastError).toBeNull();
    expect(
      (
        await prisma.auditLog.findFirstOrThrow({
          where: { action: 'ADMIN_ACCOUNT_ERASURE_CANCELLED' },
        })
      ).details,
    ).toMatchObject({ reason: 'player asked support to stop' });
    expect(await getLoginBlockingStatus(alice)).toBeNull();
    const row = await prisma.accountErasureRequest.findUniqueOrThrow({
      where: { id: request.id },
    });
    expect([row.status, row.cancelledBy]).toEqual(['CANCELLED', 'ADMIN']);
    expect(
      await prisma.auditLog.count({
        where: { action: 'ADMIN_ACCOUNT_ERASURE_CANCELLED', userId: admin },
      }),
    ).toBe(1);
  });
});

describe('data export', () => {
  const run = async (userId: number) => {
    let out = '';
    await streamAccountExport(userId, (chunk) => {
      out += chunk;
    });
    return { text: out, data: JSON.parse(out) };
  };

  test('contains the player’s own data and nothing secret or belonging to others', async () => {
    await prisma.users.update({
      where: { id: alice },
      data: { bio: 'ALICE-BIO', twoFactorSecret: 'SECRET-TOTP-VALUE' },
    });
    await prisma.users.update({
      where: { id: bob },
      data: { bio: 'BOB-PRIVATE-BIO' },
    });
    await prisma.loginEvent.create({
      data: { userId: alice, ipHash: 'hash-1' },
    });
    await prisma.messages.createMany({
      data: [
        {
          from_user_id: alice,
          to_user_id: bob,
          subject: 'hello',
          body: 'ALICE-WORDS',
        },
        {
          from_user_id: bob,
          to_user_id: alice,
          subject: 'reply',
          body: 'BOB-PRIVATE-WORDS',
        },
      ],
    });
    await prisma.social.create({
      data: {
        playerId: alice,
        friendId: bob,
        relationshipType: 'friend',
        status: 'accepted',
      },
    });
    await prisma.attack_log.create({
      data: {
        attacker_id: alice,
        defender_id: bob,
        winner: alice,
        timestamp: new Date(),
        pillaged_gold: 1234n,
        stats: {
          turns: 3,
          replay: { seal: 'REPLAY-SEAL-SECRET', defender: { gold: '99' } },
        },
      },
    });
    await prisma.payment.create({
      data: {
        userId: alice,
        kind: 'SUBSCRIPTION',
        status: 'SUCCEEDED',
        amountCents: 499,
        provider: 'mock',
        providerPaymentId: 'pay_alice_1',
        description: 'supporter_monthly',
      },
    });
    await prisma.cheatSignal.create({
      data: {
        userId: alice,
        type: 'GOLD_SPIKE',
        severity: 'LOW',
        score: 1,
        summary: 'INTERNAL-CHEAT-NOTE',
        evidence: { ip: 'INTERNAL-EVIDENCE' },
      },
    });
    await prisma.moderatorNote.create({
      data: { userId: alice, authorUserId: admin, note: 'INTERNAL-STAFF-NOTE' },
    });
    await prisma.report.create({
      data: {
        reporterUserId: bob,
        reportedUserId: alice,
        category: 'SPAM',
        description: 'REPORT-AGAINST-ALICE',
      },
    });
    await prisma.accountStatusHistory.create({
      data: {
        user_id: alice,
        status: 'SUSPENDED',
        admin_id: admin,
        reason: 'INTERNAL-BAN-REASON',
        start_date: new Date(Date.now() - DAY_MS),
        end_date: new Date(Date.now() - 1000),
      },
    });

    const { text, data } = await run(alice);

    // Own data is there
    expect(data.account.email).toBe('alice@example.test');
    expect(data.account.bio).toBe('ALICE-BIO');
    expect(data.account.twoFactorEnabled).toBe(true);
    expect(data.messagesAuthored.map((m: any) => m.body)).toEqual([
      'ALICE-WORDS',
    ]);
    expect(data.messagesAuthored[0].toDisplayName).toBe('Bob');
    expect(data.friends[0].otherPlayerName).toBe('Bob');
    expect(data.battleAndSpyLogs).toHaveLength(1);
    expect(data.battleAndSpyLogs[0].defenderPlayer.display_name).toBe('Bob');
    expect(data.battleAndSpyLogs[0].yourRole).toBe('attacker');
    expect(data.payments[0]).toMatchObject({
      amountCents: 499,
      providerPaymentId: 'pay_alice_1',
    });
    expect(data.signInHistory).toHaveLength(1);
    expect(data.meta.included).toContain('payments');
    expect(data.meta.excluded).toContain('moderationFile');

    // Secrets and internal records are not
    for (const forbidden of [
      hash,
      'SECRET-TOTP-VALUE',
      'password_hash',
      '"twoFactorSecret":',
      'INTERNAL-CHEAT-NOTE',
      'INTERNAL-EVIDENCE',
      'INTERNAL-STAFF-NOTE',
      'INTERNAL-BAN-REASON',
      'REPORT-AGAINST-ALICE',
      'REPLAY-SEAL-SECRET',
    ]) {
      expect(text).not.toContain(forbidden);
    }
    // Other players' private data is not
    for (const forbidden of [
      'BOB-PRIVATE-BIO',
      'BOB-PRIVATE-WORDS',
      'bob@example.test',
    ]) {
      expect(text).not.toContain(forbidden);
    }
    // The ban is listed, but without the staff-written reason.
    expect(
      data.accountStatusHistory.find((r: any) => r.status === 'SUSPENDED')
        .reason,
    ).toBeNull();
  });

  test('streams large histories in pages and the file still parses', async () => {
    await prisma.messages.createMany({
      data: Array.from({ length: 600 }, (_, i) => ({
        from_user_id: alice,
        to_user_id: bob,
        subject: `s${i}`,
        body: `b${i}`,
      })),
    });
    const chunks: string[] = [];
    await streamAccountExport(alice, (chunk) => {
      chunks.push(chunk);
    });
    expect(chunks.length).toBeGreaterThan(600);
    const data = JSON.parse(chunks.join(''));
    expect(data.messagesAuthored).toHaveLength(600);
  });

  test('is limited to one download per 24 hours, and a failed run does not use it up', async () => {
    const first = await beginExport(alice);
    await completeExport(first.id, { bytes: 10, sections: 1 });
    const refused = await beginExport(alice).catch((e) => e);
    expect(refused).toBeInstanceOf(ExportError);
    expect(refused.code).toBe('rate_limited');
    expect(refused.retryAt.getTime()).toBeGreaterThan(
      Date.now() + 23 * 3_600_000,
    );
    // Another player is unaffected.
    await beginExport(bob);

    await prisma.accountDataExport.updateMany({
      where: { userId: alice },
      data: { requestedAt: new Date(Date.now() - 25 * 3_600_000) },
    });
    const second = await beginExport(alice);
    await abandonExport(second.id);
    await beginExport(alice);
  });

  test('does not exist for an account that is gone', async () => {
    await expect(
      streamAccountExport(999999, () => undefined),
    ).rejects.toMatchObject({
      code: 'not_found',
    });
  });
});

describe('cancelling never lifts a restriction that was already in place', () => {
  const restrict = (userId: number, status: string) =>
    prisma.accountStatusHistory.create({
      data: {
        user_id: userId,
        status: status as never,
        start_date: new Date(Date.now() - DAY_MS),
        // Bans run until lifted; the others have a future end.
        end_date:
          status === 'BANNED' ? null : new Date(Date.now() + 7 * DAY_MS),
        reason: 'synthetic',
      },
    });

  test.each(['BANNED', 'SUSPENDED', 'VACATION'])(
    'staff open, then cancel: a %s player stays restricted',
    async (status) => {
      await restrict(alice, status);
      expect(await getLoginBlockingStatus(alice)).toBe(status);
      await adminOpenErasure(alice, {
        adminId: admin,
        reason: 'verified support ticket 5',
        ip,
      });
      expect(await getLoginBlockingStatus(alice)).toBe('CLOSED');

      await cancelErasure(alice, { by: 'USER', ip });

      expect(await getLoginBlockingStatus(alice)).toBe(status);
    },
  );

  test.each(['BANNED', 'VACATION'])(
    'the player confirms the emailed link after becoming %s, then cancels',
    async (status) => {
      await requestErasure(alice, { password: PASSWORD, ip });
      const token = lastToken();
      await restrict(alice, status);
      await confirmErasure(token, ip);
      expect(await getLoginBlockingStatus(alice)).toBe('CLOSED');

      await cancelErasure(alice, { by: 'USER', ip });

      expect(await getLoginBlockingStatus(alice)).toBe(status);
    },
  );

  test('a staff cancel restores the earlier ban too', async () => {
    await restrict(alice, 'BANNED');
    const request = await adminOpenErasure(alice, {
      adminId: admin,
      reason: 'verified support ticket 6',
      ip,
    });
    await adminCancelErasure(request.id, {
      adminId: admin,
      reason: 'player asked support to stop',
      ip,
    });
    expect(await getLoginBlockingStatus(alice)).toBe('BANNED');
  });

  test('a suspension that ended during the grace period stays ended', async () => {
    const row = await restrict(alice, 'SUSPENDED');
    await adminOpenErasure(alice, {
      adminId: admin,
      reason: 'verified support ticket 7',
      ip,
    });
    await prisma.accountStatusHistory.update({
      where: { id: row.id },
      data: { end_date: new Date(Date.now() - 1000) },
    });
    await cancelErasure(alice, { by: 'USER', ip });
    expect(await getLoginBlockingStatus(alice)).toBeNull();
  });
});

describe('a closed account gets no notifications; cancelling brings them back', () => {
  const digest = (userId: number) => ({
    userId,
    kind: 'dailyDigest' as const,
    eventKey: `digest:${userId}:${Math.random()}`,
    text: 'alert.digest',
    vars: {
      kingdom: 'K',
      rank: 1,
      attacks: 0,
      spies: 0,
      wars: 0,
      url: 'https://example.test',
    },
  });
  const link = () =>
    prisma.discordLink.create({
      data: {
        userId: alice,
        discordUserId: 'd-alice',
        discordUsername: 'alice',
        notifyPrefs: { dailyDigest: true, attacks: true },
      },
    });

  test('Discord: nothing is queued or delivered during the grace period', async () => {
    process.env.DISCORD_BOT_TOKEN = 'synthetic-bot-token';
    await link();
    // Control: an open account gets its digest queued.
    expect(await enqueueDiscordAlert(prisma, digest(alice))).toBe(true);
    await prisma.discordOutbox.updateMany({
      data: { nextAttemptAt: new Date(Date.now() - 1000) },
    });

    await adminOpenErasure(alice, {
      adminId: admin,
      reason: 'verified support ticket 8',
      ip,
    });

    // The message queued earlier is dropped at delivery, not sent.
    const send = async () => {
      throw new Error('must not send');
    };
    expect(await processDiscordOutboxOne(send as never)).toBe('SKIPPED');
    expect((await prisma.discordOutbox.findFirstOrThrow()).lastError).toBe(
      'account closed',
    );
    // New alerts and the daily digest are not queued.
    expect(await enqueueDiscordAlert(prisma, digest(alice))).toBe(false);
    expect(await enqueueDailyDigests()).toBe(0);
    expect(await prisma.discordOutbox.count()).toBe(1);

    // The link and its preferences survive, so cancelling restores the alerts.
    await cancelErasure(alice, { by: 'USER', ip });
    expect(
      (await prisma.discordLink.findUniqueOrThrow({ where: { userId: alice } }))
        .notifyPrefs,
    ).toMatchObject({ dailyDigest: true });
    expect(await enqueueDiscordAlert(prisma, digest(alice))).toBe(true);
    expect(await enqueueDailyDigests()).toBe(1);
  });

  const queueMail = () =>
    prisma.emailOutbox.create({
      data: {
        userId: alice,
        toAddress: 'alice@example.test',
        category: 'ATTACK_NOTIFICATION',
        locale: 'en-US',
        subject: 'attacked',
        textBody: 'body',
      },
    });

  test('email: queued alerts are skipped and new ones are not queued', async () => {
    await prisma.emailPreference.create({
      data: { userId: alice, attackNotificationEmails: true },
    });
    const battle = (id: number) => ({
      defenderId: alice,
      attackerName: 'Bob',
      attackLogId: id,
      defenderWon: false,
    });
    await prisma.$transaction((tx) => enqueueBattleAlert(tx, battle(1)));
    expect(await prisma.emailOutbox.count()).toBe(1); // control: open account

    await adminOpenErasure(alice, {
      adminId: admin,
      reason: 'verified support ticket 9',
      ip,
    });
    await prisma.$transaction((tx) => enqueueBattleAlert(tx, battle(2)));
    expect(await prisma.emailOutbox.count()).toBe(1);

    const before = sent.length;
    await email.processOutboxBatch(5);
    expect(sent.length).toBe(before);
    expect((await prisma.emailOutbox.findFirstOrThrow()).status).toBe(
      'SKIPPED',
    );

    await cancelErasure(alice, { by: 'USER', ip });
    await queueMail();
    await email.processOutboxBatch(5);
    expect(sent.length).toBe(before + 1);
  });
});

describe('billing stops when staff open an erasure, as when the player confirms', () => {
  test('staff open', async () => {
    await adminOpenErasure(alice, {
      adminId: admin,
      reason: 'verified support ticket 10',
      ip,
    });
    expect(stopBilling).toHaveBeenCalledWith(alice, 'period_end');
  });

  test('a refused open does not touch billing', async () => {
    await adminOpenErasure(admin, {
      adminId: admin,
      reason: 'verified support ticket 11',
      ip,
    }).catch(() => undefined);
    expect(stopBilling).not.toHaveBeenCalled();
  });

  test('player confirmation still does', async () => {
    await scheduleErasure(alice);
    expect(stopBilling).toHaveBeenCalledWith(alice, 'period_end');
  });
});

describe('cancelling resumes the renewal that the erasure stopped', () => {
  const subscribe = (userId: number, overrides: Record<string, unknown> = {}) =>
    prisma.supporterMembership.create({
      data: {
        userId,
        status: 'ACTIVE',
        source: 'SUBSCRIPTION',
        provider: 'mock',
        providerSubscriptionId: 'sub_mock_1',
        subscriptionPeriodEnd: new Date(Date.now() + 20 * DAY_MS),
        currentPeriodEnd: new Date(Date.now() + 20 * DAY_MS),
        cancelAtPeriodEnd: false,
        ...overrides,
      },
    });
  const renewing = async (userId: number) =>
    !(await prisma.supporterMembership.findUniqueOrThrow({ where: { userId } }))
      .cancelAtPeriodEnd;

  beforeEach(() => {
    stopBilling.mockImplementation(realStopBilling as never);
  });

  test('the player confirms, then cancels while the paid period runs', async () => {
    await subscribe(alice);
    await scheduleErasure(alice);
    expect(await renewing(alice)).toBe(false);
    expect((await openRequest(alice)).billingStopped).toBe(true);

    await cancelErasure(alice, { by: 'USER', ip });

    expect(await renewing(alice)).toBe(true);
  });

  test('staff open and staff cancel resume it too', async () => {
    await subscribe(alice);
    const request = await adminOpenErasure(alice, {
      adminId: admin,
      reason: 'verified support ticket 40',
      ip,
    });
    expect(await renewing(alice)).toBe(false);
    await adminCancelErasure(request.id, {
      adminId: admin,
      reason: 'player asked support to stop',
      ip,
    });
    expect(await renewing(alice)).toBe(true);
  });

  test('a subscription the player had already set to end stays as it was', async () => {
    await subscribe(alice, { cancelAtPeriodEnd: true });
    await scheduleErasure(alice);
    expect((await openRequest(alice)).billingStopped).toBe(false);
    await cancelErasure(alice, { by: 'USER', ip });
    expect(await renewing(alice)).toBe(false);
  });

  test('a paid period that ended during the grace period is not revived', async () => {
    await subscribe(alice);
    await scheduleErasure(alice);
    await prisma.supporterMembership.update({
      where: { userId: alice },
      data: { subscriptionPeriodEnd: new Date(Date.now() - 1000) },
    });
    await cancelErasure(alice, { by: 'USER', ip });
    expect(await renewing(alice)).toBe(false);
  });
});

describe('renewal is recorded before the provider is called', () => {
  test('a provider failure and the daily billing sweep still lead to a resume on cancel', async () => {
    await prisma.supporterMembership.create({
      data: {
        userId: alice,
        status: 'ACTIVE',
        source: 'SUBSCRIPTION',
        provider: 'mock',
        providerSubscriptionId: 'sub_mock_2',
        subscriptionPeriodEnd: new Date(Date.now() + 20 * DAY_MS),
        currentPeriodEnd: new Date(Date.now() + 20 * DAY_MS),
        cancelAtPeriodEnd: false,
      },
    });
    // The provider call at confirm fails (the spy leaves the membership untouched).
    stopBilling.mockResolvedValue(undefined as never);
    await scheduleErasure(alice);
    const request = await openRequest(alice);
    expect(request.billingStopped).toBe(true);
    expect(
      (
        await prisma.supporterMembership.findUniqueOrThrow({
          where: { userId: alice },
        })
      ).cancelAtPeriodEnd,
    ).toBe(false);

    // The daily sweep then stops renewal because the account is closed.
    await billing.sweepEndedAccountBilling();
    expect(
      (
        await prisma.supporterMembership.findUniqueOrThrow({
          where: { userId: alice },
        })
      ).cancelAtPeriodEnd,
    ).toBe(true);

    await cancelErasure(alice, { by: 'USER', ip });

    expect(
      (
        await prisma.supporterMembership.findUniqueOrThrow({
          where: { userId: alice },
        })
      ).cancelAtPeriodEnd,
    ).toBe(false);
  });
});

describe('staff handling details', () => {
  test('early erasure records the expediting admin as the audit actor and marks admin-opened requests', async () => {
    const request = await adminOpenErasure(alice, {
      adminId: admin,
      reason: 'verified support ticket 41',
      ip,
    });
    await adminExpediteErasure(request.id, {
      adminId: admin,
      reason: 'player confirmed identity by phone',
      ip,
    });
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'ACCOUNT_ANONYMIZED', targetUserId: alice },
    });
    expect(audit.userId).toBe(admin);
    expect(audit.details).toMatchObject({
      initiatedBy: 'SELF',
      requestId: request.id,
      openedByStaffUserId: admin,
      expeditedByStaffUserId: admin,
    });
  });

  test('the scheduled job acts for the player, and a player-opened request carries no staff marker', async () => {
    await scheduleErasure(alice);
    await makeDue((await openRequest(alice)).id);
    await processDueErasures();
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'ACCOUNT_ANONYMIZED', targetUserId: alice },
    });
    expect(audit.userId).toBe(alice);
    expect(audit.details).not.toHaveProperty('openedByStaffUserId');
    expect(audit.details).not.toHaveProperty('expeditedByStaffUserId');
  });

  test('a cancel only applies to the request staff looked at, not a newer one', async () => {
    await requestErasure(alice, { password: PASSWORD, ip });
    const seen = await openRequest(alice);
    await requestErasure(alice, { password: PASSWORD, ip }); // replaces the first
    const current = await openRequest(alice);
    expect(current.id).not.toBe(seen.id);

    expect(
      await cancelErasure(alice, {
        by: 'ADMIN',
        requestId: seen.id,
        adminId: admin,
        reason: 'stale view of the list',
        ip,
      }),
    ).toBe(false);
    expect((await openRequest(alice)).status).toBe('AWAITING_CONFIRMATION');

    expect(
      await cancelErasure(alice, {
        by: 'ADMIN',
        requestId: current.id,
        adminId: admin,
        reason: 'current request',
        ip,
      }),
    ).toBe(true);
  });
});

describe('export pages every growing history', () => {
  test('no history is read in one unbounded query, and name lookups stay per page', async () => {
    const PAGE = 250;
    await prisma.recruit_history.createMany({
      data: Array.from({ length: 600 }, (_, i) => ({
        to_user: alice,
        from_user: i % 2 ? bob : null,
        ip_addr: `198.51.100.${i % 250}`,
        timestamp: new Date(),
      })),
    });
    await prisma.loginEvent.createMany({
      data: Array.from({ length: 600 }, (_, i) => ({
        userId: alice,
        ipHash: `h${i}`,
      })),
    });
    await prisma.accountStatusHistory.createMany({
      data: Array.from({ length: 300 }, () => ({
        user_id: alice,
        status: 'ACTIVE' as const,
      })),
    });
    await prisma.social.createMany({
      data: Array.from({ length: 300 }, () => ({
        playerId: alice,
        friendId: bob,
        relationshipType: 'friend',
        status: 'accepted',
      })),
    });

    // Prisma delegates are getters, so record queries by wrapping them on the client.
    const calls = new Map<string, any[]>();
    const restore: Array<() => void> = [];
    for (const model of [
      'recruit_history',
      'loginEvent',
      'accountStatusHistory',
      'social',
      'payment',
      'captive',
      'report',
      'alliance_bank_history',
      'alliance_loans',
      'users',
    ]) {
      const client: any = prisma;
      const real = client[model];
      calls.set(model, []);
      Object.defineProperty(client, model, {
        configurable: true,
        get: () =>
          new Proxy(real, {
            get: (target, key) =>
              key === 'findMany'
                ? (args: any) => {
                    calls.get(model)!.push(args);
                    return target.findMany(args);
                  }
                : target[key],
          }),
      });
      restore.push(() =>
        Object.defineProperty(client, model, {
          configurable: true,
          value: real,
        }),
      );
    }

    let text = '';
    await streamAccountExport(alice, (chunk) => {
      text += chunk;
    });
    const data = JSON.parse(text);

    expect(data.recruitHistory).toHaveLength(600);
    expect(data.signInHistory).toHaveLength(600);
    expect(data.friends).toHaveLength(300);
    restore.forEach((undo) => undo());
    // Rows were fetched in pages of at most PAGE, never all at once.
    for (const model of [
      'recruit_history',
      'loginEvent',
      'accountStatusHistory',
      'social',
    ]) {
      const queries = calls.get(model)!;
      expect(queries.length, `${model} was queried`).toBeGreaterThan(1);
      for (const args of queries) {
        expect(
          args?.take,
          `${model} query without a page size`,
        ).toBeLessThanOrEqual(PAGE);
      }
    }
    // Names are resolved for one page at a time, not for the whole history.
    const ids = calls
      .get('users')!
      .map((args) => args?.where?.id?.in?.length)
      .filter((n) => typeof n === 'number');
    expect(ids.length).toBeGreaterThan(2);
    expect(Math.max(...ids)).toBeLessThanOrEqual(2);
    expect(data.recruitHistory.some((r: any) => r.fromUserName === 'Bob')).toBe(
      true,
    );
  });
});

describe('one-click erasure link in an inactivity email', () => {
  const warnedAt = new Date('2026-11-08T12:00:00.000Z');
  const notify = (userId: number) =>
    prisma.accountInactivityNotice.create({
      data: {
        userId,
        warnedAt,
        scheduledDeletionAt: new Date(Date.now() + 40 * DAY_MS),
        template: 'ERA_RELAUNCH',
      },
    });

  test('starts the same grace period without signing in, and retires the notice', async () => {
    await notify(alice);
    const before = Date.now();
    const { scheduledFor } = await confirmInactivityErasure(
      createInactivityErasureToken(alice, warnedAt),
      ip,
    );
    expect(Math.round((scheduledFor.getTime() - before) / DAY_MS)).toBe(
      ERASURE_GRACE_DAYS,
    );
    const request = await openRequest(alice);
    expect(request.status).toBe('PENDING');
    expect(request.closedStatusId).not.toBeNull();
    expect(await getLoginBlockingStatus(alice)).toBe('CLOSED');
    const notice = await prisma.accountInactivityNotice.findUniqueOrThrow({
      where: { userId: alice },
    });
    expect(notice.cancelledAt).not.toBeNull();
    // The scheduled-deletion email still goes out: the player asked for it.
    expect(sent.at(-1)?.to).toBe('alice@example.test');
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'ACCOUNT_ERASURE_CONFIRMED', userId: alice },
    });
    expect(audit.details).toMatchObject({ via: 'INACTIVITY_NOTICE' });

    // When the grace period ends the ordinary erasure runs.
    await makeDue(request.id);
    await processDueErasures();
    const erased = await prisma.users.findUniqueOrThrow({
      where: { id: alice },
    });
    expect(erased.email).not.toBe('alice@example.test');
    expect(erased.anonymizedAt).not.toBeNull();
  });

  test('works once: a second click, a forged or another notice’s link all fail', async () => {
    await notify(alice);
    await notify(bob);
    const link = createInactivityErasureToken(alice, warnedAt);
    // Signed for another notice date (an older or newer email).
    await expect(
      confirmInactivityErasure(
        createInactivityErasureToken(alice, new Date(warnedAt.getTime() + 1)),
        ip,
      ),
    ).rejects.toMatchObject({ code: 'invalid_token' });
    // Tampered: Bob's payload with Alice's signature.
    const [, signature] = link.split('.');
    const [bobPayload] = createInactivityErasureToken(bob, warnedAt).split('.');
    await expect(
      confirmInactivityErasure(`${bobPayload}.${signature}`, ip),
    ).rejects.toMatchObject({ code: 'invalid_token' });
    expect(await getLoginBlockingStatus(bob)).toBeNull();

    await confirmInactivityErasure(link, ip);
    await expect(confirmInactivityErasure(link, ip)).rejects.toMatchObject({
      code: 'invalid_token',
    });
    expect(
      await prisma.accountErasureRequest.count({ where: { userId: alice } }),
    ).toBe(1);
  });

  test('logging back in retires the link', async () => {
    await notify(alice);
    await prisma.users.update({
      where: { id: alice },
      data: { last_active: new Date() },
    });
    await cancelInactivityOnLogin(alice);
    await expect(
      confirmInactivityErasure(
        createInactivityErasureToken(alice, warnedAt),
        ip,
      ),
    ).rejects.toMatchObject({ code: 'invalid_token' });
    expect(await getLoginBlockingStatus(alice)).toBeNull();
  });

  test('replaces a request still awaiting its emailed confirmation', async () => {
    await notify(alice);
    await requestErasure(alice, { password: PASSWORD, ip });
    const requestToken = lastToken();
    await confirmInactivityErasure(
      createInactivityErasureToken(alice, warnedAt),
      ip,
    );
    const rows = await prisma.accountErasureRequest.findMany({
      where: { userId: alice },
      orderBy: { id: 'asc' },
    });
    expect(rows.map((r) => r.status)).toEqual(['EXPIRED', 'PENDING']);
    await expect(confirmErasure(requestToken, ip)).rejects.toMatchObject({
      code: 'invalid_token',
    });
  });

  test('refuses staff accounts and users without a notice', async () => {
    await notify(admin);
    await expect(
      confirmInactivityErasure(
        createInactivityErasureToken(admin, warnedAt),
        ip,
      ),
    ).rejects.toMatchObject({ code: 'staff_account' });
    await expect(
      confirmInactivityErasure(createInactivityErasureToken(bob, warnedAt), ip),
    ).rejects.toMatchObject({ code: 'invalid_token' });
  });
});
