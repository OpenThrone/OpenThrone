import { describe, expect, it } from 'bun:test';

import {
  assessAttackRecommendation,
  type RecommendationEvidence,
} from '@/utils/attackRecommendation';

const NOW = Date.parse('2026-10-19T12:00:00Z');
const intel = (defense: number | null, age = 0): RecommendationEvidence => ({
  id: 1,
  timestamp: new Date(NOW - age).toISOString(),
  kind: 'intel',
  defense,
  won: null,
});
const battle = (won: boolean | null): RecommendationEvidence => ({
  ...intel(null),
  kind: 'battle',
  won,
});
describe('report-backed assessment', () => {
  it('withholds advice for missing, invalid and future evidence', () => {
    for (const reports of [
      [],
      [intel(null)],
      [intel(NaN)],
      [intel(-1)],
      [intel(10, -1)],
    ]) {
      expect(assessAttackRecommendation(reports, 100, NOW).verdict).toBe(
        'insufficient',
      );
    }
    expect(assessAttackRecommendation([intel(10)], 0, NOW).verdict).toBe(
      'insufficient',
    );
  });
  it('gives only qualitative guidance from recent estimates', () => {
    expect(assessAttackRecommendation([intel(50)], 100, NOW).verdict).toBe(
      'limited',
    );
    expect(assessAttackRecommendation([intel(100)], 100, NOW).verdict).toBe(
      'caution',
    );
    expect(assessAttackRecommendation([battle(false)], 100, NOW).verdict).toBe(
      'caution',
    );
    expect(assessAttackRecommendation([battle(true)], 100, NOW).verdict).toBe(
      'limited',
    );
  });
  it('withholds favorable guidance when recent reports conflict', () => {
    expect(
      assessAttackRecommendation([battle(false), intel(50)], 100, NOW).verdict,
    ).toBe('conflicting');
  });
  it('uses original timestamps and discards reports beyond the history window', () => {
    expect(
      assessAttackRecommendation([intel(1, 31 * 60000)], 100, NOW).verdict,
    ).toBe('stale');
    expect(
      assessAttackRecommendation([intel(1, 25 * 3600000)], 100, NOW).evidence,
    ).toEqual([]);
  });
});

const MINUTE = 60_000;
const OFFLINE = NOW - 2 * 60 * MINUTE;
const convincing = {
  army: 1000,
  deaths: 5,
  wounded: 5,
  enemyDeaths: 80,
  damageDealt: 1000,
  damageReceived: 200,
  turns: 10,
};
const strongBattle = (age = 0): RecommendationEvidence => ({
  ...battle(true),
  timestamp: new Date(NOW - age).toISOString(),
  battle: convincing,
});

describe('battle quality and activity-aware decay', () => {
  it('promotes a convincing ten-turn win with low relative casualties', () => {
    expect(
      assessAttackRecommendation([strongBattle()], 100, NOW, OFFLINE, 990)
        .verdict,
    ).toBe('favorable');
    expect(
      assessAttackRecommendation([battle(true)], 100, NOW, OFFLINE, 990)
        .verdict,
    ).toBe('limited');
  });
  it('does not promote a costly win, missing facts, or a depleted current army', () => {
    const costly = {
      ...strongBattle(),
      battle: { ...convincing, deaths: 200 },
    };
    expect(
      assessAttackRecommendation([costly], 100, NOW, OFFLINE, 1000).verdict,
    ).toBe('caution');
    expect(
      assessAttackRecommendation(
        [{ ...strongBattle(), battle: { ...convincing, wounded: null } }],
        100,
        NOW,
        OFFLINE,
        1000,
      ).verdict,
    ).toBe('limited');
    expect(
      assessAttackRecommendation([strongBattle()], 100, NOW, OFFLINE, 100)
        .verdict,
    ).toBe('limited');
  });
  it('accepts corroborating intel and an adequately documented ordinary win', () => {
    const ordinary = {
      ...strongBattle(),
      battle: { ...convincing, wounded: 70 },
    };
    expect(
      assessAttackRecommendation([ordinary, intel(30)], 100, NOW, OFFLINE, 1000)
        .verdict,
    ).toBe('favorable');
  });
  it('decays favorable to limited to stale without changing source timestamps', () => {
    expect(
      assessAttackRecommendation(
        [strongBattle(10 * MINUTE)],
        100,
        NOW,
        OFFLINE,
        1000,
      ).verdict,
    ).toBe('favorable');
    expect(
      assessAttackRecommendation(
        [strongBattle(31 * MINUTE)],
        100,
        NOW,
        OFFLINE,
        1000,
      ).verdict,
    ).toBe('limited');
    const old = strongBattle(61 * MINUTE);
    expect(
      assessAttackRecommendation([old], 100, NOW, OFFLINE, 1000).verdict,
    ).toBe('stale');
    expect(
      assessAttackRecommendation([old], 100, NOW, OFFLINE, 1000).evidence[0]
        .timestamp,
    ).toBe(old.timestamp);
  });
  it('ages online evidence faster and never restores confidence when going offline', () => {
    const report = strongBattle();
    const states = [5, 15, 16, 30, 60, 61].map((minutes) =>
      assessAttackRecommendation(
        [report],
        100,
        NOW + minutes * MINUTE,
        NOW,
        1000,
      ),
    );
    const confidences = states.map((state) => state.evidence[0].confidence);
    expect(
      confidences.every(
        (value, index) => index === 0 || value <= confidences[index - 1],
      ),
    ).toBe(true);
    expect(states[0].activity).toBe('online');
    expect(states[2].activity).toBe('recent');
    expect(states[5].activity).toBe('offline');
    const aged = strongBattle(12 * MINUTE);
    expect(
      assessAttackRecommendation([aged], 100, NOW, NOW, 1000).verdict,
    ).toBe('limited');
    expect(
      assessAttackRecommendation([aged], 100, NOW, OFFLINE, 1000).verdict,
    ).toBe('favorable');
  });
  it('new activity accelerates already aging evidence; unknown presence is conservative', () => {
    const aged = strongBattle(15 * MINUTE);
    const offline = assessAttackRecommendation([aged], 100, NOW, OFFLINE, 1000);
    const online = assessAttackRecommendation([aged], 100, NOW, NOW, 1000);
    expect(online.evidence[0].confidence).toBeLessThan(
      offline.evidence[0].confidence,
    );
    expect(
      assessAttackRecommendation([aged], 100, NOW, null, 1000).activity,
    ).toBe('unknown');
  });
  it('gives a newer defeat priority over an older convincing victory', () => {
    const loss = { ...battle(false), id: 2 };
    expect(
      assessAttackRecommendation(
        [strongBattle(MINUTE), loss],
        100,
        NOW,
        OFFLINE,
        1000,
      ).verdict,
    ).toBe('caution');
  });
  it('does not upgrade a matchup just because the defender is offline', () => {
    for (const active of [NOW, OFFLINE, null]) {
      expect(
        assessAttackRecommendation([intel(200)], 100, NOW, active, 1000)
          .verdict,
      ).toBe('caution');
    }
  });
});

it('counts wounded troops in the casualty exchange, even with a large own army', () => {
  const report = {
    ...strongBattle(),
    battle: {
      ...convincing,
      army: 10000,
      deaths: 0,
      wounded: 100,
      enemyDeaths: 1,
    },
  };
  expect(
    assessAttackRecommendation([report], 100, NOW, OFFLINE, 9900).verdict,
  ).toBe('limited');
});
