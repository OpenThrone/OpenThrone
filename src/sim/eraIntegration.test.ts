import { describe, expect, it } from 'bun:test';

import {
  createCellLateJoiners,
  DEFAULT_LATE_JOINER_DAYS,
  SMOKE_MANIFEST,
} from '../../scripts/run-era-simulation';
import { runSimulation } from './daycycle';
import {
  createEraSimulation,
  runEraSimulation,
  simulateEraDay,
} from './eraIntegration';
import { createEraPlayer, createLateJoiner } from './eraPopulation';
import type {
  EraPlayerScenarioState,
  EraPlayerState,
  EraScenarioManifest,
} from './scenarioTypes';

function manifest(
  days: number,
  overrides: Partial<EraScenarioManifest> = {},
): EraScenarioManifest {
  return {
    id: `era-integration-${days}`,
    rulesetId: 'production',
    seed: 42,
    totalDays: days,
    primaryCohort: {
      activeCount: 0,
      passiveCount: 0,
      personaMix: { active: {}, passive: {} },
      farmerVariantMix: { active: {}, passive: {} },
    },
    recruitment: {
      rewardsPerDay: 25,
      band: 25,
      recipientMode: 'self',
      selectionShare: 0.75,
    },
    allianceMode: 'none',
    lateJoinerDays: [30, 90, 180, 365],
    ...overrides,
  };
}

/** Mark a player as rebuilding with an active shield and matching runtime. */
function injectRebuildingShield(
  state: Awaited<ReturnType<typeof createEraSimulation>>,
  playerId: string,
  shield: {
    frozenPreWipeStrategicPower: number;
    remainingDays: number;
    wipedOnDay?: number;
    frozenPreLossPeak?: number;
  },
): void {
  const meta = state.scenario.playerMeta.get(playerId);
  if (!meta) throw new Error(`unknown player ${playerId}`);
  const rebuildingMeta: EraPlayerScenarioState = {
    ...meta,
    lifecycleStatus: 'rebuilding',
    activityClass: 'rebuilding',
  };
  state.scenario.playerMeta.set(playerId, rebuildingMeta);
  const runtime = state.runtime.get(playerId);
  if (!runtime) throw new Error(`missing runtime for ${playerId}`);
  runtime.wipeBaseline = {
    frozenPreLossPeak:
      shield.frozenPreLossPeak ?? shield.frozenPreWipeStrategicPower,
    wipedOnDay: shield.wipedOnDay ?? 0,
  };
  state.scenario.rebuildShields.set(playerId, {
    playerId,
    activatedOnDay: shield.wipedOnDay ?? 0,
    frozenPreWipeStrategicPower: shield.frozenPreWipeStrategicPower,
    remainingDays: shield.remainingDays,
    expired: false,
  });
}

describe('ERA simulation integration', () => {
  it('produces one history and one metrics record per day without duplicate appends', async () => {
    const state = await runEraSimulation({
      manifest: manifest(30),
      players: [],
    });

    expect(state.base.day).toBe(30);
    expect(state.base.history).toHaveLength(30);
    expect(state.base.metrics.dailyResults).toHaveLength(30);
    expect(state.base.metrics.activePlayersPerDay).toHaveLength(30);
    expect(state.base.history.map((entry) => entry.day)).toEqual(
      Array.from({ length: 30 }, (_, index) => index + 1),
    );
  });

  it('produces exactly 730 daily records and declared checkpoints for an empty deterministic fixture', async () => {
    const state = await runEraSimulation({
      manifest: manifest(730),
      players: [],
    });

    expect(state.base.day).toBe(730);
    expect(state.base.history).toHaveLength(730);
    expect(state.base.metrics.dailyResults).toHaveLength(730);
    expect(
      state.scenario.checkpoints.map((checkpoint) => checkpoint.day),
    ).toEqual([0, 1, 7, 14, 30, 60, 90, 180, 365, 545, 730]);
  });

  it('does not let inactive ERA players receive recruitment, daily citizens, turns, or income', async () => {
    const inactive = createEraPlayer({
      id: 'inactive-player',
      activityClass: 'inactive',
      lifecycleStatus: 'inactive',
    });
    const state = await runEraSimulation({
      manifest: manifest(1),
      players: [inactive],
    });
    const player = state.base.players.get(inactive.id);

    expect(player?.status).toBe('inactive');
    expect(player?.gold).toBe(25_000);
    expect(player?.units.citizen).toBe(50);
    expect(player?.attackTurns).toBe(50);
  });

  it('adds scheduled late joiners with fresh defaults and records an event', async () => {
    const joiner = createLateJoiner(2, 'balanced');
    const state = await createEraSimulation({
      manifest: manifest(2),
      players: [],
      lateJoiners: [joiner],
    });

    await simulateEraDay(state);
    expect(state.base.players.has(joiner.id)).toBe(false);
    await simulateEraDay(state);

    const player = state.base.players.get(joiner.id);
    expect(player?.gold).toBeGreaterThanOrEqual(25_000);
    expect(state.scenario.playerMeta.get(joiner.id)?.cohortId).toBe(
      'lateJoiner-2',
    );
    expect(state.scenario.events).toContainEqual({
      kind: 'lateJoin',
      day: 2,
      actorId: joiner.id,
    });
  });

  it('keeps the legacy day-cycle API behaviorally separate from the ERA path', async () => {
    const player = createEraPlayer({ id: 'legacy-player' });
    const legacy = await runSimulation([player], 1, { seed: 42 });

    expect(legacy.day).toBe(1);
    expect(legacy.history).toHaveLength(1);
    expect(legacy.metrics.dailyResults).toHaveLength(1);
  });

  it('expires rebuild shields on duration exhaustion under candidateSafety', async () => {
    const player = createEraPlayer({
      id: 'shielded-duration',
      persona: 'defender',
    });
    const state = await createEraSimulation({
      manifest: manifest(2, { rulesetId: 'candidateSafety' }),
      players: [player],
      config: { seed: 42, rulesetId: 'candidateSafety' },
    });

    injectRebuildingShield(state, player.id, {
      // Frozen peak is high enough that the fresh-player strategic power
      // (1) stays well below 50%, isolating the duration expiry path.
      frozenPreWipeStrategicPower: 1_000_000,
      frozenPreLossPeak: 1_000_000,
      remainingDays: 1,
      wipedOnDay: 0,
    });

    await simulateEraDay(state);

    const shield = state.scenario.rebuildShields.get(player.id);
    expect(shield?.expired).toBe(true);
    expect(shield?.expiryReason).toBe('durationElapsed');
    expect(shield?.remainingDays).toBe(0);
  });

  it('expires rebuild shields early on 50% strategic-power recovery', async () => {
    const player = createEraPlayer({
      id: 'shielded-recovery',
      persona: 'defender',
    });
    const state = await createEraSimulation({
      manifest: manifest(2, { rulesetId: 'candidateSafety' }),
      players: [player],
      config: { seed: 42, rulesetId: 'candidateSafety' },
    });

    injectRebuildingShield(state, player.id, {
      // Frozen peak of 1 means any positive current strategic power
      // (fresh ERA player power = 1) reaches the 50% recovery threshold,
      // triggering early expiry before the dayElapsed branch runs.
      frozenPreWipeStrategicPower: 1,
      frozenPreLossPeak: 1,
      remainingDays: 7,
      wipedOnDay: 0,
    });

    await simulateEraDay(state);

    const shield = state.scenario.rebuildShields.get(player.id);
    expect(shield?.expired).toBe(true);
    expect(shield?.expiryReason).toBe('powerRecovered');
    expect(shield?.remainingDays).toBe(0);
  });

  it('advances active shields by exactly one remainingDay when no expiry fires', async () => {
    const player = createEraPlayer({
      id: 'shielded-active',
      persona: 'defender',
    });
    const state = await createEraSimulation({
      manifest: manifest(2, { rulesetId: 'candidateSafety' }),
      players: [player],
      config: { seed: 42, rulesetId: 'candidateSafety' },
    });

    injectRebuildingShield(state, player.id, {
      // Frozen peak of 1_000_000 keeps power recovery out of reach and
      // remainingDays=3 leaves room to count down without expiring.
      frozenPreWipeStrategicPower: 1_000_000,
      frozenPreLossPeak: 1_000_000,
      remainingDays: 3,
      wipedOnDay: 0,
    });

    await simulateEraDay(state);

    const shield = state.scenario.rebuildShields.get(player.id);
    expect(shield?.expired).toBe(false);
    expect(shield?.remainingDays).toBe(2);
  });

  it('injects late joiners supplied via RunEraSimulationOptions across the full run', async () => {
    const days = [1, 2, 3];
    const joiners = days.map((d) => createLateJoiner(d, 'balanced'));
    const state = await runEraSimulation({
      manifest: manifest(3),
      players: [],
      lateJoiners: joiners,
    });

    expect(state.base.day).toBe(3);
    for (const joiner of joiners) {
      expect(state.base.players.has(joiner.id)).toBe(true);
    }
    const lateJoinEvents = state.scenario.events.filter(
      (event) => event.kind === 'lateJoin',
    );
    expect(lateJoinEvents).toHaveLength(3);
  });

  it('translates CLI manifest cells into EraPlayerState late joiners on the documented schedule', () => {
    const smokeCell = SMOKE_MANIFEST.cells[0];
    if (!smokeCell) throw new Error('SMOKE_MANIFEST must define a cell');
    const joiners = createCellLateJoiners(smokeCell);
    expect(smokeCell.lateJoinerDays).toEqual(DEFAULT_LATE_JOINER_DAYS);
    expect(joiners.map((j) => j.joinedOnDay)).toEqual(
      Array.from(DEFAULT_LATE_JOINER_DAYS),
    );
    for (const joiner of joiners) {
      expect(joiner.lifecycleStatus).toBe('lateJoiner');
      expect(joiner.cohortId).toBe(`lateJoiner-${joiner.joinedOnDay}`);
    }
  });

  it('exercises alliance treasury aid for twoBalanced during the daily simulation', async () => {
    // twoBalanced splits eligible players evenly by id; with four players
    // each alliance (alpha, beta) gets two seats, enabling intra-alliance
    // aid from leader to non-leader.
    const leader = createEraPlayer({
      id: 'alliance-alpha-0',
      persona: 'balanced',
    });
    const recipient = createEraPlayer({
      id: 'alliance-alpha-1',
      persona: 'balanced',
    });
    const other0 = createEraPlayer({
      id: 'alliance-beta-0',
      persona: 'balanced',
    });
    const other1 = createEraPlayer({
      id: 'alliance-beta-1',
      persona: 'balanced',
    });
    // Leader accumulates enough hand gold to deposit; recipient stays poor.
    leader.gold = 200_000;
    recipient.gold = 1_000;
    const players: EraPlayerState[] = [leader, recipient, other0, other1];

    const state = await createEraSimulation({
      manifest: manifest(1, { allianceMode: 'twoBalanced' }),
      players,
      config: { seed: 42 },
    });

    await simulateEraDay(state);

    const aidEvents = state.scenario.events.filter(
      (event) => event.kind === 'allianceAid',
    );
    expect(aidEvents.length).toBeGreaterThan(0);
    expect(state.scenario.cumulative.totalAllianceAid).toBeGreaterThan(0);
  });

  it('exercises alliance focus-fire nomination and planning for focusFive', async () => {
    // Six active players: five form the focus alliance, the sixth is the
    // nominated target. All share the same level so the level-range test
    // inside planCoordinatedAttack does not disqualify every order.
    const players: EraPlayerState[] = Array.from({ length: 6 }, (_, i) =>
      createEraPlayer({
        id: `focus-${i}`,
        persona: 'attacker',
        cohortId: 'primary',
      }),
    );

    const state = await createEraSimulation({
      manifest: manifest(1, { allianceMode: 'focusFive' }),
      players,
      config: { seed: 42 },
    });

    await simulateEraDay(state);

    const focusAlliances = Array.from(state.alliances.values()).filter(
      (a) => a.mode === 'focusFive',
    );
    expect(focusAlliances).toHaveLength(1);
    const focus = focusAlliances[0]!;
    expect(focus.nominations).toHaveLength(1);
    expect(focus.attackPlans).toHaveLength(1);
    const nominationEvents = state.scenario.events.filter(
      (event) => event.kind === 'focusFireNomination',
    );
    expect(nominationEvents).toHaveLength(1);
  });

  it('exercises the spyBehavior pipeline with a real assassination mission effect', async () => {
    // A `spy` persona attacker with unlocked assassination (spyLevel 11+)
    // and a stock of assassins uniquely drives the new spyBehavior path:
    // the legacy day-cycle runs only `intelMissions` produced by
    // `makeDailyDecisions` and never increments `assassinationUsed`. A
    // non-zero counter after a single day therefore proves the new
    // pipeline executed a real mission (rather than the zero-spy no-op
    // the previous version of this test asserted on).
    const attacker = createEraPlayer({
      id: 'spy-attacker',
      persona: 'spy',
    });
    attacker.spyLevel = 11;
    attacker.attackTurns = 50;
    attacker.stamina = 100;
    attacker.units = { ...attacker.units, assassin: 20 };
    attacker.bonuses = { ...attacker.bonuses, spy: 100 };

    const target = createEraPlayer({
      id: 'spy-target',
      persona: 'defender',
    });
    // Give the target citizen+worker population so an assassination hit
    // has a damage target even though success itself is gated by RNG.
    target.units = { ...target.units, citizen: 100, worker: 50 };

    const state = await createEraSimulation({
      manifest: manifest(1),
      players: [attacker, target],
      config: { seed: 42 },
    });

    await simulateEraDay(state);

    const finalAttacker = state.base.players.get(attacker.id);
    // `assassinationUsed` is monotonically increased only by the new
    // spyBehavior pipeline; the legacy day-cycle never produces
    // assassination missions. A non-zero value proves the new path ran
    // a real mission that consumed attacker resources.
    expect(finalAttacker?.dailyLimits.assassinationUsed).toBeGreaterThan(0);
    const finalTarget = state.base.players.get(target.id);
    // `spyPressureToday` accumulates the committed-turns delta from every
    // spy mission; >= decision.turns (3 for assassination) proves the
    // mission's defender-side write landed through `planSpyApplication`.
    expect(finalTarget?.spyPressureToday).toBeGreaterThanOrEqual(3);
  });

  it('uses the persona economy once per ERA day and refreshes real signals', async () => {
    const farmer = createEraPlayer({
      id: 'persona-economy-farmer',
      persona: 'farmer',
    });
    farmer.gold = 100_000;
    farmer.units.citizen = 500;
    const state = await createEraSimulation({
      manifest: manifest(1),
      players: [farmer],
      config: { seed: 42 },
    });

    await simulateEraDay(state);

    const result = state.base.players.get(farmer.id);
    const runtime = state.runtime.get(farmer.id);
    expect(result?.units.worker).toBeGreaterThan(0);
    // Farmers do not request offense in their persona decision. This guards
    // against the old per-tick recruiter consuming citizens into soldiers.
    expect(result?.units.soldier).toBe(0);
    expect(runtime?.signals.incomeLastDay).toBeGreaterThan(0);
    expect(runtime?.signals.income7d).toBeGreaterThan(0);
  });
});
