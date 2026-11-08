import { describe, expect, it } from 'bun:test';

import { COMBAT_RULESETS } from '@/utils/balance/combatRulesets';

import {
  ATTACKER,
  CHIP_TAPER_OFF,
  DEFENDER,
  run as runScenario,
  type Scenario,
  withChipRules,
} from './battle23555';

// Battle #23555 (#200): 164 soldiers with 84 sets attacked 770 guards with 589
// sets. Under the rules in force when it was fought the guards lost 17 killed +
// 6 wounded and the attacker 10 killed + 3 wounded.
// combat-v10 only changes who the dead are charged to; every total below holds
// under both versions, so the whole reconstruction runs under each.
const VERSIONS = ['combat-v9', 'combat-v10'] as const;

const base: Scenario = {
  label: '#23555',
  attacker: ATTACKER,
  defender: DEFENDER,
  turns: 10,
  protectedDefender: false,
};

for (const version of VERSIONS)
  describe(`battle #23555 reconstruction (${version})`, () => {
    const ruleset = COMBAT_RULESETS[version]!;
    const run = (sc: Scenario) =>
      runScenario({
        ...sc,
        options: { ruleset: sc.options?.ruleset ?? ruleset, ...sc.options },
      });

    it('reproduces the recorded casualties under the rules it was fought under', async () => {
      // Chip as filed: no taper on hopeless assaults, gear chip not troop-only.
      const o = await run({
        ...base,
        options: {
          ruleset: withChipRules(
            {
              ...CHIP_TAPER_OFF,
              CHIP_FROM_TROOPS_ONLY: false,
            },
            ruleset,
          ),
        },
      });
      expect(o.result).toBe('LOSS');
      expect([o.attKilled, o.attWounded]).toEqual([10, 3]);
      expect([o.defKilled, o.defWounded]).toEqual([17, 6]);
      expect(o.fortDmg).toBe(0);
      expect(o.gold).toBe('0');
    });

    // Everything below pins combat-v9 and combat-v10 outcomes. A deliberate balance change
    // (new combat version) is expected to update these numbers; the
    // historical reconstruction above must keep passing regardless.
    for (const protectedDefender of [false, true]) {
      it(`a hopeless attack costs the guards nothing (protected=${protectedDefender})`, async () => {
        const o = await run({ ...base, protectedDefender });
        expect(o.result).toBe('LOSS');
        expect(o.defLost).toBe(0);
        expect(o.chipRaw).toBe(0);
        expect(o.fortDmg).toBe(0);
        expect(o.gold).toBe('0');
        // The attacker still pays its 8% casualty allowance: floor(164 * 0.08).
        expect(o.attLost).toBe(13);
        expect(o.attBind).toBe('soft');
      });
    }

    it('never lets the defender lose more than the attacker across seeded rolls', async () => {
      for (let seed = 0; seed < 25; seed++) {
        const o = await run({ ...base, seed: `23555:${seed}` });
        expect(o.defLost).toBeLessThanOrEqual(o.attLost);
        expect(o.result).toBe('LOSS');
      }
    });

    it('scales the attacker loss with the committed turns', async () => {
      const lost: number[] = [];
      for (const turns of [1, 3, 5, 10]) {
        const o = await run({ ...base, turns });
        expect(o.defLost).toBe(0);
        lost.push(o.attLost);
      }
      expect(lost).toEqual([...lost].sort((a, b) => a - b));
      expect(lost.at(-1)).toBe(13);
    });

    it('still lets a defender with no gear be broken and lose troops', async () => {
      const o = await run({
        ...base,
        defender: {
          ...DEFENDER,
          roster: { ...DEFENDER.roster, defenseSets: 0 },
        },
      });
      expect(o.result).toBe('WIN');
      expect(o.defLost).toBeGreaterThan(0);
    });

    it('keeps the daily dogpile allowance binding for a defender that is hit', async () => {
      const o = await run({
        ...base,
        defender: {
          ...DEFENDER,
          roster: { ...DEFENDER.roster, defenseSets: 0 },
        },
        options: { defenderDailyCasualtyRemaining: 5 },
      });
      expect(o.defLost).toBeLessThanOrEqual(5);
      expect(o.defBind).toBe('daily');
    });
  });
