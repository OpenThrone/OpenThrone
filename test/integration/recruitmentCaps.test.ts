import { beforeEach, describe, expect, test } from 'bun:test';

import prisma from '@/lib/prisma';
import {
  EXTERNAL_DAILY_CAP_ERROR,
  getExternalRecruitmentStatus,
  IP_DAILY_CAP_ERROR,
  performExternalRecruitment,
  performRecruitment,
  RECRUIT_PAIR_LIMIT_ERROR,
  RECRUITER_DAILY_CAP_ERROR,
  resolveRecruitmentContext,
} from '@/services/Recruitment.service';
import { invalidateRuntimeConfigCache } from '@/services/RuntimeConfig.service';
import { createUser } from '@/services/User.service';

import { resetDatabase } from './db';

const external = (ownerId: number, ipAddress = '192.0.2.1') =>
  prisma.$transaction((tx) =>
    performExternalRecruitment({ tx, ownerId, ipAddress }),
  );

// Internal history records the recruited target as from_user and recruiter as to_user.
const internal = (recruiterId: number, targetId: number) =>
  prisma.$transaction((tx) =>
    performRecruitment({
      tx,
      fromUser: targetId,
      toUser: recruiterId,
      userIdToUpdate: recruiterId,
      ipAddress: '192.0.2.1',
    }),
  );

const player = async (name: string) =>
  (
    await createUser(
      `${name}@example.test`,
      'synthetic-hash',
      name,
      'HUMAN',
      'FIGHTER',
    )
  ).id;

const cap = async (key: string, value: number) => {
  await prisma.serverSetting.upsert({
    where: { key },
    update: { value },
    create: { key, value, label: key, type: 'NUMBER' },
  });
  invalidateRuntimeConfigCache();
};

const successes = (results: PromiseSettledResult<unknown>[]) =>
  results.filter((result) => result.status === 'fulfilled').length;

const errors = (results: PromiseSettledResult<unknown>[]) =>
  results.flatMap((result) =>
    result.status === 'rejected' ? [(result.reason as Error).message] : [],
  );

describe('recruitment quotas with PostgreSQL transaction advisory locks', () => {
  beforeEach(async () => {
    await resetDatabase();
    invalidateRuntimeConfigCache();
  });

  test('concurrent external visits from one IP stop at five and grant exactly five citizens', async () => {
    const ownerId = await player('owner');
    const before = await prisma.userUnit.findFirst({
      where: { userId: ownerId, type: 'CITIZEN', level: 1, isMercenary: false },
    });
    invalidateRuntimeConfigCache();
    const results = await Promise.allSettled(
      Array.from({ length: 12 }, () => external(ownerId)),
    );
    expect(successes(results)).toBe(5);
    expect(errors(results)).toEqual(Array(7).fill(IP_DAILY_CAP_ERROR));
    expect(
      await prisma.recruit_history.count({
        where: { source: 'EXTERNAL', to_user: ownerId, from_user: null },
      }),
    ).toBe(5);
    const after = await prisma.userUnit.findFirst({
      where: { userId: ownerId, type: 'CITIZEN', level: 1, isMercenary: false },
    });
    expect(after!.quantity - (before?.quantity ?? 0)).toBe(5);
  });

  test('concurrent distinct IPs stop at the default external total of 25', async () => {
    const ownerId = await player('owner');
    invalidateRuntimeConfigCache();
    const results = await Promise.allSettled(
      Array.from({ length: 35 }, (_, i) =>
        external(ownerId, `192.0.2.${i + 100}`),
      ),
    );
    expect(successes(results)).toBe(25);
    expect(errors(results)).toEqual(Array(10).fill(EXTERNAL_DAILY_CAP_ERROR));
    expect(
      await prisma.recruit_history.count({
        where: { source: 'EXTERNAL', to_user: ownerId },
      }),
    ).toBe(25);
  });

  test('API-style prefetched contexts tolerate a cold-cache burst without exceeding the IP cap', async () => {
    const ownerId = await player('owner');
    invalidateRuntimeConfigCache();
    const results = await Promise.allSettled(
      Array.from({ length: 12 }, async () => {
        const context = await resolveRecruitmentContext();
        return prisma.$transaction((tx) =>
          performExternalRecruitment({
            tx,
            ownerId,
            ipAddress: '192.0.2.1',
            context,
          }),
        );
      }),
    );
    expect(successes(results)).toBe(5);
    expect(errors(results)).toEqual(Array(7).fill(IP_DAILY_CAP_ERROR));
    expect(
      await prisma.recruit_history.count({
        where: { source: 'EXTERNAL', to_user: ownerId },
      }),
    ).toBe(5);
  });

  test('the same IP has an independent budget for each link owner', async () => {
    const first = await player('first');
    const second = await player('second');
    invalidateRuntimeConfigCache();
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () => external(first)),
    );
    expect(successes(results)).toBe(5);
    await external(second);
    expect(
      (
        await getExternalRecruitmentStatus({
          ownerId: second,
          ipAddress: '192.0.2.1',
        })
      ).perIpRemaining,
    ).toBe(4);
  });

  test('internal targets each allow five and external usage never consumes internal quotas', async () => {
    const recruiter = await player('recruiter');
    const first = await player('first');
    const second = await player('second');
    await cap('recruit.internalDailyCap', 10);
    await cap('recruit.dailyCap', 5);
    for (let i = 0; i < 5; i += 1) await external(recruiter);
    for (let i = 0; i < 5; i += 1) await internal(recruiter, first);
    await expect(internal(recruiter, first)).rejects.toThrow(
      RECRUIT_PAIR_LIMIT_ERROR,
    );
    for (let i = 0; i < 5; i += 1) await internal(recruiter, second);
    expect(
      await prisma.recruit_history.count({
        where: { source: 'INTERNAL', to_user: recruiter },
      }),
    ).toBe(10);
    await expect(internal(recruiter, await player('third'))).rejects.toThrow(
      RECRUITER_DAILY_CAP_ERROR,
      resolveRecruitmentContext,
    );
    await expect(external(recruiter, '192.0.2.2')).rejects.toThrow(
      EXTERNAL_DAILY_CAP_ERROR,
    );
  });

  test('internal claims are separate while household external link uses share the per-player IP cap', async () => {
    const playerA = await player('player-a');
    const playerB = await player('player-b');
    const householdIp = '192.0.2.1';

    for (let i = 0; i < 5; i += 1) await internal(playerA, playerB);
    for (let i = 0; i < 4; i += 1) await external(playerB, householdIp);

    // Player A's external visit shares the remaining use with the anonymous
    // household member, while their five internal claims remain independent.
    await external(playerB, householdIp);
    await expect(external(playerB, householdIp)).rejects.toThrow(
      IP_DAILY_CAP_ERROR,
    );

    expect(
      await prisma.recruit_history.count({
        where: {
          source: 'INTERNAL',
          from_user: playerB,
          to_user: playerA,
          ip_addr: householdIp,
        },
      }),
    ).toBe(5);
    expect(
      await prisma.recruit_history.count({
        where: {
          source: 'EXTERNAL',
          to_user: playerB,
          ip_addr: householdIp,
        },
      }),
    ).toBe(5);
  });

  test('one connection has an independent allowance for each link owner', async () => {
    const first = await player('first');
    const second = await player('second');
    const third = await player('third');
    await cap('recruit.externalIpDailyCap', 3);
    invalidateRuntimeConfigCache();
    for (const ownerId of [first, second]) {
      const results = await Promise.allSettled(
        Array.from({ length: 4 }, () => external(ownerId)),
      );
      expect(successes(results)).toBe(3);
      expect(errors(results)).toEqual(Array(1).fill(IP_DAILY_CAP_ERROR));
    }
    // The same connection can recruit for a different player independently.
    await external(third);
    await external(third);
    await external(third);
    expect(
      await prisma.recruit_history.count({
        where: { source: 'EXTERNAL', ip_addr: '192.0.2.1' },
      }),
    ).toBe(9);
    // A different connection also has its own allowance for this player.
    await external(third, '192.0.2.2');
  });

  test('concurrent claims from one IP are independent across owners', async () => {
    const owners = await Promise.all(
      Array.from({ length: 12 }, (_, index) => player(`global-owner-${index}`)),
    );
    invalidateRuntimeConfigCache();

    const results = await Promise.allSettled(
      owners.map((ownerId) => external(ownerId, '192.0.2.1')),
    );

    expect(successes(results)).toBe(12);
    expect(errors(results)).toEqual([]);
    expect(
      await prisma.recruit_history.count({
        where: { source: 'EXTERNAL', ip_addr: '192.0.2.1' },
      }),
    ).toBe(12);
  });

  test('internal usage leaves external total and configurable IP quotas available', async () => {
    const recruiter = await player('recruiter');
    const target = await player('target');
    await cap('recruit.internalDailyCap', 1);
    await cap('recruit.dailyCap', 3);
    await cap('recruit.externalIpDailyCap', 2);
    await internal(recruiter, target);
    invalidateRuntimeConfigCache();
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => external(recruiter)),
    );
    expect(successes(results)).toBe(2);
    expect(errors(results)).toEqual(Array(3).fill(IP_DAILY_CAP_ERROR));
    await external(recruiter, '192.0.2.2');
    await expect(external(recruiter, '192.0.2.3')).rejects.toThrow(
      EXTERNAL_DAILY_CAP_ERROR,
    );
  });
});
