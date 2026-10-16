import { describe, expect, it } from 'bun:test';

import { createPlayerState } from '../population';
import { createRng } from '../random';
import { PERSONAS } from '../scenarioTypes';
import type { PlayerState } from '../types';
import { makeObservation, makeSelfObservation } from './fixtures';
import {
  assertTacticalIdentity,
  cappedAttackTurns,
  createInitialTacticalState,
  decidePersonaPolicy,
  personaDecisionToAgentDecision,
} from './policy';
import type { PersonaDecision, PersonaTacticalState } from './types';

function selfFor(persona: PersonaTacticalState['persona']) {
  return makeSelfObservation({
    persona,
    gold: 3_000_000,
    goldInBank: 1_000_000,
    citizensAvailable: 800,
    units: {
      soldier: 100,
      knight: 0,
      berserker: 0,
      guard: 100,
      archer: 0,
      royalGuard: 0,
      spy: 50,
      infiltrator: 0,
      assassin: 0,
      sentry: 50,
      sentinel: 0,
      inquisitor: 0,
      citizen: 800,
      worker: 200,
    },
    attackTurns: 30,
    stamina: 100,
  });
}

describe('decidePersonaPolicy dispatch', () => {
  it('routes each persona through the policy and returns a valid decision', () => {
    for (const persona of PERSONAS) {
      const tactical = createInitialTacticalState(
        persona,
        persona === 'farmer' ? 'greedy' : undefined,
      );
      const obs = makeObservation(selfFor(persona), []);
      const result = decidePersonaPolicy(obs, tactical, createRng(42));
      expect(result.decision.stance).not.toBe('inactive');
      expect(result.nextTactical.persona).toBe(persona);
    }
  });

  it('non-farmer band policy uses the injected rng for the activity gate (same seed = same decision)', () => {
    const tactical = createInitialTacticalState('attacker');
    const obs = makeObservation(selfFor('attacker'), []);
    const a = decidePersonaPolicy(obs, tactical, createRng(7)).decision;
    const b = decidePersonaPolicy(obs, tactical, createRng(7)).decision;
    expect(b).toEqual(a);
  });

  it('passive activity class can still act under a low rng roll', () => {
    const tactical = createInitialTacticalState('attacker');
    const self = { ...selfFor('attacker'), activityClass: 'passive' as const };
    const obs = makeObservation(self, []);
    let sawActive = false;
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const { decision } = decidePersonaPolicy(obs, tactical, createRng(seed));
      if (decision.stance !== 'inactive') sawActive = true;
    }
    expect(sawActive).toBe(true);
  });

  it('attacker allocates offense units and spends attack turns', () => {
    const tactical = createInitialTacticalState('attacker');
    const obs = makeObservation(selfFor('attacker'), []);
    let decision: PersonaDecision | null = null;
    for (const seed of [1, 2, 3, 4, 5, 10, 20, 30]) {
      const result = decidePersonaPolicy(obs, tactical, createRng(seed));
      if (result.decision.stance !== 'inactive') {
        decision = result.decision;
        break;
      }
    }
    expect(decision).not.toBeNull();
    expect(decision!.recruitment.soldier ?? 0).toBeGreaterThan(0);
    expect(decision!.preferredTargetBand).toBe('weaker');
    expect(cappedAttackTurns(decision!)).toBeGreaterThan(0);
  });

  it('defender prioritizes defense share and repair', () => {
    const tactical = createInitialTacticalState('defender');
    const self = {
      ...selfFor('defender'),
      fortHp: 1000,
      fortMaxHp: 4000,
      repairCost: 50_000,
    };
    const obs = makeObservation(self, []);
    let decision: PersonaDecision | null = null;
    for (const seed of [1, 2, 3, 4, 5, 10]) {
      const result = decidePersonaPolicy(obs, tactical, createRng(seed));
      if (result.decision.stance !== 'inactive') {
        decision = result.decision;
        break;
      }
    }
    expect(decision).not.toBeNull();
    const defenseUnits =
      (decision!.recruitment.guard ?? 0) +
      (decision!.recruitment.archer ?? 0) +
      (decision!.recruitment.royalGuard ?? 0);
    expect(defenseUnits).toBeGreaterThan(0);
  });

  it('cappedAttackTurns enforces the v5 max of 10', () => {
    const over: PersonaDecision = {
      stance: 'attacker-raiding',
      recruitment: {},
      upgradeEconomy: false,
      upgradeDefense: false,
      upgradeSpy: false,
      upgradeSentry: false,
      repairFort: false,
      bankGold: 0,
      attackTurnsToSpend: 42,
      preferredTargetBand: 'any',
      intelMissionsToPlan: 0,
      rationale: [],
    };
    expect(cappedAttackTurns(over)).toBe(10);
    expect(cappedAttackTurns({ ...over, attackTurnsToSpend: 3 })).toBe(3);
  });

  it('throws on an unknown persona', () => {
    const obs = makeObservation(selfFor('balanced'), []);
    const bad = { persona: 'pirate' as never, alertLevel: 0 };
    expect(() => decidePersonaPolicy(obs, bad, createRng(1))).toThrow();
  });
});

describe('assertTacticalIdentity', () => {
  it('passes when identity matches', () => {
    expect(() =>
      assertTacticalIdentity(
        { persona: 'farmer', farmerVariant: 'adaptive', alertLevel: 2 },
        'farmer',
        'adaptive',
      ),
    ).not.toThrow();
  });

  it('rejects a persona mismatch', () => {
    expect(() =>
      assertTacticalIdentity({ persona: 'spy', alertLevel: 0 }, 'attacker'),
    ).toThrow();
  });

  it('rejects a farmer variant mismatch', () => {
    expect(() =>
      assertTacticalIdentity(
        { persona: 'farmer', farmerVariant: 'greedy', alertLevel: 0 },
        'farmer',
        'cautious',
      ),
    ).toThrow();
  });
});

describe('personaDecisionToAgentDecision adapter', () => {
  const player: PlayerState = createPlayerState(10, 'balanced', 1, 'p1');

  function adapterFor(over: Partial<PersonaDecision>) {
    const decision: PersonaDecision = {
      stance: 'farmer-greedy-harvest',
      recruitment: { worker: 3, guard: 2 },
      upgradeEconomy: false,
      upgradeDefense: false,
      upgradeSpy: false,
      upgradeSentry: false,
      repairFort: false,
      bankGold: 0,
      attackTurnsToSpend: 0,
      preferredTargetBand: 'any',
      intelMissionsToPlan: 0,
      rationale: [],
      ...over,
    };
    return personaDecisionToAgentDecision(decision, player);
  }

  it('carries recruitment into AgentDecision', () => {
    const { agent } = adapterFor({});
    expect(agent.recruitment).toEqual({ worker: 3, guard: 2 });
  });

  it('leaves intel and attacks empty for Todo 9 + targeting to fill', () => {
    const { agent } = adapterFor({});
    expect(agent.intelMissions).toEqual([]);
    expect(agent.attacks).toEqual([]);
  });

  it('maps repair intent to the hp deficit amount', () => {
    player.fortHp = 100;
    player.fortMaxHp = 4000;
    const { agent } = adapterFor({ repairFort: true });
    expect(agent.repairFort).toBe(3900);
  });

  it('maps bank intent and upgrade flags', () => {
    const { agent } = adapterFor({
      bankGold: 50_000,
      upgradeSpy: true,
      upgradeSentry: true,
      upgradeEconomy: true,
    });
    expect(agent.bankGold).toBe(50_000);
    expect(agent.upgradeSpy).toBe(true);
    expect(agent.upgradeSentry).toBe(true);
    expect(agent.upgradeEconomy).toBe(true);
  });

  it('surfaces upgradeDefense via pendingDefenseUpgrade (no AgentDecision field)', () => {
    const { agent, pendingDefenseUpgrade } = adapterFor({
      upgradeDefense: true,
    });
    expect(Object.keys(agent)).not.toContain('upgradeDefense');
    expect(pendingDefenseUpgrade).toBe(true);
  });
});
