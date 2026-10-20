import { describe, expect, test } from 'bun:test';

import { adminCombatDetails, combatSnapshot } from './adminCombat';

describe('administration combat reports', () => {
  test('keeps exact gold and complete rosters while excluding account and replay secrets', () => {
    const snapshot = combatSnapshot({
      gold: '90071992547409930',
      stamina: 42,
      units: [{ type: 'OFFENSE', level: 1, quantity: 50, userId: 7 }],
      email: 'private',
      password: 'private',
      seed: 'private',
    });
    expect(snapshot).toEqual({
      gold: '90071992547409930',
      stamina: 42,
      units: [{ type: 'OFFENSE', level: 1, quantity: 50 }],
    });
    const details = adminCombatDetails({
      adminSnapshots: {
        version: 1,
        before: { attacker: snapshot },
        after: { attacker: { gold: '90071992547409940' } },
      },
      replay: { seed: 'never-return' },
    });
    expect(details.completeSnapshots).toBe(true);
    expect(details.after.attacker.gold).toBe('90071992547409940');
    expect(JSON.stringify(details)).not.toContain('never-return');
  });
  test('records the armory inventory without row ids or owners', () => {
    const snapshot = combatSnapshot({
      items: [
        {
          id: 'row-1',
          userId: 7,
          usage: 'OFFENSE',
          type: 'WEAPON',
          level: 2,
          quantity: 40,
        },
      ],
    });
    expect(snapshot.items).toEqual([
      { usage: 'OFFENSE', type: 'WEAPON', level: 2, quantity: 40 },
    ]);
    const details = adminCombatDetails({
      adminSnapshots: { version: 1, before: { attacker: snapshot } },
    });
    expect(details.before.attacker.items).toEqual(snapshot.items);
    expect(adminCombatDetails({}).before.attacker.items).toBeUndefined();
  });
  test('uses recorded legacy values without inventing missing balances', () => {
    const details = adminCombatDetails({
      startOfAttack: {
        Attacker: { experience: 10 },
        Defender: { experience: 15 },
      },
      xpEarned: '{"attacker":3,"defender":2}',
      forthpAtStart: 100,
      forthpAtEnd: 80,
      endTurns: 9,
      attacker_units: '[{"type":"OFFENSE","level":1,"quantity":4}]',
      replay: 'private',
    });
    expect(details.completeSnapshots).toBe(false);
    expect(details.before.attacker.gold).toBeUndefined();
    expect(details.after.attacker.experience).toBe(13);
    expect(details.after.defender.experience).toBe(17);
    expect(details.before.defender.fortHitpoints).toBe(100);
    expect(details.after.defender.fortHitpoints).toBe(80);
  });
  test('accepts malformed or missing historical JSON', () => {
    expect(adminCombatDetails(null).before.attacker).toEqual({});
    expect(
      adminCombatDetails({ xpEarned: 'broken', attacker_units: 'broken' }).after
        .attacker.units,
    ).toEqual([]);
  });
});
