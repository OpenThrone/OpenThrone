import { describe, expect, it } from 'bun:test';

import { getBattleConstants } from '../utils/attackFunctions';
import { runSingleBattle } from './engine';
import { createSimPlayer } from './presets';
import type {
  DailyCasualtyCapUsage,
  RebuildShieldState,
  RulesetManifest,
} from './rulesets';
import {
  advanceRebuildShield,
  applyDefenderDailyCap,
  CANDIDATE_SAFETY_RULESET,
  createDailyCasualtyCapUsage,
  createRebuildShield,
  dailyCasualtyAllowance,
  getRuleset,
  isProtectedByLowLevelRule,
  PRODUCTION_RULESET,
  RULESETS,
  WEAK_LOW_LEVEL_PROTECTION_RULESET,
} from './rulesets';
import type { BattleConfig, UnitCounts } from './types';

function seededRandom(seed: number): () => number {
  let value = Math.abs(Math.floor(seed)) || 1;
  return () => {
    value = (value * 48271) % 2147483647;
    return value / 2147483647;
  };
}

function makePlayer(params: {
  id: string;
  level: number;
  offense?: number;
  defense?: number;
  gold?: number;
}) {
  return createSimPlayer({
    id: params.id,
    displayName: params.id,
    level: params.level,
    race: 'HUMAN',
    playerClass: 'FIGHTER',
    houseLevel: 2,
    gold: params.gold ?? 500000,
    units: {
      citizen: 1000,
      worker: 300,
      soldier: params.offense ?? 0,
      guard: params.defense ?? 0,
    },
    fortLevel: 3,
    fortHp: 500,
    stamina: 100,
    defensePressureToday: 0,
    bonuses: { attack: 0, defense: 0 },
  });
}

const NO_VARIANCE: Pick<
  BattleConfig,
  'damageVarianceMin' | 'damageVarianceMax'
> = { damageVarianceMin: 1, damageVarianceMax: 1 };

function sumDefenderCasualties(casualties: UnitCounts): number {
  return (
    casualties.soldier +
    casualties.knight +
    casualties.berserker +
    casualties.guard +
    casualties.archer +
    casualties.royalGuard +
    casualties.spy +
    casualties.infiltrator +
    casualties.assassin +
    casualties.sentry +
    casualties.sentinel +
    casualties.inquisitor +
    casualties.citizen +
    casualties.worker
  );
}

describe('ruleset manifests', () => {
  it('production manifest mirrors live combat rules', () => {
    expect(PRODUCTION_RULESET).toEqual({
      id: 'production',
      description: expect.any(String),
      lowLevelProtectionMultiplier: 0.1,
      lowLevelProtectionMaxLevel: 9,
      singleAttackPopulationCap: 0.08,
      dailyPopulationCap: null,
      rebuildShield: null,
    } as RulesetManifest);
  });

  it('weakLowLevelProtection manifest keeps every rule identical except the multiplier', () => {
    expect(WEAK_LOW_LEVEL_PROTECTION_RULESET).toEqual({
      id: 'weakLowLevelProtection',
      description: expect.any(String),
      lowLevelProtectionMultiplier: 1.0,
      lowLevelProtectionMaxLevel: 9,
      singleAttackPopulationCap: 0.08,
      dailyPopulationCap: null,
      rebuildShield: null,
    } as RulesetManifest);
  });

  it('candidateSafety manifest adds a 20% daily cap and a 7-day shield', () => {
    expect(CANDIDATE_SAFETY_RULESET).toEqual({
      id: 'candidateSafety',
      description: expect.any(String),
      lowLevelProtectionMultiplier: 0.1,
      lowLevelProtectionMaxLevel: 9,
      singleAttackPopulationCap: 0.08,
      dailyPopulationCap: 0.2,
      rebuildShield: {
        durationDays: 7,
        minPowerRecoveryFraction: 0.5,
        pvpActionLiftsShield: true,
      },
    } as RulesetManifest);
  });

  it('RULESETS maps every RulesetId', () => {
    expect(Object.keys(RULESETS).sort()).toEqual(
      ['candidateSafety', 'production', 'weakLowLevelProtection'].sort(),
    );
    expect(RULESETS.production).toBe(PRODUCTION_RULESET);
    expect(RULESETS.weakLowLevelProtection).toBe(
      WEAK_LOW_LEVEL_PROTECTION_RULESET,
    );
    expect(RULESETS.candidateSafety).toBe(CANDIDATE_SAFETY_RULESET);
  });

  it('manifests are frozen so scenario runners cannot mutate them', () => {
    expect(Object.isFrozen(PRODUCTION_RULESET)).toBe(true);
    expect(Object.isFrozen(WEAK_LOW_LEVEL_PROTECTION_RULESET)).toBe(true);
    expect(Object.isFrozen(CANDIDATE_SAFETY_RULESET)).toBe(true);
    expect(Object.isFrozen(RULESETS)).toBe(true);
  });

  it('getRuleset returns the manifest for known ids', () => {
    expect(getRuleset('production')).toBe(PRODUCTION_RULESET);
    expect(getRuleset('weakLowLevelProtection')).toBe(
      WEAK_LOW_LEVEL_PROTECTION_RULESET,
    );
    expect(getRuleset('candidateSafety')).toBe(CANDIDATE_SAFETY_RULESET);
  });
});

describe('isProtectedByLowLevelRule', () => {
  it('qualifies levels at or below the max when the multiplier is below 1', () => {
    expect(isProtectedByLowLevelRule(PRODUCTION_RULESET, 1)).toBe(true);
    expect(isProtectedByLowLevelRule(PRODUCTION_RULESET, 9)).toBe(true);
    expect(isProtectedByLowLevelRule(PRODUCTION_RULESET, 10)).toBe(false);
  });

  it('never protects when the multiplier is 1.0', () => {
    for (let level = 1; level <= 12; level++) {
      expect(
        isProtectedByLowLevelRule(WEAK_LOW_LEVEL_PROTECTION_RULESET, level),
      ).toBe(false);
    }
  });

  it('matches production for candidateSafety', () => {
    expect(isProtectedByLowLevelRule(CANDIDATE_SAFETY_RULESET, 5)).toBe(true);
    expect(isProtectedByLowLevelRule(CANDIDATE_SAFETY_RULESET, 10)).toBe(false);
  });
});

describe('dailyCasualtyAllowance and applyDefenderDailyCap', () => {
  it('returns infinity for rulesets without a daily cap', () => {
    expect(dailyCasualtyAllowance(PRODUCTION_RULESET, 1000)).toBe(
      Number.POSITIVE_INFINITY,
    );
    expect(
      dailyCasualtyAllowance(WEAK_LOW_LEVEL_PROTECTION_RULESET, 1000),
    ).toBe(Number.POSITIVE_INFINITY);
  });

  it('floors the candidate cap at whole units', () => {
    expect(dailyCasualtyAllowance(CANDIDATE_SAFETY_RULESET, 1000)).toBe(200);
    expect(dailyCasualtyAllowance(CANDIDATE_SAFETY_RULESET, 505)).toBe(101);
    expect(dailyCasualtyAllowance(CANDIDATE_SAFETY_RULESET, 4)).toBe(0);
  });

  it('passes pending casualties through when no daily cap applies', () => {
    const usage = createDailyCasualtyCapUsage(1000);
    const result = applyDefenderDailyCap({
      manifest: PRODUCTION_RULESET,
      usage,
      pendingCasualties: 50,
    });
    expect(result.allowed).toBe(50);
    expect(result.usage.casualtiesApplied).toBe(50);
  });

  it('enforces the 20% candidate cap and accumulates usage', () => {
    const usage = createDailyCasualtyCapUsage(1000);
    const first = applyDefenderDailyCap({
      manifest: CANDIDATE_SAFETY_RULESET,
      usage,
      pendingCasualties: 120,
    });
    expect(first.allowed).toBe(120);
    expect(first.usage.casualtiesApplied).toBe(120);

    const second = applyDefenderDailyCap({
      manifest: CANDIDATE_SAFETY_RULESET,
      usage: first.usage,
      pendingCasualties: 120,
    });
    expect(second.allowed).toBe(80);
    expect(second.usage.casualtiesApplied).toBe(200);

    const third = applyDefenderDailyCap({
      manifest: CANDIDATE_SAFETY_RULESET,
      usage: second.usage,
      pendingCasualties: 50,
    });
    expect(third.allowed).toBe(0);
    expect(third.usage.casualtiesApplied).toBe(200);
  });

  it('a fresh usage tracker simulates the daily reset', () => {
    const exhausted: DailyCasualtyCapUsage = {
      casualtiesApplied: 200,
      startOfDayPopulation: 1000,
    };
    const drained = applyDefenderDailyCap({
      manifest: CANDIDATE_SAFETY_RULESET,
      usage: exhausted,
      pendingCasualties: 50,
    });
    expect(drained.allowed).toBe(0);

    const reset = createDailyCasualtyCapUsage(1000);
    const reopened = applyDefenderDailyCap({
      manifest: CANDIDATE_SAFETY_RULESET,
      usage: reset,
      pendingCasualties: 50,
    });
    expect(reopened.allowed).toBe(50);
  });

  it('returns zero when pendingCasualties is non-positive without touching usage', () => {
    const usage = createDailyCasualtyCapUsage(1000);
    const result = applyDefenderDailyCap({
      manifest: CANDIDATE_SAFETY_RULESET,
      usage,
      pendingCasualties: 0,
    });
    expect(result.allowed).toBe(0);
    expect(result.usage).toBe(usage);
  });
});

describe('advanceRebuildShield', () => {
  const policy = CANDIDATE_SAFETY_RULESET.rebuildShield!;
  const baseState: RebuildShieldState = createRebuildShield({
    playerId: 'defender_3',
    activatedOnDay: 10,
    frozenPreWipeStrategicPower: 10000,
    policy,
  });

  it('factory seeds remainingDays from the policy duration', () => {
    expect(baseState.playerId).toBe('defender_3');
    expect(baseState.activatedOnDay).toBe(10);
    expect(baseState.frozenPreWipeStrategicPower).toBe(10000);
    expect(baseState.remainingDays).toBe(7);
    expect(baseState.expired).toBe(false);
    expect(baseState.expiryReason).toBeUndefined();
  });

  it('expires immediately on outgoing PvP when pvpActionLiftsShield is true', () => {
    const next = advanceRebuildShield(policy, baseState, {
      kind: 'outgoingPvp',
      currentDay: 11,
    });
    expect(next.expired).toBe(true);
    expect(next.expiryReason).toBe('outgoingPvp');
    expect(next.remainingDays).toBe(0);
  });

  it('does NOT expire on incoming combat (no event for it)', () => {
    const next = advanceRebuildShield(policy, baseState, {
      kind: 'dayElapsed',
      currentDay: 11,
    });
    expect(next.expired).toBe(false);
    expect(next.remainingDays).toBe(6);
  });

  it('expires on 50% power recovery', () => {
    const below = advanceRebuildShield(policy, baseState, {
      kind: 'powerSampled',
      currentDay: 12,
      currentStrategicPower: 4999,
    });
    expect(below.expired).toBe(false);

    const at = advanceRebuildShield(policy, baseState, {
      kind: 'powerSampled',
      currentDay: 12,
      currentStrategicPower: 5000,
    });
    expect(at.expired).toBe(true);
    expect(at.expiryReason).toBe('powerRecovered');
    expect(at.remainingDays).toBe(0);
  });

  it('expires on day 8 after seven dayElapsed events', () => {
    let state = baseState;
    for (let day = 11; day <= 16; day++) {
      state = advanceRebuildShield(policy, state, {
        kind: 'dayElapsed',
        currentDay: day,
      });
      expect(state.expired).toBe(false);
    }
    expect(state.remainingDays).toBe(1);

    const final = advanceRebuildShield(policy, state, {
      kind: 'dayElapsed',
      currentDay: 17,
    });
    expect(final.expired).toBe(true);
    expect(final.expiryReason).toBe('durationElapsed');
    expect(final.remainingDays).toBe(0);
  });

  it('returns expired state unchanged on further events', () => {
    const expired = advanceRebuildShield(policy, baseState, {
      kind: 'outgoingPvp',
      currentDay: 11,
    });
    const next = advanceRebuildShield(policy, expired, {
      kind: 'dayElapsed',
      currentDay: 12,
    });
    expect(next).toBe(expired);
  });

  it('a policy with pvpActionLiftsShield=false ignores outgoing PvP', () => {
    const noLiftPolicy = {
      durationDays: 7,
      minPowerRecoveryFraction: 0.5,
      pvpActionLiftsShield: false,
    };
    const state = createRebuildShield({
      playerId: 'p',
      activatedOnDay: 1,
      frozenPreWipeStrategicPower: 1000,
      policy: noLiftPolicy,
    });
    const next = advanceRebuildShield(noLiftPolicy, state, {
      kind: 'outgoingPvp',
      currentDay: 2,
    });
    expect(next.expired).toBe(false);
    expect(next.remainingDays).toBe(7);
  });
});

describe('runSingleBattle ruleset integration', () => {
  it('production ruleset applies the 0.1x low-level multiplier to a level-5 defender', async () => {
    const attacker = makePlayer({ id: 'atk', level: 12, offense: 200 });
    const defender = makePlayer({ id: 'def', level: 5, defense: 100 });

    const protectedBattle = await runSingleBattle(attacker, defender, {
      ...NO_VARIANCE,
      rulesetId: 'production',
      random: seededRandom(202),
    });
    expect(protectedBattle.winner).toBe('attacker');
    expect(protectedBattle.defenderCasualties.guard).toBeLessThan(100);
  });

  it('weakLowLevelProtection ruleset yields strictly higher defender casualties than production under fixed RNG', async () => {
    const prodAttacker = makePlayer({ id: 'atk', level: 12, offense: 200 });
    const prodDefender = makePlayer({ id: 'def', level: 5, defense: 100 });
    const weakAttacker = makePlayer({ id: 'atk', level: 12, offense: 200 });
    const weakDefender = makePlayer({ id: 'def', level: 5, defense: 100 });

    const prod = await runSingleBattle(prodAttacker, prodDefender, {
      ...NO_VARIANCE,
      rulesetId: 'production',
      random: seededRandom(303),
    });
    const weak = await runSingleBattle(weakAttacker, weakDefender, {
      ...NO_VARIANCE,
      rulesetId: 'weakLowLevelProtection',
      random: seededRandom(303),
    });

    expect(prod.winner).toBe(weak.winner);
    expect(sumDefenderCasualties(weak.defenderCasualties)).toBeGreaterThan(
      sumDefenderCasualties(prod.defenderCasualties),
    );
  });

  it('candidateSafety ruleset clips defender casualties when daily cap is supplied', async () => {
    const baselineAttacker = makePlayer({
      id: 'atk',
      level: 12,
      offense: 200,
    });
    const baselineDefender = makePlayer({
      id: 'def',
      level: 12,
      defense: 100,
    });
    const baseline = await runSingleBattle(baselineAttacker, baselineDefender, {
      ...NO_VARIANCE,
      rulesetId: 'production',
      random: seededRandom(404),
    });
    const baselineDefenderLoss = sumDefenderCasualties(
      baseline.defenderCasualties,
    );
    expect(baselineDefenderLoss).toBeGreaterThan(0);

    // Simulate a defender that has already absorbed most of the daily
    // allowance through earlier attacks. The remaining headroom is well
    // below the natural single-battle losses, so the cap must clip.
    const partiallySpentUsage: DailyCasualtyCapUsage = {
      casualtiesApplied: 280,
      startOfDayPopulation: 1500,
    };
    const candidateAttacker = makePlayer({
      id: 'atk2',
      level: 12,
      offense: 200,
    });
    const candidateDefender = makePlayer({
      id: 'def2',
      level: 12,
      defense: 100,
    });
    const capped = await runSingleBattle(candidateAttacker, candidateDefender, {
      ...NO_VARIANCE,
      rulesetId: 'candidateSafety',
      random: seededRandom(404),
      dailyCasualtyCapUsage: partiallySpentUsage,
      defenderStartOfDayPopulation: 1500,
    });
    const cappedDefenderLoss = sumDefenderCasualties(capped.defenderCasualties);
    const remainingAllowance =
      dailyCasualtyAllowance(CANDIDATE_SAFETY_RULESET, 1500) - 280;
    expect(remainingAllowance).toBe(20);
    expect(cappedDefenderLoss).toBeLessThanOrEqual(remainingAllowance);
    expect(cappedDefenderLoss).toBeLessThan(baselineDefenderLoss);
  });

  it('daily cap is not enforced when no usage tracker is supplied even under candidateSafety', async () => {
    const attacker = makePlayer({ id: 'atk', level: 12, offense: 200 });
    const defender = makePlayer({ id: 'def', level: 12, defense: 100 });

    const prod = await runSingleBattle(attacker, defender, {
      ...NO_VARIANCE,
      rulesetId: 'production',
      random: seededRandom(505),
    });
    const candidate = await runSingleBattle(attacker, defender, {
      ...NO_VARIANCE,
      rulesetId: 'candidateSafety',
      random: seededRandom(505),
    });

    expect(sumDefenderCasualties(candidate.defenderCasualties)).toBe(
      sumDefenderCasualties(prod.defenderCasualties),
    );
  });
});

describe('process-global battle override safety', () => {
  it('restores constants in finally even when the battle throws', async () => {
    const attacker = makePlayer({ id: 'atk', level: 10, offense: 100 });
    const defender = makePlayer({ id: 'def', level: 10, defense: 100 });
    const snapshot = getBattleConstants();

    const throwingRandom = (): number => {
      throw new Error('injected RNG failure');
    };

    await expect(
      runSingleBattle(attacker, defender, {
        ...NO_VARIANCE,
        attackerMultiplier: 1.5,
        random: throwingRandom,
      }),
    ).rejects.toThrow('injected RNG failure');

    expect(getBattleConstants()).toEqual(snapshot);

    const healed = await runSingleBattle(attacker, defender, {
      ...NO_VARIANCE,
      attackerMultiplier: 1.5,
      random: seededRandom(606),
    });
    expect(healed.winner).toBeDefined();
    expect(getBattleConstants()).toEqual(snapshot);
  });

  it('restores constants even when the ruleset is set and the battle throws', async () => {
    const attacker = makePlayer({ id: 'atk', level: 10, offense: 100 });
    const defender = makePlayer({ id: 'def', level: 10, defense: 100 });
    const snapshot = getBattleConstants();

    const throwingRandom = (): number => {
      throw new Error('ruleset-path RNG failure');
    };

    await expect(
      runSingleBattle(attacker, defender, {
        ...NO_VARIANCE,
        attackerMultiplier: 1.3,
        rulesetId: 'candidateSafety',
        random: throwingRandom,
      }),
    ).rejects.toThrow('ruleset-path RNG failure');

    expect(getBattleConstants()).toEqual(snapshot);
  });

  it('running candidate then production yields the same production output as production alone', async () => {
    const productionAttacker = makePlayer({
      id: 'prod-atk',
      level: 10,
      offense: 120,
    });
    const productionDefender = makePlayer({
      id: 'prod-def',
      level: 10,
      defense: 100,
    });
    const productionAlone = await runSingleBattle(
      productionAttacker,
      productionDefender,
      {
        ...NO_VARIANCE,
        attackerMultiplier: 1.2,
        rulesetId: 'production',
        random: seededRandom(707),
      },
    );

    const candidateAttacker = makePlayer({
      id: 'cand-atk',
      level: 10,
      offense: 120,
    });
    const candidateDefender = makePlayer({
      id: 'cand-def',
      level: 10,
      defense: 100,
    });
    await runSingleBattle(candidateAttacker, candidateDefender, {
      ...NO_VARIANCE,
      attackerMultiplier: 1.2,
      rulesetId: 'candidateSafety',
      random: seededRandom(707),
    });

    const replayAttacker = makePlayer({
      id: 'replay-atk',
      level: 10,
      offense: 120,
    });
    const replayDefender = makePlayer({
      id: 'replay-def',
      level: 10,
      defense: 100,
    });
    const productionAfterCandidate = await runSingleBattle(
      replayAttacker,
      replayDefender,
      {
        ...NO_VARIANCE,
        attackerMultiplier: 1.2,
        rulesetId: 'production',
        random: seededRandom(707),
      },
    );

    expect(productionAfterCandidate.winner).toBe(productionAlone.winner);
    expect(productionAfterCandidate.defenderCasualties).toEqual(
      productionAlone.defenderCasualties,
    );
    expect(productionAfterCandidate.attackerCasualties).toEqual(
      productionAlone.attackerCasualties,
    );
    expect(productionAfterCandidate.loot).toBe(productionAlone.loot);
    expect(productionAfterCandidate.attackerXp).toBe(
      productionAlone.attackerXp,
    );
  });
});
