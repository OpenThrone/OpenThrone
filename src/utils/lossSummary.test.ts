import { describe, expect, it } from 'bun:test';

import {
  summarizeBattleLosses,
  unitTypeFallbackLabel,
} from '@/utils/lossSummary';

// The battle-report loss line must not call mixed casualties soldiers, and a
// single lost unit should be named by its type (#284).
describe('summarizeBattleLosses', () => {
  it('names the unit type when exactly one regular unit was lost', () => {
    expect(
      summarizeBattleLosses({
        total: 1,
        units: [{ type: 'DEFENSE', level: 1, quantity: 1 }],
      }),
    ).toEqual({ total: 1, unitType: 'DEFENSE' });
  });

  it('reads the same summary from a legacy JSON string row', () => {
    expect(
      summarizeBattleLosses(
        JSON.stringify({
          total: 1,
          units: [{ type: 'SENTRY', level: 2, quantity: 1 }],
        }),
      ),
    ).toEqual({ total: 1, unitType: 'SENTRY' });
  });

  it('stays generic when several units were lost', () => {
    expect(
      summarizeBattleLosses({
        total: 3,
        units: [{ type: 'DEFENSE', level: 1, quantity: 3 }],
      }),
    ).toEqual({ total: 3, unitType: null });
  });

  it('stays generic when the loss mixes unit types', () => {
    expect(
      summarizeBattleLosses({
        total: 2,
        units: [
          { type: 'DEFENSE', level: 1, quantity: 1 },
          { type: 'CITIZEN', level: 1, quantity: 1 },
        ],
      }),
    ).toEqual({ total: 2, unitType: null });
  });

  it('stays generic for a single lost mercenary', () => {
    expect(
      summarizeBattleLosses({
        total: 1,
        units: [{ type: 'DEFENSE', level: 1, quantity: 1, isMercenary: true }],
      }),
    ).toEqual({ total: 1, unitType: null });
  });

  it('ignores quantity fields that disagree with the total', () => {
    expect(
      summarizeBattleLosses({
        total: 1,
        units: [{ type: 'DEFENSE', level: 1, quantity: 2 }],
      }),
    ).toEqual({ total: 1, unitType: null });
  });

  it('tolerates redacted totals without a unit breakdown', () => {
    expect(summarizeBattleLosses({ total: 214 })).toEqual({
      total: 214,
      unitType: null,
    });
  });

  it('never throws on missing or malformed rows', () => {
    expect(summarizeBattleLosses(undefined)).toEqual({
      total: 0,
      unitType: null,
    });
    expect(summarizeBattleLosses(null)).toEqual({ total: 0, unitType: null });
    expect(summarizeBattleLosses('not json')).toEqual({
      total: 0,
      unitType: null,
    });
  });
});

describe('unitTypeFallbackLabel', () => {
  it('capitalizes unknown unit types for display', () => {
    expect(unitTypeFallbackLabel('DEFENSE')).toBe('Defense');
  });
});
