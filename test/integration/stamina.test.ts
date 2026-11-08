import { beforeEach, describe, expect, test } from 'bun:test';

import prisma from '@/lib/prisma';
import { AttackService } from '@/services/AttackService';
import { GeneralService } from '@/services/General.service';
import { invalidateRuntimeConfigCache } from '@/services/RuntimeConfig.service';
import { SpyService } from '@/services/SpyService';
import { settleStaminaSettings } from '@/services/Stamina.service';
import { createUser } from '@/services/User.service';
import { lockEraLifecycle } from '@/utils/eraLifecycleLock';

import { resetDatabase, setRuntimeSwitch } from './db';

let attacker: number;
let defender: number;
beforeEach(async () => {
  await resetDatabase();
  invalidateRuntimeConfigCache();
  attacker = (
    await createUser(
      'stamina-a@example.test',
      'synthetic',
      'Stamina A',
      'HUMAN',
      'FIGHTER',
    )
  ).id;
  defender = (
    await createUser(
      'stamina-d@example.test',
      'synthetic',
      'Stamina D',
      'HUMAN',
      'FIGHTER',
    )
  ).id;
  await prisma.users.update({
    where: { id: attacker },
    data: { attack_turns: 100, stamina: 7, staminaUpdatedAt: new Date() },
  });
  for (const type of ['OFFENSE', 'SPY'] as const) {
    await prisma.userUnit.updateMany({
      where: { userId: attacker, type },
      data: { quantity: 1000 },
    });
  }
});
const balance = () =>
  prisma.users.findUniqueOrThrow({ where: { id: attacker } });

describe('elapsed stamina with real row locks', () => {
  test('concurrent attacks each drain their own stamina under the row lock', async () => {
    // Two 10-turn attacks cost 7 each. A lost update would leave 13, not 6.
    await prisma.users.update({
      where: { id: attacker },
      data: { stamina: 20, staminaUpdatedAt: new Date() },
    });
    const results = await Promise.all([
      AttackService.executeAttack(attacker, defender, 10),
      AttackService.executeAttack(attacker, defender, 10),
    ]);
    expect(results.map((r) => r.status)).toEqual(['success', 'success']);
    expect((await balance()).stamina).toBe(6);
    expect((await balance()).attack_turns).toBe(80);
  });
  test('an exhausted army still attacks and stamina stops at zero', async () => {
    await prisma.users.update({
      where: { id: attacker },
      data: { stamina: 0, staminaUpdatedAt: new Date() },
    });
    const result = await AttackService.executeAttack(attacker, defender, 10);
    expect(result.status).toBe('success');
    expect((await balance()).stamina).toBe(0);
    expect((await balance()).attack_turns).toBe(90);
  });
  test('offline recovery is settled before action cost, independently of turns', async () => {
    await prisma.users.update({
      where: { id: attacker },
      data: {
        stamina: 0,
        staminaUpdatedAt: new Date(Date.now() - 25 * 60_000),
      },
    });
    const result = await AttackService.executeAttack(attacker, defender, 10);
    expect(result.status).toBe('success');
    expect((await balance()).stamina).toBe(3);
    const remainingMinutes =
      (Date.now() - (await balance()).staminaUpdatedAt.getTime()) / 60_000;
    expect(remainingMinutes).toBeGreaterThanOrEqual(5);
    expect(remainingMinutes).toBeLessThan(6);
  });
  test('disabled stamina permits attacks and spy missions with an empty balance', async () => {
    await setRuntimeSwitch('stamina.enabled', false);
    await setRuntimeSwitch('ENABLE_INTEL', true);
    await prisma.users.update({
      where: { id: attacker },
      data: { stamina: 0 },
    });
    expect(
      (await AttackService.executeAttack(attacker, defender, 10)).status,
    ).toBe('success');
    expect(
      (
        await SpyService.executeSpyMission(
          attacker,
          defender,
          10,
          'INTEL',
          undefined,
          1,
        )
      ).status,
    ).toBe('success');
    expect((await balance()).stamina).toBe(0);
  });
  test('spy missions leave stamina untouched', async () => {
    await setRuntimeSwitch('ENABLE_INTEL', true);
    const result = await SpyService.executeSpyMission(
      attacker,
      defender,
      10,
      'INTEL',
      undefined,
      1,
    );
    expect(result.status).toBe('success');
    expect((await balance()).stamina).toBe(7);
  });
  test('the live player DTO exposes projected recovery without granting it twice', async () => {
    // Complete first-login era/status initialization before testing recovery.
    await GeneralService.getUserData(attacker);
    await prisma.users.update({
      where: { id: attacker },
      data: {
        stamina: 10,
        staminaUpdatedAt: new Date(Date.now() - 25 * 60_000),
      },
    });
    const first = await GeneralService.getUserData(attacker);
    const second = await GeneralService.getUserData(attacker);
    expect(first.stamina).toBe(20);
    expect(second.stamina).toBe(20);
    expect(first.maxStamina).toBe(100);
    expect(first.staminaUpdatedAt).toBeTruthy();
    expect((await balance()).stamina).toBe(10);
  });
  test('settings transition settles old rules and excludes paused offline time', async () => {
    await prisma.users.update({
      where: { id: attacker },
      data: {
        stamina: 20,
        staminaUpdatedAt: new Date(Date.now() - 25 * 60_000),
      },
    });
    await prisma.$transaction(async (tx) => {
      await lockEraLifecycle(tx);
      await settleStaminaSettings(tx);
    });
    expect((await balance()).stamina).toBe(30);
    await setRuntimeSwitch('stamina.recoveryEnabled', false);
    await prisma.users.update({
      where: { id: attacker },
      data: { staminaUpdatedAt: new Date(Date.now() - 60 * 60_000) },
    });
    await prisma.$transaction(async (tx) => {
      await lockEraLifecycle(tx);
      await settleStaminaSettings(tx);
    });
    expect((await balance()).stamina).toBe(30);
    expect(
      Date.now() - (await balance()).staminaUpdatedAt.getTime(),
    ).toBeLessThan(5000);
  });
});
