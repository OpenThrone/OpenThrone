import { describe, expect, it } from 'bun:test';

import {
  type DecisionProvider,
  type DecisionRequest,
  type DecisionResult,
  HeuristicProvider,
} from '@/lib/decisions';

import { runSimulation } from './daycycle';
import {
  assignRacesAndObjectives,
  buildCandidates,
  legalTargets,
  objectiveScorer,
  SIM_OBJECTIVES,
  SIM_RACES,
} from './decisionAdvisor';
import {
  buildPlaytestPopulation,
  formatPlaytestSummary,
  isHostedBaseUrl,
  parsePlaytestArgs,
  runDecisionPlaytest,
} from './decisionPlaytest';
import { calculateTotalUnitCost } from './economy';
import type {
  AgentDecision,
  PlayerState,
  SimAdvisorContext,
  SimDecisionAdvisor,
} from './types';

const answerWith =
  (pick: (request: DecisionRequest) => string) =>
  async (request: DecisionRequest): Promise<DecisionResult> => ({
    answers: { action: { type: 'choice', choice: pick(request) } },
    provider: 'stub',
    model: 'stub-1',
    latencyMs: 5,
  });

const stubProvider = (
  decide: DecisionProvider['decide'],
): DecisionProvider & { calls: number } => {
  const provider = {
    name: 'stub',
    model: 'stub-1',
    calls: 0,
    decide: async (request: DecisionRequest) => {
      provider.calls++;
      return decide(request);
    },
  };
  return provider;
};

const firstOption = (request: DecisionRequest): string => {
  const question = request.questions.action;
  return question.type === 'choice' ? Object.keys(question.criteria)[0] : '';
};

const SMALL = { kingdoms: 16, days: 2, seed: 7 } as const;

const fingerprint = (players: Iterable<PlayerState>): string =>
  JSON.stringify(
    Array.from(players).map((p) => [
      p.id,
      p.gold,
      p.goldInBank,
      p.level,
      p.xp,
      p.fortHp,
      p.attackTurns,
      p.units,
    ]),
  );

describe('decision hook', () => {
  it('a pass-through advisor leaves the run identical, so the hook consumes no sim randomness', async () => {
    const { players } = buildPlaytestPopulation(12, 11);
    const baseline = await runSimulation(players, 3, { seed: 11 });
    const hooked = await runSimulation(players, 3, {
      seed: 11,
      decisionAdvisor: {
        advise: async (context) => context.legacyDecision,
      },
    });
    expect(fingerprint(hooked.players.values())).toBe(
      fingerprint(baseline.players.values()),
    );
    expect(hooked.history.length).toBe(baseline.history.length);
  });

  it('is actually called every round (not a dead hook)', async () => {
    const { players } = buildPlaytestPopulation(6, 3);
    let calls = 0;
    let after = 0;
    await runSimulation(players, 1, {
      seed: 3,
      decisionAdvisor: {
        advise: async (context) => {
          calls++;
          return context.legacyDecision;
        },
        afterRound: () => {
          after++;
        },
      },
    });
    expect(calls).toBeGreaterThan(0);
    expect(after).toBe(calls);
  });
});

describe('legal candidates', () => {
  it('random-legal play only ever returns subsets of what the engine allows, across seeds', async () => {
    const counts = { nonLegacy: 0 };
    const violations: string[] = [];
    for (let seed = 1; seed <= 6; seed++) {
      const report = await runDecisionPlaytest({
        kingdoms: 12,
        days: 2,
        seed,
        mode: 'random-legal',
        advisorWrapper: (inner: SimDecisionAdvisor): SimDecisionAdvisor => ({
          advise: async (context: SimAdvisorContext) => {
            const decision = await inner.advise(context);
            if (decision === context.legacyDecision) return decision;
            counts.nonLegacy++;
            const legal = new Set(legalTargets(context).map((t) => t.id));
            const { player } = context;
            for (const attack of decision.attacks) {
              if (!legal.has(attack.target)) violations.push('target');
              if (attack.turns > player.attackTurns || attack.turns > 10)
                violations.push('turns');
            }
            for (const intel of decision.intelMissions) {
              if (!legal.has(intel.target)) violations.push('intel');
            }
            const recruits = Object.values(decision.recruitment).reduce(
              (sum, n) => sum + (n ?? 0),
              0,
            );
            if (
              recruits > player.units.citizen ||
              calculateTotalUnitCost(decision.recruitment) > player.gold
            )
              violations.push('recruit');
            if (decision.upgradeSpy && !context.legacyDecision.upgradeSpy)
              violations.push('upgrade');
            return decision;
          },
          afterRound: inner.afterRound?.bind(inner),
        }),
      });
      expect(report.completed).toBe(true);
      expect(report.findings).toEqual([]);
    }
    expect(counts.nonLegacy).toBeGreaterThan(50);
    expect(violations).toEqual([]);
  });

  it('offers nothing when the built-in model chose to idle', () => {
    const { players } = buildPlaytestPopulation(4, 2);
    const idle: AgentDecision = {
      intelMissions: [],
      attacks: [],
      recruitment: {},
    };
    expect(
      buildCandidates({
        player: players[0],
        population: players,
        legacyDecision: idle,
        attackLevelRange: 5,
        day: 0,
        tick: 0,
        live: false,
      }),
    ).toEqual([]);
  });

  it('never offers a target outside the level range', () => {
    const { players } = buildPlaytestPopulation(6, 2);
    players[1].level = players[0].level + 20;
    const ids = legalTargets({
      player: players[0],
      population: players,
      legacyDecision: { intelMissions: [], attacks: [], recruitment: {} },
      attackLevelRange: 5,
      day: 0,
      tick: 0,
      live: false,
    }).map((p) => p.id);
    expect(ids).not.toContain(players[1].id);
    expect(ids).not.toContain(players[0].id);
  });
});

describe('model mode', () => {
  it('counts an illegal answer as a fallback and keeps the legacy decision', async () => {
    const provider = stubProvider(answerWith(() => 'nuke_everything'));
    const report = await runDecisionPlaytest({
      ...SMALL,
      mode: 'model',
      epsilon: 0,
      provider,
    });
    expect(report.completed).toBe(true);
    expect(provider.calls).toBeGreaterThan(0);
    expect(report.advisor.fallbacks.illegal).toBe(provider.calls);
    expect(report.advisor.fallbacks.error).toBe(0);
    expect(report.findings).toEqual([]);
  });

  it('counts a provider error as a fallback', async () => {
    const provider = stubProvider(async () => {
      throw new Error('boom');
    });
    const report = await runDecisionPlaytest({
      ...SMALL,
      mode: 'model',
      epsilon: 0,
      provider,
    });
    expect(report.advisor.fallbacks.error).toBe(provider.calls);
    expect(report.advisor.fallbacks.error).toBeGreaterThan(0);
  });

  it('never exceeds the call budget and falls back afterwards', async () => {
    const provider = stubProvider(answerWith(firstOption));
    const report = await runDecisionPlaytest({
      ...SMALL,
      mode: 'model',
      epsilon: 0,
      maxDecisions: 5,
      provider,
    });
    expect(provider.calls).toBe(5);
    expect(report.advisor.calls).toBe(5);
    expect(report.advisor.fallbacks.budget).toBeGreaterThan(0);
  });

  it('explores deterministically under a seed, and epsilon 1 never calls the model', async () => {
    const run = async (epsilon: number, seed = 5) => {
      const provider = stubProvider(answerWith(firstOption));
      const report = await runDecisionPlaytest({
        kingdoms: 12,
        days: 2,
        seed,
        mode: 'model',
        epsilon,
        provider,
      });
      return { report, provider };
    };
    const a = await run(0.5);
    const b = await run(0.5);
    expect(a.report.advisor.explored).toBeGreaterThan(0);
    expect(a.report.advisor.explored).toBe(b.report.advisor.explored);
    expect(a.report.cells).toEqual(b.report.cells);
    const c = await run(0.5, 6);
    expect(c.report.cells).not.toEqual(a.report.cells);
    const none = await run(0);
    expect(none.report.advisor.explored).toBe(0);
    const all = await run(1);
    expect(all.provider.calls).toBe(0);
    expect(all.report.advisor.explored).toBeGreaterThan(0);
  });
});

describe('objectives and report', () => {
  it('assigns every race x objective pair, independent of race', () => {
    const cells = assignRacesAndObjectives(16, 9);
    const keys = new Set(cells.map((c) => `${c.race}/${c.objective}`));
    expect(keys.size).toBe(SIM_RACES.length * SIM_OBJECTIVES.length);
    expect(assignRacesAndObjectives(16, 9)).toEqual(cells);
    expect(assignRacesAndObjectives(16, 10)).not.toEqual(cells);
  });

  it('the offline scorer follows the objective', async () => {
    const provider = new HeuristicProvider(objectiveScorer);
    const ask = async (objective: string) => {
      const result = await provider.decide({
        state: { objective, offense: 100, targets: [{ defense: 10 }] },
        questions: {
          action: {
            type: 'choice',
            criteria: { save: null, bank: null, attack_best: null },
          },
        },
      });
      const answer = result.answers.action;
      return answer.type === 'choice' ? answer.choice : '';
    };
    expect(await ask('aggressive')).toBe('attack_best');
    expect(await ask('economic')).toBe('bank');
    expect(await ask('defensive')).toBe('bank');
  });

  it('reports every race x objective cell for a small run', async () => {
    const report = await runDecisionPlaytest({
      ...SMALL,
      mode: 'model',
      provider: new HeuristicProvider(objectiveScorer),
    });
    expect(report.completed).toBe(true);
    expect(report.cells).toHaveLength(16);
    expect(
      new Set(report.cells.map((c) => `${c.race}/${c.objective}`)).size,
    ).toBe(16);
    expect(report.provider).toEqual({
      name: 'heuristic',
      model: 'heuristic-v1',
    });
    expect(() => JSON.stringify(report)).not.toThrow();
    expect(formatPlaytestSummary(report)).toContain('GOBLIN');
  });

  it('refuses a hosted provider in model mode without an explicit budget', () => {
    const env = {
      DECISION_PROVIDER: 'systemone',
      DECISION_API_BASE_URL: 'https://api.example.com',
      DECISION_MODEL: 'jev-latest',
    };
    expect(() => parsePlaytestArgs(['--mode', 'model'], env)).toThrow(
      /max-decisions/,
    );
    expect(
      parsePlaytestArgs(['--mode', 'model', '--max-decisions', '50'], env)
        .config.maxDecisions,
    ).toBe(50);
    expect(
      parsePlaytestArgs(['--mode', 'random-legal'], env).config.provider,
    ).toBeUndefined();
    expect(isHostedBaseUrl('http://127.0.0.1:11434')).toBe(false);
    expect(isHostedBaseUrl('https://api.example.com')).toBe(true);
    expect(() => parsePlaytestArgs(['--kingdoms', '9999'], {})).toThrow();
  });
});

describe('findings', () => {
  const corrupt =
    (fn: (context: SimAdvisorContext) => void) =>
    (inner: SimDecisionAdvisor): SimDecisionAdvisor => {
      let done = false;
      return {
        advise: async (context) => {
          if (!done) {
            done = true;
            fn(context);
          }
          return inner.advise(context);
        },
        afterRound: inner.afterRound?.bind(inner),
      };
    };

  it('records an invariant violation with day, tick, player, decision, seed and snapshot', async () => {
    const report = await runDecisionPlaytest({
      ...SMALL,
      mode: 'random-legal',
      advisorWrapper: corrupt((context) => {
        context.player.gold = Number.NaN;
      }),
    });
    expect(report.completed).toBe(false);
    const finding = report.findings.find((f) => f.kind === 'invariant');
    expect(finding).toBeDefined();
    expect(finding?.seed).toBe(SMALL.seed);
    expect(finding?.playerId).toMatch(/^kingdom_/);
    expect(finding?.day).toBeGreaterThanOrEqual(1);
    expect(finding?.snapshot?.id).toBe(finding?.playerId);
    expect(finding?.snapshot?.race).toBeDefined();
    expect(finding?.decision?.option).toBeDefined();
    expect(finding?.detail).toContain('gold');
  });

  it('flags gold that appears from nothing inside a round', async () => {
    const report = await runDecisionPlaytest({
      ...SMALL,
      mode: 'legacy',
      advisorWrapper: (inner) => {
        let done = false;
        return {
          advise: inner.advise.bind(inner),
          afterRound: (context, decision) => {
            if (!done) {
              done = true;
              context.player.gold += 1000;
            }
            inner.afterRound?.(context, decision);
          },
        };
      },
    });
    const finding = report.findings.find((f) => f.kind === 'gold-created');
    expect(finding?.snapshot).not.toBeNull();
    expect(finding?.playerId).toMatch(/^kingdom_/);
  });

  it('flags a fort that is out of bounds and a negative unit count', async () => {
    const report = await runDecisionPlaytest({
      ...SMALL,
      mode: 'legacy',
      advisorWrapper: (inner) => {
        let done = false;
        return {
          advise: inner.advise.bind(inner),
          afterRound: (context, decision) => {
            if (!done) {
              done = true;
              context.player.fortHp = context.player.fortMaxHp + 1;
              context.player.units.guard = -3;
            }
            inner.afterRound?.(context, decision);
          },
        };
      },
    });
    const kinds = report.findings.map((f) => f.kind);
    expect(kinds).toContain('fort-hp-out-of-bounds');
    expect(kinds).toContain('negative-quantity');
  });

  it('a clean seeded run has no findings in any mode', async () => {
    for (const mode of ['legacy', 'random-legal'] as const) {
      const report = await runDecisionPlaytest({ ...SMALL, mode });
      expect(report.findings).toEqual([]);
    }
  });
});
