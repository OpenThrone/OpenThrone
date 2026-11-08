import { beforeEach, describe, expect, test } from 'bun:test';
import { randomUUID } from 'crypto';

import prisma from '@/lib/prisma';
import { CaptiveService } from '@/services/Captives.service';
import { CronJobService } from '@/services/CronJob.service';
import {
  reanimatedUnitsTotal,
  ReanimationService,
} from '@/services/Reanimation.service';
import { SanctuaryService } from '@/services/Sanctuary.service';
import { StructureService } from '@/services/Structure.service';
import { createUser } from '@/services/User.service';

import { resetDatabase, setDesertion } from './db';

const player = (name: string, race: string) =>
  createUser(`${name}@example.test`, 'test-hash', name, race, 'FIGHTER');
beforeEach(resetDatabase);

describe('racial perks', () => {
  test('discipline reduces desertion and enforces the raised morale floor', async () => {
    await setDesertion(true);
    await prisma.era.create({
      data: {
        name: 'Discipline era',
        startDate: new Date(Date.now() - 20 * 86400000),
      },
    });
    const base = await player('discipline-base', 'HUMAN');
    const disciplined = await player('discipline-tier', 'HUMAN');
    for (const [user, tier] of [
      [base, 0],
      [disciplined, 1],
    ] as const) {
      await prisma.users.update({
        where: { id: user.id },
        data: {
          racial_perk_tier: tier,
          experience: 80000,
          last_active: new Date(Date.now() - 3 * 86400000),
          kingdom_morale: 2,
        },
      });
      await prisma.userUnit.upsert({
        where: {
          userId_type_level_isMercenary: {
            userId: user.id,
            type: 'DEFENSE',
            level: 1,
            isMercenary: false,
          },
        },
        create: {
          userId: user.id,
          type: 'DEFENSE',
          level: 1,
          isMercenary: false,
          quantity: 10000,
        },
        update: { quantity: 10000 },
      });
    }
    await CronJobService.processDailyUpdates();
    const baseRow = await prisma.users.findUniqueOrThrow({
      where: { id: base.id },
    });
    const tierRow = await prisma.users.findUniqueOrThrow({
      where: { id: disciplined.id },
    });
    expect(baseRow.kingdom_morale).toBe(0);
    expect(tierRow.kingdom_morale).toBe(5);
    const lost = async (userId: number) =>
      (
        await prisma.desertionEvent.findMany({
          where: { userId, kind: 'ABANDON' },
        })
      ).reduce((sum, event) => sum + event.quantity, 0);
    expect(await lost(base.id)).toBe(100);
    expect(await lost(disciplined.id)).toBe(75);
    const ledger = await prisma.bank_history.findFirstOrThrow({
      where: { to_user_id: disciplined.id, history_type: 'KINGDOM_MORALE' },
    });
    expect(
      (ledger.stats as { disciplineSaved: number }).disciplineSaved,
    ).toBeGreaterThanOrEqual(25);
  });

  test('goblin ransom share follows its tier', async () => {
    const era = await prisma.era.create({
      data: { name: 'Ransom era', startDate: new Date() },
    });
    const goblin = await player('ransom-goblin', 'GOBLIN');
    const source = await player('ransom-source', 'HUMAN');
    await prisma.users.update({
      where: { id: goblin.id },
      data: { racial_perk_tier: 2, fort_level: 15, currentEraId: era.id },
    });
    await prisma.users.update({
      where: { id: source.id },
      data: { gold: 1000000n, currentEraId: era.id },
    });
    const captive = await prisma.captive.create({
      data: {
        captorId: goblin.id,
        sourceId: source.id,
        unitType: 'DEFENSE',
        unitLevel: 1,
        quantity: 10,
        capturedAt: new Date(),
        eraId: era.id,
      },
    });
    const result = await CaptiveService.ransom({
      userId: source.id,
      captiveId: captive.id,
      operationId: randomUUID(),
    });
    expect(result).toMatchObject({
      gold: '6000',
      captorShare: '3600',
      burned: '2400',
    });
  });

  test('goblin raiders capture at the tier rate up to increased capacity', async () => {
    const goblin = await player('goblin', 'GOBLIN');
    const source = await player('source', 'HUMAN');
    await prisma.users.update({
      where: { id: goblin.id },
      data: { racial_perk_tier: 1 },
    });
    const captured = await prisma.$transaction((tx) =>
      CaptiveService.captureFromBattle(tx, {
        captorId: goblin.id,
        sourceId: source.id,
        eraId: null,
        captorFortLevel: 13,
        killedUnits: [{ type: 'DEFENSE', level: 1, quantity: 3000 }],
      }),
    );
    expect(captured).toBe(250);
  });

  test('necropolis increases both reanimation pools and snapshots the larger cap', async () => {
    const undead = await player('necropolis', 'UNDEAD');
    const human = await player('human', 'HUMAN');
    await prisma.userUnit.create({
      data: {
        userId: undead.id,
        type: 'DEFENSE',
        level: 3,
        quantity: 1000,
        isMercenary: false,
      },
    });
    const fallen = [{ type: 'DEFENSE', level: 1, quantity: 100 }];
    const outcome = await prisma.$transaction((tx) =>
      ReanimationService.reanimateFromBattle(tx, {
        attacker: {
          userId: undead.id,
          race: 'UNDEAD',
          fortLevel: 5,
          economyLevel: 0,
          racialTier: 1,
        },
        defender: {
          userId: human.id,
          race: 'HUMAN',
          fortLevel: 5,
          economyLevel: 0,
        },
        attackerKilledUnits: fallen,
        defenderKilledUnits: fallen,
        captivesTaken: 0,
      }),
    );
    expect(reanimatedUnitsTotal(outcome.attacker)).toBe(14);
    expect(outcome.attackerBonus).toBe(2);
    const row = await prisma.users.findUniqueOrThrow({
      where: { id: undead.id },
    });
    expect(row.reanimation_cap).toBe(25);
  });
  test('purchases enforce race, fort, gold, ordering and replay safety', async () => {
    const elf = await player('elf', 'ELF');
    const undead = await player('undead', 'UNDEAD');
    await prisma.users.update({
      where: { id: elf.id },
      data: { fort_level: 5, gold: 2_000_000 },
    });
    await expect(
      StructureService.upgradeStructure(undead.id, {
        upgradeType: 'racial',
        index: 0,
      }),
    ).rejects.toThrow();
    await expect(
      StructureService.upgradeStructure(elf.id, {
        upgradeType: 'racial',
        index: 1,
      }),
    ).rejects.toThrow();
    await StructureService.upgradeStructure(elf.id, {
      upgradeType: 'racial',
      index: 0,
    });
    await expect(
      StructureService.upgradeStructure(elf.id, {
        upgradeType: 'racial',
        index: 0,
      }),
    ).rejects.toThrow();
    await expect(
      StructureService.upgradeStructure(elf.id, {
        upgradeType: 'racial',
        index: 1,
      }),
    ).rejects.toThrow();
    const row = await prisma.users.findUniqueOrThrow({ where: { id: elf.id } });
    expect(row.racial_perk_tier).toBe(1);
    expect(row.gold).toBe(1_000_000n);
  });

  test('blocks only the attacker own pool and sanctuary preserves levels and daily cap', async () => {
    const attacker = await player('grave', 'UNDEAD');
    const defender = await player('elf', 'ELF');
    for (const userId of [attacker.id, defender.id])
      await prisma.userUnit.create({
        data: {
          userId,
          type: 'DEFENSE',
          level: 3,
          quantity: 1000,
          isMercenary: false,
        },
      });
    const fallen = [{ type: 'DEFENSE', level: 3, quantity: 100 }];
    const result = await prisma.$transaction(async (tx) => {
      const risen = await ReanimationService.reanimateFromBattle(tx, {
        attacker: {
          userId: attacker.id,
          race: 'UNDEAD',
          fortLevel: 5,
          economyLevel: 0,
        },
        defender: {
          userId: defender.id,
          race: 'ELF',
          fortLevel: 5,
          economyLevel: 0,
        },
        attackerKilledUnits: fallen,
        defenderKilledUnits: fallen,
        captivesTaken: 0,
        defenderRacialTier: 4,
      });
      const recovered = await SanctuaryService.recover(
        tx,
        defender.id,
        4,
        fallen,
        0,
      );
      await SanctuaryService.apply(tx, defender.id, recovered);
      return { risen, recovered };
    });
    expect(result.risen.blocked).toBe(5);
    expect(reanimatedUnitsTotal(result.risen.attacker)).toBe(7);
    expect(result.recovered).toEqual([
      { type: 'DEFENSE', level: 3, quantity: 12 },
    ]);
    expect(
      (
        await prisma.userUnit.findUniqueOrThrow({
          where: {
            userId_type_level_isMercenary: {
              userId: defender.id,
              type: 'DEFENSE',
              level: 3,
              isMercenary: false,
            },
          },
        })
      ).quantity,
    ).toBe(1012);
  });

  test('defenders sanctuary recovered never also rise for an undead attacker', async () => {
    const attacker = await player('ghoul', 'UNDEAD');
    const defender = await player('grove', 'ELF');
    for (const userId of [attacker.id, defender.id])
      await prisma.userUnit.create({
        data: {
          userId,
          type: 'DEFENSE',
          level: 3,
          quantity: 1000,
          isMercenary: false,
        },
      });
    const fallen = [{ type: 'DEFENSE', level: 3, quantity: 100 }];
    const risen = await prisma.$transaction((tx) =>
      ReanimationService.reanimateFromBattle(tx, {
        attacker: {
          userId: attacker.id,
          race: 'UNDEAD',
          fortLevel: 5,
          economyLevel: 0,
        },
        defender: {
          userId: defender.id,
          race: 'ELF',
          fortLevel: 5,
          economyLevel: 0,
        },
        attackerKilledUnits: fallen,
        defenderKilledUnits: fallen,
        captivesTaken: 0,
        defenderRacialTier: 4,
        defenderRecovered: [{ type: 'DEFENSE', level: 3, quantity: 12 }],
      }),
    );
    // Own pool 8 - 5 blocked = 3; enemy pool 4% of the 88 still dead = 3.
    expect(reanimatedUnitsTotal(risen.attacker)).toBe(6);
  });

  test('sanctuary excludes captives and temporary forces and resets on a new OT day', async () => {
    const elf = await player('grove', 'ELF');
    await prisma.userUnit.create({
      data: {
        userId: elf.id,
        type: 'DEFENSE',
        level: 2,
        quantity: 1000,
        isMercenary: false,
      },
    });
    const fallen = [
      { type: 'DEFENSE', level: 2, quantity: 500 },
      { type: 'DEFENSE', level: 5, quantity: 500, isMercenary: true },
      {
        type: 'DEFENSE',
        level: 4,
        quantity: 500,
        forceKind: 'ALLIANCE' as const,
      },
    ];
    const recover = (now: Date) =>
      prisma.$transaction((tx) =>
        SanctuaryService.recover(tx, elf.id, 1, fallen, 100, now),
      );
    const day = new Date('2026-10-20T12:00:00Z');
    expect(await recover(day)).toEqual([
      { type: 'DEFENSE', level: 2, quantity: 20 },
    ]);
    expect(await recover(day)).toEqual([]);
    expect(await recover(new Date(day.getTime() + 86400000))).toEqual([
      { type: 'DEFENSE', level: 2, quantity: 20 },
    ]);
  });
});
