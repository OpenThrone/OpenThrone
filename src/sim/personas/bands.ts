/**
 * Identity-stable allocation bands for the six personas (plan Todo 5).
 *
 * Each persona maps to exactly one band describing how it splits recruitment
 * and prioritizes repair/banking/aggression. These bands are the persona's
 * STABLE IDENTITY: they never change across ticks. Tactical adaptation (the
 * adaptive Farmer's alert level) layers on top of the band but never replaces
 * it, satisfying the "persona identity remains stable; mutable tactics may
 * adapt" requirement.
 */

import { SimulationConfigError } from '../invariants';
import type { Persona } from '../scenarioTypes';
import { PERSONAS } from '../scenarioTypes';
import type { PersonaAllocationBand } from './types';

export const PERSONA_ALLOCATION_BANDS: Record<Persona, PersonaAllocationBand> =
  {
    farmer: {
      persona: 'farmer',
      workerShare: 0.55,
      defenseShare: 0.2,
      offenseShare: 0.05,
      spyShare: 0.05,
      sentryShare: 0.15,
      fortRepairPriority: 0.55,
      bankingPriority: 0.85,
      attackAggression: 0.05,
      intelAggression: 0.1,
    },
    attacker: {
      persona: 'attacker',
      workerShare: 0.1,
      defenseShare: 0.2,
      offenseShare: 0.55,
      spyShare: 0.1,
      sentryShare: 0.05,
      fortRepairPriority: 0.3,
      bankingPriority: 0.35,
      attackAggression: 0.9,
      intelAggression: 0.65,
    },
    defender: {
      persona: 'defender',
      workerShare: 0.15,
      defenseShare: 0.55,
      offenseShare: 0.05,
      spyShare: 0.05,
      sentryShare: 0.2,
      fortRepairPriority: 0.9,
      bankingPriority: 0.65,
      attackAggression: 0.1,
      intelAggression: 0.3,
    },
    spy: {
      persona: 'spy',
      workerShare: 0.15,
      defenseShare: 0.2,
      offenseShare: 0.1,
      spyShare: 0.45,
      sentryShare: 0.1,
      fortRepairPriority: 0.45,
      bankingPriority: 0.55,
      attackAggression: 0.35,
      intelAggression: 0.95,
    },
    sentry: {
      persona: 'sentry',
      workerShare: 0.15,
      defenseShare: 0.2,
      offenseShare: 0.05,
      spyShare: 0.05,
      sentryShare: 0.55,
      fortRepairPriority: 0.85,
      bankingPriority: 0.6,
      attackAggression: 0.08,
      intelAggression: 0.25,
    },
    balanced: {
      persona: 'balanced',
      workerShare: 0.25,
      defenseShare: 0.25,
      offenseShare: 0.2,
      spyShare: 0.15,
      sentryShare: 0.15,
      fortRepairPriority: 0.6,
      bankingPriority: 0.6,
      attackAggression: 0.45,
      intelAggression: 0.45,
    },
  };

const RECRUIT_DIMENSIONS: ReadonlyArray<
  keyof Pick<
    PersonaAllocationBand,
    'workerShare' | 'defenseShare' | 'offenseShare' | 'spyShare' | 'sentryShare'
  >
> = ['workerShare', 'defenseShare', 'offenseShare', 'spyShare', 'sentryShare'];

/** Sum of the five recruitment shares for `persona`. */
export function recruitmentShareTotal(persona: Persona): number {
  const band = PERSONA_ALLOCATION_BANDS[persona];
  return RECRUIT_DIMENSIONS.reduce((sum, key) => sum + band[key], 0);
}

/** Returns the stable allocation band for `persona`. */
export function getAllocationBand(persona: Persona): PersonaAllocationBand {
  const band = PERSONA_ALLOCATION_BANDS[persona];
  if (!band) {
    throw new SimulationConfigError(
      `No allocation band for persona "${persona}"`,
      'persona-band-missing',
    );
  }
  return band;
}

/**
 * Linearly interpolates two bands by `t` in [0, 1]. Used by the adaptive
 * Farmer to shift its effective band from greedy baseline toward cautious as
 * its alert level rises, without mutating the identity band.
 */
export function interpolateBand(
  greedy: PersonaAllocationBand,
  cautious: PersonaAllocationBand,
  t: number,
): PersonaAllocationBand {
  const clamped = Math.max(0, Math.min(1, t));
  const lerp = (a: number, b: number): number => a + (b - a) * clamped;
  const mix: PersonaAllocationBand = {
    persona: greedy.persona,
    workerShare: lerp(greedy.workerShare, cautious.workerShare),
    defenseShare: lerp(greedy.defenseShare, cautious.defenseShare),
    offenseShare: lerp(greedy.offenseShare, cautious.offenseShare),
    spyShare: lerp(greedy.spyShare, cautious.spyShare),
    sentryShare: lerp(greedy.sentryShare, cautious.sentryShare),
    fortRepairPriority: lerp(
      greedy.fortRepairPriority,
      cautious.fortRepairPriority,
    ),
    bankingPriority: lerp(greedy.bankingPriority, cautious.bankingPriority),
    attackAggression: lerp(greedy.attackAggression, cautious.attackAggression),
    intelAggression: lerp(greedy.intelAggression, cautious.intelAggression),
  };
  return mix;
}

const SHARE_TOLERANCE = 1e-9;

/** Validates every band's recruitment shares sum to 1 (within float epsilon). */
export function validateAllocationBands(): void {
  for (const persona of PERSONAS) {
    const total = recruitmentShareTotal(persona);
    if (Math.abs(total - 1) > SHARE_TOLERANCE) {
      throw new SimulationConfigError(
        `Persona "${persona}" recruitment shares sum to ${total}, expected 1`,
        'persona-band-share-total',
      );
    }
    const band = PERSONA_ALLOCATION_BANDS[persona];
    const dials: ReadonlyArray<
      keyof Pick<
        PersonaAllocationBand,
        | 'fortRepairPriority'
        | 'bankingPriority'
        | 'attackAggression'
        | 'intelAggression'
      >
    > = [
      'fortRepairPriority',
      'bankingPriority',
      'attackAggression',
      'intelAggression',
    ];
    for (const dial of dials) {
      const value: number = band[dial];
      if (!Number.isFinite(value) || value < 0 || value > 1) {
        throw new SimulationConfigError(
          `Persona "${persona}" dial "${dial}" = ${value}, expected [0, 1]`,
          'persona-band-dial-range',
        );
      }
    }
  }
}
