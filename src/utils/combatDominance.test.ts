import { beforeEach, describe, expect, it } from 'bun:test';
import { mtRandImpl } from 'test/utils/mockMtRand';

import { Fortifications, levelXPArray } from '@/constants';
import UserModel from '@/models/Users';
import { calculateFortDamage, executeAttack } from '@/utils/attackFunctions';
import { V5_COMBAT_CONSTANTS } from '@/utils/balance/v5Combat';
import MockUserGenerator from '@/utils/MockUserGenerator';
import { createSeededRandom } from '@/utils/random';

// See battleOutcome.test.ts: restore seeded-random pass-through when an
// earlier test file in this process leaked the global mtRand mock.
beforeEach(() => {
  mtRandImpl.fn = ((min = 0, max = 1, random?: () => number) =>
    (random ?? Math.random)() * (max - min) + min) as any;
});

describe('fort damage scales as a share of max hitpoints', () => {
  const c = V5_COMBAT_CONSTANTS.FORT_DAMAGE;

  it('scales with the fort tier, not a flat roll', () => {
    const manor = calculateFortDamage(1000, 100, 15, 50);
    const citadel = calculateFortDamage(1000, 100, 15, 1000);
    expect(citadel / manor).toBeCloseTo(20, 5);
  });

  it('a marginal win removes MIN share and an overwhelming win MAX share', () => {
    const marginal = calculateFortDamage(115, 100, 15, 1000);
    const overwhelming = calculateFortDamage(100_000, 100, 15, 1000);
    expect(marginal).toBeCloseTo(1000 * c.MIN_SHARE_PER_TURN, 5);
    expect(overwhelming).toBeCloseTo(1000 * c.MAX_SHARE_PER_TURN, 5);
  });

  it('a repelled assault that came close still chips the walls', () => {
    const close = calculateFortDamage(100, 100, 15, 1000); // ratio 0.87
    const hopeless = calculateFortDamage(30, 100, 15, 1000); // ratio 0.26
    expect(close).toBeGreaterThan(0);
    expect(close).toBeLessThan(1000 * c.MIN_SHARE_PER_TURN);
    expect(hopeless).toBe(0);
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
  it('an overwhelming assault loses a smaller share of its force than a peer assault', async () => {
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
    const peer = await executeAttack(
      peerForce as any,
      fortress() as any,
      10,
      false,
      {
        random: createSeededRandom('suppression-peer'),
      },
    );
    const peerLosses =
      peer.Losses.Attacker.total +
      (peer as any).wounded.attacker.reduce(
        (s: number, w: any) => s + w.quantity,
        0,
      );

    // Both assaults stay inside the single-attack population loss cap; the
    // overwhelming force converts its size into strictly more defender
    // attrition and a fort breach, which the peer assault cannot achieve.
    expect(blobLosses / 10000).toBeLessThanOrEqual(
      V5_COMBAT_CONSTANTS.SINGLE_ATTACK_POPULATION_LOSS_CAP,
    );
    expect(peerLosses / 2500).toBeLessThanOrEqual(
      V5_COMBAT_CONSTANTS.SINGLE_ATTACK_POPULATION_LOSS_CAP,
    );
    const blobDefenderAttrition =
      overwhelming.Losses.Defender.total +
      (overwhelming as any).wounded.defender.reduce(
        (s: number, w: any) => s + w.quantity,
        0,
      );
    const peerDefenderAttrition =
      peer.Losses.Defender.total +
      (peer as any).wounded.defender.reduce(
        (s: number, w: any) => s + w.quantity,
        0,
      );
    expect(blobDefenderAttrition).toBeGreaterThan(peerDefenderAttrition);
    // Walls erode on a siege clock: one battle removes at most the per-battle
    // cap, and the overwhelming force reaches it while the peer force cannot.
    const fortStart = fortress().fortHitpoints;
    const capShare = V5_COMBAT_CONSTANTS.FORT_DAMAGE.PER_BATTLE_CAP_SHARE;
    expect(overwhelming.finalFortHP).toBeGreaterThanOrEqual(
      fortStart - Math.round(fortStart * capShare),
    );
    expect(overwhelming.finalFortHP).toBeLessThanOrEqual(
      fortStart - Math.round(fortStart * capShare * 0.7),
    );
    expect(peer.finalFortHP).toBeGreaterThan(overwhelming.finalFortHP);
  });

  it('overwhelming force takes a full siege bite out of a modest fort', async () => {
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

    // Overwhelming pressure wins and hits the per-battle wall cap, but no
    // single battle breaches a full-health fort.
    expect(result.result).toBe('WIN');
    expect((result as any).canonicalOutcome.reason).toBe('ASSAULT_SUCCEEDED');
    const capShare = V5_COMBAT_CONSTANTS.FORT_DAMAGE.PER_BATTLE_CAP_SHARE;
    expect(result.finalFortHP).toBeGreaterThanOrEqual(
      500 - Math.round(500 * capShare),
    );
    expect(result.finalFortHP).toBeLessThanOrEqual(
      500 - Math.round(500 * capShare * 0.7),
    );
    expect(result.pillagedGold).toBeGreaterThan(100_000n);
  });
});
