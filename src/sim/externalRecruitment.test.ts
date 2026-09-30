import { describe, expect, it } from 'bun:test';

import type {
  RecruitmentAwardResult,
  RecruitmentParticipantRecord,
} from './externalRecruitment';
import {
  generateRecruitmentEvents,
  RECRUITMENT_DEFAULT_SELECTION_SHARE,
  RECRUITMENT_EVENT_CITIZEN_REWARD,
  RECRUITMENT_EVENT_GOLD_REWARD,
} from './externalRecruitment';
import { SimulationConfigError, SimulationInvariantError } from './invariants';
import { createPlayerState } from './population';
import type { Rng } from './random';
import { createRng } from './random';
import type { RecruitmentManifest } from './scenarioTypes';
import { RECRUITMENT_REWARD_BANDS } from './scenarioTypes';
import type { PlayerState } from './types';

const DEFAULT_MANIFEST: RecruitmentManifest = {
  rewardsPerDay: 25,
  band: 25,
  recipientMode: 'self',
  selectionShare: RECRUITMENT_DEFAULT_SELECTION_SHARE,
};

function makePlayer(
  id: string,
  status: PlayerState['status'] = 'active',
  gold = 25_000,
): PlayerState {
  const player = createPlayerState(1, 'balanced', 1, id);
  player.status = status;
  player.gold = gold;
  player.goldInBank = 0;
  player.units = { ...player.units, citizen: 50 };
  return player;
}

function makeActivePlayers(count: number, prefix = 'player'): PlayerState[] {
  const players: PlayerState[] = [];
  for (let i = 0; i < count; i++) {
    players.push(makePlayer(`${prefix}_${i}`));
  }
  return players;
}

function participantIds(result: RecruitmentAwardResult): string[] {
  return result.participants.map((record) => record.playerId).sort();
}

describe('generateRecruitmentEvents - 75% selection rounding', () => {
  it('selects 8 of 10 active players (round-half-up, matches stress-test table)', () => {
    const players = makeActivePlayers(10);
    const result = generateRecruitmentEvents(
      DEFAULT_MANIFEST,
      players,
      1,
      createRng(42),
    );
    expect(result.participantCount).toBe(8);
    expect(result.participants).toHaveLength(8);
  });

  it('selects 11 of 15 active players', () => {
    const players = makeActivePlayers(15);
    const result = generateRecruitmentEvents(
      DEFAULT_MANIFEST,
      players,
      1,
      createRng(42),
    );
    expect(result.participantCount).toBe(11);
  });

  it('selects 15 of 20 active players', () => {
    const players = makeActivePlayers(20);
    const result = generateRecruitmentEvents(
      DEFAULT_MANIFEST,
      players,
      1,
      createRng(42),
    );
    expect(result.participantCount).toBe(15);
  });

  it('produces an identical selected cohort for the same seed', () => {
    const playersA = makeActivePlayers(15);
    const playersB = makeActivePlayers(15);
    const resultA = generateRecruitmentEvents(
      DEFAULT_MANIFEST,
      playersA,
      1,
      createRng(42),
    );
    const resultB = generateRecruitmentEvents(
      DEFAULT_MANIFEST,
      playersB,
      1,
      createRng(42),
    );
    expect(participantIds(resultA)).toEqual(participantIds(resultB));
  });

  it('never selects more than the eligible pool', () => {
    const players = makeActivePlayers(1);
    const result = generateRecruitmentEvents(
      DEFAULT_MANIFEST,
      players,
      1,
      createRng(7),
    );
    expect(result.participantCount).toBe(1);
  });
});

describe('generateRecruitmentEvents - daily citizen + gold arithmetic', () => {
  it('awards exactly 25 citizens and 6,250 gold for one self-mode participant at band 25', () => {
    const players = makeActivePlayers(1);
    const before = { gold: players[0].gold, citizen: players[0].units.citizen };
    const result = generateRecruitmentEvents(
      DEFAULT_MANIFEST,
      players,
      1,
      createRng(1),
    );
    expect(result.totalCitizens).toBe(25);
    expect(result.totalGold).toBe(6_250);
    expect(players[0].units.citizen - before.citizen).toBe(25);
    expect(players[0].gold - before.gold).toBe(6_250);
  });

  it('scales linearly across every supported band for a single participant', () => {
    for (const band of RECRUITMENT_REWARD_BANDS) {
      const players = makeActivePlayers(1);
      const result = generateRecruitmentEvents(
        { ...DEFAULT_MANIFEST, band },
        players,
        1,
        createRng(1),
      );
      expect(result.totalCitizens).toBe(
        band * RECRUITMENT_EVENT_CITIZEN_REWARD,
      );
      expect(result.totalGold).toBe(band * RECRUITMENT_EVENT_GOLD_REWARD);
    }
  });

  it('totals 8 x 25 = 200 citizens and 50,000 gold for 8 self-mode participants at band 25', () => {
    const players = makeActivePlayers(10);
    const result = generateRecruitmentEvents(
      DEFAULT_MANIFEST,
      players,
      1,
      createRng(42),
    );
    expect(result.participantCount).toBe(8);
    expect(result.totalCitizens).toBe(8 * 25);
    expect(result.totalGold).toBe(8 * 25 * 250);
  });

  it('records one aggregated event per recipient with exact citizen/gold totals', () => {
    const players = makeActivePlayers(10);
    const result = generateRecruitmentEvents(
      DEFAULT_MANIFEST,
      players,
      5,
      createRng(42),
    );
    expect(result.events).toHaveLength(result.participantCount);
    for (const event of result.events) {
      expect(event.day).toBe(5);
      expect(event.sourceMode).toBe('self');
      expect(event.citizensAwarded).toBe(25);
      expect(event.goldAwarded).toBe(6_250);
    }
  });
});

describe('generateRecruitmentEvents - yearly totals (daily x 365)', () => {
  it('accumulates 9,125 citizens and 2,281,250 gold over 365 days at band 25', () => {
    const players = makeActivePlayers(1);
    const before = { gold: players[0].gold, citizen: players[0].units.citizen };
    const rng = createRng(1);
    let totalCitizens = 0;
    let totalGold = 0;
    for (let day = 1; day <= 365; day++) {
      const result = generateRecruitmentEvents(
        DEFAULT_MANIFEST,
        players,
        day,
        rng,
      );
      totalCitizens += result.totalCitizens;
      totalGold += result.totalGold;
    }
    expect(totalCitizens).toBe(25 * 365);
    expect(totalCitizens).toBe(9_125);
    expect(totalGold).toBe(6_250 * 365);
    expect(totalGold).toBe(2_281_250);
    expect(players[0].units.citizen - before.citizen).toBe(9_125);
    expect(players[0].gold - before.gold).toBe(2_281_250);
  });
});

describe('generateRecruitmentEvents - ineligible recipients', () => {
  it('excludes inactive players from selection and awards them nothing', () => {
    const active = makeActivePlayers(4, 'active');
    const inactive = makePlayer('inactive_0', 'inactive');
    const beforeGold = inactive.gold;
    const beforeCitizen = inactive.units.citizen;
    const pool = [...active, inactive];

    const result = generateRecruitmentEvents(
      DEFAULT_MANIFEST,
      pool,
      1,
      createRng(42),
    );

    expect(result.participantCount).toBe(3);
    expect(
      result.participants.some((record) => record.playerId === 'inactive_0'),
    ).toBe(false);
    expect(inactive.gold).toBe(beforeGold);
    expect(inactive.units.citizen).toBe(beforeCitizen);
  });

  it('rejects a defeated recipient in the pool with a config error', () => {
    const active = makeActivePlayers(4, 'active');
    const defeated = makePlayer('defeated_0', 'defeated');
    const pool = [...active, defeated];

    try {
      generateRecruitmentEvents(DEFAULT_MANIFEST, pool, 1, createRng(42));
      throw new Error('expected SimulationConfigError for defeated recipient');
    } catch (error) {
      if (!(error instanceof SimulationConfigError)) throw error;
      expect(error.code).toBe('recruitment-defeated-recipient');
      expect(error.playerId).toBe('defeated_0');
    }
  });

  it('awards no citizens or gold to any inactive player even when mixed with active', () => {
    const pool = [
      ...makeActivePlayers(3, 'a'),
      makePlayer('idle_0', 'inactive'),
      makePlayer('idle_1', 'inactive'),
    ];
    const idleBefore = pool
      .filter((player) => player.status === 'inactive')
      .map((player) => ({ id: player.id, gold: player.gold }));

    generateRecruitmentEvents(DEFAULT_MANIFEST, pool, 1, createRng(99));

    const idleAfter = pool
      .filter((player) => player.status === 'inactive')
      .map((player) => ({ id: player.id, gold: player.gold }));

    expect(idleAfter).toEqual(idleBefore);
  });
});

describe('generateRecruitmentEvents - self mode ownership', () => {
  it('routes every reward to the participant who earned it', () => {
    const players = makeActivePlayers(10);
    const goldBefore = new Map(
      players.map((player) => [player.id, player.gold]),
    );

    const result = generateRecruitmentEvents(
      DEFAULT_MANIFEST,
      players,
      1,
      createRng(42),
    );

    const selectedIds = new Set(
      result.participants.map((record) => record.playerId),
    );
    for (const player of players) {
      const before = goldBefore.get(player.id);
      if (before === undefined) {
        throw new Error(`missing gold baseline for ${player.id}`);
      }
      if (selectedIds.has(player.id)) {
        expect(player.gold - before).toBe(6_250);
      } else {
        expect(player.gold).toBe(before);
      }
    }
    for (const record of result.participants) {
      const player = players.find((entry) => entry.id === record.playerId);
      expect(player).toBeDefined();
      expect(record.eventsReceived).toBe(25);
      expect(record.citizensAwarded).toBe(25);
      expect(record.goldAwarded).toBe(6_250);
      expect(record.selected).toBe(true);
    }
  });
});

describe('generateRecruitmentEvents - networkWeighted 80/20 concentration', () => {
  function networkResult(
    activeCount: number,
    band: number,
    seed = 42,
  ): { result: RecruitmentAwardResult; players: PlayerState[] } {
    const players = makeActivePlayers(activeCount);
    const result = generateRecruitmentEvents(
      { ...DEFAULT_MANIFEST, band, recipientMode: 'networkWeighted' },
      players,
      1,
      createRng(seed),
    );
    return { result, players };
  }

  it('concentrates 80% of events in the top quintile for 10 active / band 25', () => {
    const { result } = networkResult(10, 25);
    expect(result.participantCount).toBe(8);
    expect(result.mode).toBe('networkWeighted');

    const counts = result.participants
      .map((record) => record.eventsReceived)
      .sort((a, b) => b - a);
    expect(counts).toEqual([160, 6, 6, 6, 6, 6, 5, 5]);
    expect(result.totalCitizens).toBe(200);
    expect(result.totalGold).toBe(200 * 250);
    expect(result.concentrationRatio).toBeCloseTo(0.8, 10);
  });

  it('keeps the 80/20 ratio within integer rounding for 15 active / band 25', () => {
    const { result } = networkResult(15, 25);
    expect(result.participantCount).toBe(11);
    expect(result.totalCitizens).toBe(11 * 25);
    expect(result.concentrationRatio).toBeCloseTo(0.8, 10);

    const topCount = Math.max(1, Math.floor(11 * 0.2));
    const sorted = result.participants
      .map((record) => record.eventsReceived)
      .sort((a, b) => b - a);
    const topShare = sorted.slice(0, topCount);
    const concentrated = topShare.reduce((sum, value) => sum + value, 0);
    expect(concentrated).toBe(Math.round(275 * 0.8));
  });

  it('keeps the 80/20 ratio within integer rounding for 20 active / band 25', () => {
    const { result } = networkResult(20, 25);
    expect(result.participantCount).toBe(15);
    expect(result.totalCitizens).toBe(15 * 25);
    expect(result.concentrationRatio).toBeCloseTo(0.8, 10);
  });

  it('totals every discrete event across the recipient pool', () => {
    const { result } = networkResult(10, 25);
    const summed = result.participants.reduce(
      (acc, record) => acc + record.eventsReceived,
      0,
    );
    expect(summed).toBe(result.participantCount * 25);
    expect(result.recipientCount).toBe(result.participantCount);
  });

  it('is deterministic for a fixed seed', () => {
    const a = networkResult(10, 25, 42);
    const b = networkResult(10, 25, 42);
    const sortIds = (records: readonly RecruitmentParticipantRecord[]) =>
      records
        .map((record) => `${record.playerId}:${record.eventsReceived}`)
        .sort();
    expect(sortIds(a.result.participants)).toEqual(
      sortIds(b.result.participants),
    );
  });
});

describe('generateRecruitmentEvents - overflow rejection', () => {
  it('throws SimulationInvariantError when gold exceeds MAX_SAFE_INTEGER', () => {
    const players = makeActivePlayers(1);
    players[0].gold = Number.MAX_SAFE_INTEGER - 1_000;

    try {
      generateRecruitmentEvents(
        { ...DEFAULT_MANIFEST, band: 40 },
        players,
        365,
        createRng(1),
      );
      throw new Error('expected SimulationInvariantError for gold overflow');
    } catch (error) {
      if (!(error instanceof SimulationInvariantError)) throw error;
      expect(error.reason).toBe('unsafe-integer');
      expect(error.field).toBe('gold');
      expect(error.day).toBe(365);
      expect(error.playerId).toBe(players[0].id);
    }
  });

  it('does not throw when the award stays within the safe-integer range', () => {
    const players = makeActivePlayers(1);
    players[0].gold = Number.MAX_SAFE_INTEGER - 20_000;
    const result = generateRecruitmentEvents(
      { ...DEFAULT_MANIFEST, band: 5 },
      players,
      1,
      createRng(1),
    );
    expect(result.totalGold).toBe(1_250);
    expect(Number.isSafeInteger(players[0].gold)).toBe(true);
  });
});

describe('generateRecruitmentEvents - manifest validation', () => {
  it('rejects unsupported throughput band 41', () => {
    try {
      generateRecruitmentEvents(
        { ...DEFAULT_MANIFEST, band: 41 },
        makeActivePlayers(10),
        1,
        createRng(1),
      );
      throw new Error('expected SimulationConfigError for band 41');
    } catch (error) {
      if (!(error instanceof SimulationConfigError)) throw error;
      expect(error.code).toBe('recruitment-band-unsupported');
    }
  });

  it('rejects negative throughput', () => {
    try {
      generateRecruitmentEvents(
        { ...DEFAULT_MANIFEST, band: -5 },
        makeActivePlayers(10),
        1,
        createRng(1),
      );
      throw new Error('expected SimulationConfigError for negative band');
    } catch (error) {
      if (!(error instanceof SimulationConfigError)) throw error;
      expect(error.code).toBe('recruitment-band-unsupported');
    }
  });

  it('rejects band 0 (not a declared band)', () => {
    expect(() =>
      generateRecruitmentEvents(
        { ...DEFAULT_MANIFEST, band: 0 },
        makeActivePlayers(10),
        1,
        createRng(1),
      ),
    ).toThrow(SimulationConfigError);
  });

  it('rejects an out-of-range selection share', () => {
    try {
      generateRecruitmentEvents(
        { ...DEFAULT_MANIFEST, selectionShare: 1.5 },
        makeActivePlayers(10),
        1,
        createRng(1),
      );
      throw new Error('expected SimulationConfigError for selection share > 1');
    } catch (error) {
      if (!(error instanceof SimulationConfigError)) throw error;
      expect(error.code).toBe('recruitment-selection-share-invalid');
    }
  });
});

describe('generateRecruitmentEvents - public API distinction from unit training', () => {
  it('exports recruitment-specific names that do not collide with economy recruitUnits', () => {
    expect(typeof generateRecruitmentEvents).toBe('function');
    expect(generateRecruitmentEvents.name).toBe('generateRecruitmentEvents');
    expect(RECRUITMENT_EVENT_CITIZEN_REWARD).toBe(1);
    expect(RECRUITMENT_EVENT_GOLD_REWARD).toBe(250);
    expect(RECRUITMENT_DEFAULT_SELECTION_SHARE).toBe(0.75);
  });

  it('returns a RecruitmentAwardResult whose fields describe reward events, not unit conversion', () => {
    const result = generateRecruitmentEvents(
      DEFAULT_MANIFEST,
      makeActivePlayers(1),
      1,
      createRng(1),
    );
    expect(result).toHaveProperty('totalCitizens');
    expect(result).toHaveProperty('totalGold');
    expect(result).toHaveProperty('participantCount');
    expect(result).toHaveProperty('concentrationRatio');
    expect(result).toHaveProperty('mode');
    expect(result.mode).toBe('self');
    expect(result.concentrationRatio).toBe(1);
  });

  it('accepts an injected Rng for deterministic selection', () => {
    const rng: Rng = createRng(123);
    const a = generateRecruitmentEvents(
      DEFAULT_MANIFEST,
      makeActivePlayers(15),
      1,
      rng,
    );
    const b = generateRecruitmentEvents(
      DEFAULT_MANIFEST,
      makeActivePlayers(15),
      1,
      createRng(123),
    );
    expect(participantIds(a)).toEqual(participantIds(b));
  });
});
