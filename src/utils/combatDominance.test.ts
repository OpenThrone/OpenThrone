import { beforeEach, describe, expect, it } from 'bun:test';
import { mtRandImpl } from 'test/utils/mockMtRand';

import { Fortifications, levelXPArray } from '@/constants';
import UserModel from '@/models/Users';
import MockUserGenerator from '@/utils/MockUserGenerator';
import {
  calculateCounterSuppression,
  calculateFortDamage,
  executeAttack,
} from '@/utils/attackFunctions';
import { createSeededRandom } from '@/utils/random';

// See battleOutcome.test.ts: restore seeded-random pass-through when an
// earlier test file in this process leaked the global mtRand mock.
beforeEach(() => {
  mtRandImpl.fn = ((min = 0, max = 1, random?: () => number) =>
    (random ?? Math.random)() * (max - min) + min) as any;
});

describe('calculateCounterSuppression', () => {
  it('leaves peer assaults unsuppressed', () => {
    expect(calculateCounterSuppression(30000, 30000)).toBe(1);
    expect(calculateCounterSuppression(45000, 30000)).toBe(1);
  });

  it('degrades counter-fire smoothly with dominance', () => {
    // The A-vs-B scenario: ~31k standing defense vs ~157k assault.
    expect(calculateCounterSuppression(31000, 157000)).toBeCloseTo(0.44, 1);
  });

  it('never fully silences the garrison (25% floor)', () => {
    expect(calculateCounterSuppression(100, 10_000_000)).toBe(0.25);
  });
});

describe('fort damage overkill scaling', () => {
  const rollMid = () => 0.9;

  it('is unchanged for peer-level pressure', () => {
    // ratio 0.5 -> [1,3] bracket, roll 0.9 -> 1 + 0.9*2 = 2.8 -> 2
    expect(calculateFortDamage(75, 150, rollMid)).toBe(2);
  });

  it('scales damage with overkill beyond ratio 2', () => {
    const strong = calculateFortDamage(200000, 150, rollMid); // ratio ~1333
    const mild = calculateFortDamage(400, 150, rollMid); // ratio ~2.7
    expect(strong).toBeGreaterThan(mild * 4);
  });

  it('caps overkill at 8x so sieges still matter', () => {
    const capped = calculateFortDamage(100_000_000, 150, rollMid);
    const atCap = calculateFortDamage(2000, 150, rollMid); // ratio 13.3
    // (13.3/2)^0.35 ~ 1.98 -> not yet capped; the mega value must exceed it
    expect(capped).toBeGreaterThan(atCap);
    expect(capped).toBeLessThanOrEqual(Math.floor(25 * 8 * 1.0));
  });
});

/** Builds a UserModel with exact level/race and a unit roster. */
function buildUser(opts: {
  race: string;
  level: number;
  fortLevel: number;
  fortHpOverride?: number;
  gold: bigint;
  units: Array<[string, number, number]>;
}): UserModel {
  const g = new MockUserGenerator();
  g.setLevel(opts.level)
    .setFortLevel(opts.fortLevel)
    .setFortHitpoints(
      opts.fortHpOverride ??
        Fortifications.find((f) => f.level === opts.fortLevel)?.hitpoints ??
        500,
    )
    .adjustGold(opts.gold - 25000n)
    .clearUnits()
    .clearItems()
    .clearBattleUpgrades();
  g.addUnits(
    opts.units.map(([type, level, quantity], i) => ({
      id: i,
      userId: 1,
      type,
      level,
      quantity,
      isMercenary: false,
    })) as any,
  );
  const raw = g.getUser() as any;
  raw.race = opts.race;
  raw.class = 'FIGHTER';
  raw.experience = levelXPArray.find((l) => l.level === opts.level)?.xp ?? 0;
  return new UserModel(raw);
}

describe('dominance on the battlefield', () => {
  it('an overwhelming assault bleeds far less than an even one', async () => {
    // Same defender; compare a peer assault vs an overwhelming assault.
    const fortress = () =>
      buildUser({
        race: 'UNDEAD',
        level: 20,
        fortLevel: 6,
        gold: 5_000_000n,
        units: [
          ['DEFENSE', 2, 4000],
          ['DEFENSE', 1, 1000],
          ['WORKER', 1, 5000],
          ['OFFENSE', 2, 5000],
        ],
      });

    const knightBlob = buildUser({
      race: 'HUMAN',
      level: 25,
      fortLevel: 6,
      gold: 1_000_000n,
      units: [['OFFENSE', 2, 10000]],
    });
    const overwhelming = await executeAttack(
      knightBlob as any,
      fortress() as any,
      10,
      false,
      { random: createSeededRandom('suppression-blob') },
    );
    const blobLosses =
      overwhelming.Losses.Attacker.total +
      (overwhelming as any).wounded.attacker.reduce(
        (s: number, w: any) => s + w.quantity,
        0,
      );

    const peerForce = buildUser({
      race: 'HUMAN',
      level: 20,
      fortLevel: 6,
      gold: 1_000_000n,
      units: [
        ['OFFENSE', 2, 2500],
        ['DEFENSE', 1, 800],
        ['CITIZEN', 1, 1600],
        ['WORKER', 1, 900],
      ],
    });
    const peer = await executeAttack(peerForce as any, fortress() as any, 10, false, {
      random: createSeededRandom('suppression-peer') },
    );
    const peerLosses =
      peer.Losses.Attacker.total +
      (peer as any).wounded.attacker.reduce(
        (s: number, w: any) => s + w.quantity,
        0,
      );

    // Relative to committed force (10,000 vs 2,500), the blob must lose a far
    // smaller share of its knights than the peer assault does.
    expect(blobLosses / 10000).toBeLessThan(peerLosses / 2500);
  });

  it('overwhelming force can crack a modest fort by assault', async () => {
    const knightBlob = buildUser({
      race: 'HUMAN',
      level: 25,
      fortLevel: 6,
      gold: 1_000_000n,
      units: [['OFFENSE', 2, 10000]],
    });
    const fortress = buildUser({
      race: 'UNDEAD',
      level: 20,
      fortLevel: 5,
      gold: 5_000_000n,
      units: [
        ['DEFENSE', 2, 4000],
        ['DEFENSE', 1, 1000],
        ['WORKER', 1, 5000],
        ['OFFENSE', 2, 5000],
      ],
    });

    const result = await executeAttack(
      knightBlob as any,
      fortress as any,
      10,
      false,
      { random: createSeededRandom('suppression-breach') },
    );

    // The 10k-knight blob takes the 500 HP fort by force on most seeds and
    // wins by breach with the full loot cap available.
    expect(result.result).toBe('WIN');
    expect((result as any).canonicalOutcome.reason).toBe('FORT_BREACHED');
    expect(result.pillagedGold).toBeGreaterThan(1_000_000n);
  });
});
