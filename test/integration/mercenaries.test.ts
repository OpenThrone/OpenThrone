import { beforeEach, describe, expect, test } from 'bun:test';
import { randomUUID } from 'crypto';

import prisma from '@/lib/prisma';
import { getUserById, updateUserUnits } from '@/services/AttackDataService';
import { AttackService } from '@/services/AttackService';
import { BattleService } from '@/services/Battle.service';
import {
  contractRoster,
  mercenaryOffer,
  MercenaryService,
} from '@/services/Mercenary.service';
import { createUser } from '@/services/User.service';
import { resetUserRelations } from '@/services/UserDefaults.service';
import { parseCombatReplay } from '@/utils/combatReplay';
import { calculateCombatStrength } from '@/utils/combatStrength';

import { resetDatabase } from './db';

let userId: number;
const now = new Date('2026-10-21T12:00:00Z');
const hire = (quantity = 10, operationId = randomUUID()) =>
  MercenaryService.hire(
    { userId, type: 'OFFENSE', level: 1, quantity, termDays: 3, operationId },
    now,
  );
beforeEach(async () => {
  await resetDatabase();
  userId = (
    await prisma.users.create({
      data: {
        email: 'merc@example.test',
        display_name: 'Merc captain',
        password_hash: 'synthetic',
        race: 'HUMAN',
        class: 'FIGHTER',
        locale: 'en',
        recruit_link: 'merc',
        gold: 1000000000n,
        fort_level: 12,
      },
    })
  ).id;
});

describe('playable mercenaries', () => {
  test('charges the bundled offer once, projects equipped combat troops, never buys citizens or inventory', async () => {
    const operationId = randomUUID();
    const contract = await hire(10, operationId);
    expect((await hire(10, operationId)).id).toBe(contract.id);
    const offer = mercenaryOffer('OFFENSE', 1);
    expect(
      (await prisma.users.findUniqueOrThrow({ where: { id: userId } })).gold,
    ).toBe(1000000000n - 10n * (offer.mobilization + 3n * offer.dailyPrice));
    expect(await prisma.userUnit.count({ where: { userId } })).toBe(0);
    expect(await prisma.userItem.count({ where: { userId } })).toBe(0);
    const roster = contractRoster([contract], [], now);
    const strength = calculateCombatStrength(
      { mercenaries: roster, race: 'HUMAN', fortLevel: 12 },
      'OFFENSE',
    ).totalStats;
    const native = calculateCombatStrength(
      {
        units: [{ type: 'OFFENSE', level: 1, quantity: 10 }],
        items: offer.equipment.map((item) => ({
          usage: 'OFFENSE',
          type: item.type!,
          level: item.level!,
          quantity: 10,
        })),
        fortLevel: 12,
        race: 'HUMAN',
        structure_upgrades: [{ type: 'ARMORY', level: 12 }],
      },
      'OFFENSE',
    ).totalStats;
    // Both public totals are rounded to integers independently.
    expect(
      Math.abs(strength.MeleeAtkPower - native.MeleeAtkPower * 1.25),
    ).toBeLessThan(1.5);
    expect(
      Math.abs(strength.MeleeDefPower - native.MeleeDefPower * 0.8),
    ).toBeLessThan(1.5);
    expect(contractRoster([contract], [], contract.expiresAt!)).toHaveLength(0);
  });
  test('concurrent hires enforce per-role survivor cap and insufficient funds rolls back', async () => {
    const results = await Promise.allSettled([hire(60), hire(60)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    await prisma.users.update({ where: { id: userId }, data: { gold: 0n } });
    await expect(hire(1)).rejects.toThrow('Insufficient gold');
    expect(await prisma.forceContract.count()).toBe(1);
  });
  test('casualties and wounds preserve separate contract IDs, renewal bills survivors only, dismissal never refunds', async () => {
    const a = await hire(10);
    const b = await hire(10);
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
      await tx.users.update({
        where: { id: userId },
        data: {
          wounded_units: [
            {
              type: 'OFFENSE',
              level: 1,
              quantity: 2,
              isMercenary: true,
              forceContractId: a.id,
            },
          ],
        },
      });
      const units = contractRoster([a, b], [], now).map((unit) => ({
        ...unit,
        quantity: unit.forceContractId === a.id ? 5 : 9,
      }));
      await updateUserUnits(userId, units, tx);
    });
    expect(
      (await prisma.forceContract.findUniqueOrThrow({ where: { id: a.id } }))
        .survivingQuantity,
    ).toBe(7);
    expect(
      (await prisma.forceContract.findUniqueOrThrow({ where: { id: b.id } }))
        .survivingQuantity,
    ).toBe(9);
    const balance = (
      await prisma.users.findUniqueOrThrow({ where: { id: userId } })
    ).gold;
    const renewed = await MercenaryService.change(
      { userId, contractId: a.id, termDays: 1, operationId: randomUUID() },
      now,
    );
    expect(renewed.expiresAt!.getTime()).toBe(
      a.expiresAt!.getTime() + 86400000,
    );
    expect(
      (await prisma.users.findUniqueOrThrow({ where: { id: userId } })).gold,
    ).toBe(balance - 7n * a.unitPriceGold);
    const beforeDismiss = (
      await prisma.users.findUniqueOrThrow({ where: { id: userId } })
    ).gold;
    await MercenaryService.change(
      { userId, contractId: b.id, operationId: randomUUID() },
      now,
    );
    expect(
      (await prisma.users.findUniqueOrThrow({ where: { id: userId } })).gold,
    ).toBe(beforeDismiss);
    await MercenaryService.change(
      { userId, contractId: a.id, operationId: randomUUID() },
      now,
    );
    expect(
      (await prisma.users.findUniqueOrThrow({ where: { id: userId } }))
        .wounded_units,
    ).toEqual([]);
    expect(await prisma.userUnit.count()).toBe(0);
  });
  test('tier eligibility, ownership, expiry and reset cannot turn contracts permanent', async () => {
    await prisma.users.update({
      where: { id: userId },
      data: { fort_level: 1 },
    });
    await expect(
      MercenaryService.hire(
        {
          userId,
          type: 'OFFENSE',
          level: 3,
          quantity: 1,
          termDays: 1,
          operationId: randomUUID(),
        },
        now,
      ),
    ).rejects.toThrow();
    const contract = await hire();
    await expect(
      MercenaryService.change(
        {
          userId: userId + 1000,
          contractId: contract.id,
          termDays: 1,
          operationId: randomUUID(),
        },
        now,
      ),
    ).rejects.toThrow();
    await expect(
      MercenaryService.change(
        {
          userId,
          contractId: contract.id,
          termDays: 1,
          operationId: randomUUID(),
        },
        contract.expiresAt!,
      ),
    ).rejects.toThrow('no longer active');
    await prisma.$transaction((tx) => resetUserRelations(tx, userId));
    expect(
      (
        await prisma.forceContract.findUniqueOrThrow({
          where: { id: contract.id },
        })
      ).status,
    ).toBe('DISMISSED');
    expect(
      (await getUserById(userId))!.UserUnit.filter((u) => u.isMercenary),
    ).toHaveLength(0);
  });
  test('real combat persists contract survivors without minting legacy mercenary rows', async () => {
    const attacker = await createUser(
      'merc-attacker@example.test',
      'synthetic',
      'Merc attacker',
      'HUMAN',
      'FIGHTER',
    );
    const defender = await createUser(
      'merc-defender@example.test',
      'synthetic',
      'Merc defender',
      'HUMAN',
      'FIGHTER',
    );
    await prisma.users.update({
      where: { id: attacker.id },
      data: { gold: 100000000n },
    });
    await prisma.users.update({
      where: { id: defender.id },
      data: { gold: 10000000n },
    });
    const command = {
      userId: attacker.id,
      type: 'OFFENSE' as const,
      level: 1,
      quantity: 50,
      termDays: 1 as const,
    };
    const first = await MercenaryService.hire({
      ...command,
      operationId: randomUUID(),
    });
    const second = await MercenaryService.hire({
      ...command,
      operationId: randomUUID(),
    });
    await prisma.userUnit.updateMany({
      where: {
        userId: defender.id,
        type: 'DEFENSE',
        level: 1,
        isMercenary: false,
      },
      data: { quantity: 100 },
    });
    const result = await AttackService.executeAttack(
      attacker.id,
      defender.id,
      5,
    );
    expect(result.status).toBe('success');
    expect(await prisma.attack_log.count()).toBe(1);
    const log = await prisma.attack_log.findFirstOrThrow();
    const replay = parseCombatReplay((log.stats as { replay: unknown }).replay);
    expect(
      replay.attacker.mercenaries.map((unit) => unit.forceContractId).sort(),
    ).toEqual([first.id, second.id].sort());
    expect(replay.attacker.mercenaries[0]!.forceEquipment).toHaveLength(6);
    const retest = await BattleService.retestBattle(log.id);
    expect(retest.exactReplay).toBe(true);
    const contracts = await prisma.forceContract.findMany({
      where: { userId: attacker.id },
    });
    expect(contracts).toHaveLength(2);
    for (const contract of contracts)
      expect(contract.survivingQuantity).toBeLessThanOrEqual(50);
    expect(
      await prisma.userUnit.count({
        where: { userId: attacker.id, isMercenary: true },
      }),
    ).toBe(0);
    expect([first.id, second.id]).toHaveLength(2);
  });
});
