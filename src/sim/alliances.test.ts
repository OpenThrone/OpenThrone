import { describe, expect, it } from 'bun:test';

import type {
  AllianceFocusFireNomination,
  AllianceTreasuryRecord,
  CoordinatedAttackContext,
} from './alliances';
import {
  ALLIANCE_AID_INCOME_FRACTION,
  ALLIANCE_AID_TREASURY_FRACTION,
  ALLIANCE_ATTACK_LEVEL_RANGE,
  ALLIANCE_MAX_ATTACKS_PER_PAIR_24H,
  ALLIANCE_PROTECTED_MAX_LEVEL,
  allianceGoldTotal,
  allianceStateForPlayer,
  authorizeTreasuryAid,
  buildAllianceManifests,
  countAttacksInWindow,
  createAllianceState,
  createAllianceStates,
  defaultAttackerOrder,
  depositToTreasury,
  DOMINANT_SPLIT_FRACTION,
  estimateTrailing7dIncome,
  FOCUS_FIVE_ALLIANCE_SIZE,
  isAllied,
  isIntelFresh,
  isWithinLevelRange,
  manifestMembershipMap,
  nominateFocusTarget,
  planCoordinatedAttack,
  recordRetaliation,
  shareFreshIntel,
} from './alliances';
import { SimulationConfigError, SimulationInvariantError } from './invariants';
import { createPlayerState } from './population';
import type { AllianceManifest } from './scenarioTypes';
import type { IntelResult, PlayerState } from './types';

const DEFAULT_LEVEL = 10;
const DEFAULT_GOLD = 100_000;

function makePlayer(
  id: string,
  level: number = DEFAULT_LEVEL,
  gold: number = DEFAULT_GOLD,
  status: PlayerState['status'] = 'active',
): PlayerState {
  const player = createPlayerState(level, 'balanced', 1, id);
  player.gold = gold;
  player.goldInBank = 0;
  player.attackTurns = 50;
  player.stamina = 100;
  player.status = status;
  return player;
}

function makePlayers(
  count: number,
  prefix = 'player',
  level = DEFAULT_LEVEL,
): PlayerState[] {
  const out: PlayerState[] = [];
  for (let i = 0; i < count; i++) {
    out.push(makePlayer(`${prefix}_${i}`, level));
  }
  return out;
}

function toMap(players: readonly PlayerState[]): Map<string, PlayerState> {
  return new Map(players.map((player) => [player.id, player]));
}

function freshIntel(day: number): IntelResult {
  return {
    success: true,
    day,
    spyCasualties: 0,
    spiesSent: 1,
    defenderInfo: {
      units: {
        soldier: 0,
        knight: 0,
        berserker: 0,
        guard: 0,
        archer: 0,
        royalGuard: 0,
        spy: 0,
        infiltrator: 0,
        assassin: 0,
        sentry: 0,
        sentinel: 0,
        inquisitor: 0,
        citizen: 0,
        worker: 0,
      },
      fortLevel: 1,
      fortHp: 50,
      fortMaxHp: 50,
      gold: 0,
      defenseBonus: 0,
      spyLevel: 1,
      sentryLevel: 1,
    },
  };
}

describe('buildAllianceManifests - none mode', () => {
  it('returns an empty map and forms no alliances', () => {
    const players = makePlayers(10);
    const manifests = buildAllianceManifests('none', players);
    expect(manifests.size).toBe(0);
    expect(manifestMembershipMap(manifests).size).toBe(0);
  });
});

describe('buildAllianceManifests - deterministic splits', () => {
  it('twoBalanced splits eligible players as ceil(n/2) / floor(n/2)', () => {
    const players = makePlayers(10);
    const manifests = buildAllianceManifests('twoBalanced', players);
    expect(manifests.size).toBe(2);
    const sizes = [...manifests.values()].map(
      (manifest) => manifest.members.length,
    );
    expect(sizes.sort((a, b) => a - b)).toEqual([5, 5]);
  });

  it('twoBalanced uses ceil for the first alliance on an odd total', () => {
    const players = makePlayers(15);
    const manifests = buildAllianceManifests('twoBalanced', players);
    const byId = [...manifests.entries()].sort((a, b) =>
      a[0] < b[0] ? -1 : 1,
    );
    expect(byId[0][1].members.length).toBe(8);
    expect(byId[1][1].members.length).toBe(7);
  });

  it('dominant60_40 routes ~60% into the dominant alliance', () => {
    const players = makePlayers(10);
    const manifests = buildAllianceManifests('dominant60_40', players);
    expect(manifests.size).toBe(2);
    const dominant = manifests.get('alliance-dominant');
    const minor = manifests.get('alliance-minor');
    expect(dominant?.members.length).toBe(6);
    expect(minor?.members.length).toBe(4);
  });

  it('dominant60_40 never empties the minor alliance', () => {
    const players = makePlayers(2);
    const manifests = buildAllianceManifests('dominant60_40', players);
    const dominant = manifests.get('alliance-dominant');
    const minor = manifests.get('alliance-minor');
    expect(dominant?.members.length).toBe(1);
    expect(minor?.members.length).toBe(1);
  });

  it('focusFive forms exactly one alliance of at most five members', () => {
    const players = makePlayers(12);
    const manifests = buildAllianceManifests('focusFive', players);
    expect(manifests.size).toBe(1);
    const focus = manifests.get('alliance-focus');
    expect(focus?.members.length).toBe(FOCUS_FIVE_ALLIANCE_SIZE);
    expect(focus?.mode).toBe('focusFive');
  });

  it('focusFive caps membership at the available eligible count', () => {
    const players = makePlayers(3);
    const manifests = buildAllianceManifests('focusFive', players);
    expect(manifests.get('alliance-focus')?.members.length).toBe(3);
  });
});

describe('buildAllianceManifests - deterministic stability + leadership', () => {
  it('produces identical manifests for identical inputs regardless of input order', () => {
    const sorted = makePlayers(10);
    const shuffled = [...sorted].reverse();
    const a = buildAllianceManifests('twoBalanced', sorted);
    const b = buildAllianceManifests('twoBalanced', shuffled);
    expect(JSON.stringify([...a.entries()])).toBe(
      JSON.stringify([...b.entries()]),
    );
  });

  it('elects the lexicographically smallest member id as leader, stably', () => {
    const players = makePlayers(8);
    const manifests = buildAllianceManifests('twoBalanced', players);
    for (const manifest of manifests.values()) {
      const leaders = manifest.members.filter((seat) => seat.isLeader);
      expect(leaders.length).toBe(1);
      const ids = manifest.members.map((seat) => seat.playerId).sort();
      expect(leaders[0].playerId).toBe(ids[0]);
    }
  });

  it('assigns the same alliance id to every seat in an alliance', () => {
    const manifests = buildAllianceManifests('twoBalanced', makePlayers(6));
    for (const [allianceId, manifest] of manifests) {
      for (const seat of manifest.members) {
        expect(seat.allianceId).toBe(allianceId);
      }
    }
  });

  it('re-elects the same leader across repeated runs (stable membership)', () => {
    const players = makePlayers(20);
    const runA = buildAllianceManifests('dominant60_40', players);
    const runB = buildAllianceManifests('dominant60_40', players);
    for (const [id, manifest] of runA) {
      const leaderA = manifest.members.find((seat) => seat.isLeader);
      const leaderB = runB.get(id)?.members.find((seat) => seat.isLeader);
      expect(leaderA?.playerId).toBe(leaderB?.playerId);
    }
  });
});

describe('buildAllianceManifests - eligibility filtering', () => {
  it('rejects defeated players in the pool', () => {
    const pool = [
      ...makePlayers(4, 'active'),
      makePlayer('dead_0', 10, 1000, 'defeated'),
    ];
    try {
      buildAllianceManifests('twoBalanced', pool);
      throw new Error('expected SimulationConfigError for defeated player');
    } catch (error) {
      if (!(error instanceof SimulationConfigError)) throw error;
      expect(error.code).toBe('alliance-defeated-player');
      expect(error.playerId).toBe('dead_0');
    }
  });

  it('excludes inactive players from membership without erroring', () => {
    const active = makePlayers(4, 'a');
    const inactive = makePlayer('idle_0', 10, 1000, 'inactive');
    const manifests = buildAllianceManifests('twoBalanced', [
      ...active,
      inactive,
    ]);
    const seats = manifestMembershipMap(manifests);
    expect(seats.size).toBe(4);
    expect(seats.has('idle_0')).toBe(false);
  });

  it('rejects an unsupported mode', () => {
    try {
      buildAllianceManifests('nonsense' as never, makePlayers(4));
      throw new Error('expected SimulationConfigError for unsupported mode');
    } catch (error) {
      if (!(error instanceof SimulationConfigError)) throw error;
      expect(error.code).toBe('alliance-mode-unsupported');
    }
  });

  it('rejects twoBalanced with fewer than two eligible players', () => {
    try {
      buildAllianceManifests('twoBalanced', makePlayers(1));
      throw new Error('expected SimulationConfigError for too few eligible');
    } catch (error) {
      if (!(error instanceof SimulationConfigError)) throw error;
      expect(error.code).toBe('alliance-too-few-eligible');
    }
  });
});

describe('createAllianceState - manifest validation', () => {
  function manifest(
    members: { playerId: string; isLeader?: boolean }[],
    allianceId = 'alliance-x',
  ): AllianceManifest {
    return {
      mode: 'twoBalanced',
      members: members.map((member) => ({
        playerId: member.playerId,
        allianceId,
        isLeader: member.isLeader ?? false,
      })),
    };
  }

  it('rejects an empty manifest', () => {
    try {
      createAllianceState({ mode: 'none', members: [] });
      throw new Error('expected SimulationConfigError for empty manifest');
    } catch (error) {
      if (!(error instanceof SimulationConfigError)) throw error;
      expect(error.code).toBe('alliance-empty-manifest');
    }
  });

  it('rejects a manifest with no leader', () => {
    try {
      createAllianceState(manifest([{ playerId: 'a' }, { playerId: 'b' }]));
      throw new Error('expected SimulationConfigError for missing leader');
    } catch (error) {
      if (!(error instanceof SimulationConfigError)) throw error;
      expect(error.code).toBe('alliance-leader-count');
    }
  });

  it('rejects a manifest with multiple leaders', () => {
    try {
      createAllianceState(
        manifest([
          { playerId: 'a', isLeader: true },
          { playerId: 'b', isLeader: true },
        ]),
      );
      throw new Error('expected SimulationConfigError for multiple leaders');
    } catch (error) {
      if (!(error instanceof SimulationConfigError)) throw error;
      expect(error.code).toBe('alliance-leader-count');
    }
  });

  it('rejects duplicate member ids', () => {
    try {
      createAllianceState(
        manifest([{ playerId: 'a', isLeader: true }, { playerId: 'a' }]),
      );
      throw new Error('expected SimulationConfigError for duplicate members');
    } catch (error) {
      if (!(error instanceof SimulationConfigError)) throw error;
      expect(error.code).toBe('alliance-duplicate-members');
    }
  });

  it('rejects inconsistent alliance ids across seats', () => {
    const inconsistent: AllianceManifest = {
      mode: 'twoBalanced',
      members: [
        { playerId: 'a', allianceId: 'alliance-1', isLeader: true },
        { playerId: 'b', allianceId: 'alliance-2', isLeader: false },
      ],
    };
    try {
      createAllianceState(inconsistent);
      throw new Error('expected SimulationConfigError for inconsistent ids');
    } catch (error) {
      if (!(error instanceof SimulationConfigError)) throw error;
      expect(error.code).toBe('alliance-inconsistent-ids');
    }
  });

  it('initializes treasury at zero and empty logs', () => {
    const state = createAllianceState(
      manifest([{ playerId: 'a', isLeader: true }, { playerId: 'b' }]),
    );
    expect(state.treasury).toBe(0);
    expect(state.treasuryLog).toHaveLength(0);
    expect(state.intelShares).toHaveLength(0);
    expect(state.nominations).toHaveLength(0);
    expect(state.attackPlans).toHaveLength(0);
    expect(state.retaliationRecords).toHaveLength(0);
    expect(state.leaderId).toBe('a');
  });

  it('createAllianceStates builds one state per manifest', () => {
    const manifests = buildAllianceManifests('twoBalanced', makePlayers(6));
    const states = createAllianceStates(manifests);
    expect(states.size).toBe(manifests.size);
    for (const [id, state] of states) {
      expect(state.allianceId).toBe(id);
    }
  });
});

describe('alliance lookup helpers', () => {
  it('allianceStateForPlayer returns the owning alliance', () => {
    const players = makePlayers(4);
    const states = createAllianceStates(
      buildAllianceManifests('twoBalanced', players),
    );
    const first = players[0];
    const state = allianceStateForPlayer(states, first.id);
    expect(state?.memberIds.has(first.id)).toBe(true);
  });

  it('allianceStateForPlayer returns undefined for unallied players', () => {
    const states = createAllianceStates(
      buildAllianceManifests('twoBalanced', makePlayers(4)),
    );
    expect(allianceStateForPlayer(states, 'lonely')).toBeUndefined();
  });

  it('isAllied is true for co-members and false across alliances', () => {
    const players = makePlayers(4);
    const states = createAllianceStates(
      buildAllianceManifests('twoBalanced', players),
    );
    const seats = [
      ...manifestMembershipMap(
        buildAllianceManifests('twoBalanced', players),
      ).values(),
    ];
    const allianceOf = (id: string) =>
      allianceStateForPlayer(states, id)?.allianceId;
    const sameAlliance = players
      .filter((player) => allianceOf(player.id) === allianceOf(players[0].id))
      .map((player) => player.id);
    const otherAlliance = players
      .filter((player) => allianceOf(player.id) !== allianceOf(players[0].id))
      .map((player) => player.id);
    expect(sameAlliance.length).toBeGreaterThan(1);
    expect(isAllied(states, sameAlliance[0], sameAlliance[1])).toBe(true);
    expect(isAllied(states, sameAlliance[0], otherAlliance[0])).toBe(false);
    expect(seats.length).toBe(4);
  });

  it('isAllied treats a player as allied to itself', () => {
    const states = createAllianceStates(
      buildAllianceManifests('twoBalanced', makePlayers(4)),
    );
    expect(isAllied(states, 'player_0', 'player_0')).toBe(true);
  });
});

describe('depositToTreasury - member own-hand gold + conservation', () => {
  it('moves gold from member hand to treasury with no creation', () => {
    const players = makePlayers(4);
    const states = createAllianceStates(
      buildAllianceManifests('twoBalanced', players),
    );
    const state = [...states.values()][0];
    const member = state.members[0];
    const memberPlayer = players.find(
      (player) => player.id === member.playerId,
    )!;
    const members = toMap(players);

    const before = allianceGoldTotal(state, members);
    const record = depositToTreasury(state, memberPlayer, 25_000, 1);
    const after = allianceGoldTotal(state, members);

    expect(record.kind).toBe('deposit');
    expect(record.amount).toBe(25_000);
    expect(record.treasuryAfter).toBe(25_000);
    expect(record.recipientGoldAfter).toBe(memberPlayer.gold);
    expect(memberPlayer.gold).toBe(DEFAULT_GOLD - 25_000);
    expect(state.treasury).toBe(25_000);
    expect(before.total - after.total).toBe(0);
  });

  it('conserves the member+treasury sum across multiple deposits', () => {
    const players = makePlayers(4);
    const states = createAllianceStates(
      buildAllianceManifests('twoBalanced', players),
    );
    const state = [...states.values()][0];
    const members = toMap(players);
    const memberPlayer = players[0];
    const before = allianceGoldTotal(state, members).total;
    depositToTreasury(state, memberPlayer, 10_000, 1);
    depositToTreasury(state, memberPlayer, 5_000, 1);
    depositToTreasury(state, memberPlayer, 3_000, 1);
    const after = allianceGoldTotal(state, members).total;
    expect(after).toBe(before);
    expect(state.treasury).toBe(18_000);
  });

  it('rejects a deposit from a non-member', () => {
    const players = makePlayers(4);
    const states = createAllianceStates(
      buildAllianceManifests('twoBalanced', players),
    );
    const state = [...states.values()][0];
    const outsider = makePlayer('outsider', 10, 50_000);
    try {
      depositToTreasury(state, outsider, 1_000, 1);
      throw new Error('expected SimulationConfigError for non-member deposit');
    } catch (error) {
      if (!(error instanceof SimulationConfigError)) throw error;
      expect(error.code).toBe('alliance-deposit-non-member');
    }
  });

  it('rejects a deposit exceeding the member hand gold', () => {
    const players = makePlayers(4);
    const states = createAllianceStates(
      buildAllianceManifests('twoBalanced', players),
    );
    const state = [...states.values()][0];
    const member = players.find(
      (player) => player.id === state.members[0].playerId,
    )!;
    try {
      depositToTreasury(state, member, member.gold + 1, 1);
      throw new Error('expected SimulationConfigError for insufficient gold');
    } catch (error) {
      if (!(error instanceof SimulationConfigError)) throw error;
      expect(error.code).toBe('alliance-deposit-insufficient-gold');
    }
  });

  it('rejects a non-positive deposit amount', () => {
    const players = makePlayers(4);
    const states = createAllianceStates(
      buildAllianceManifests('twoBalanced', players),
    );
    const state = [...states.values()][0];
    const member = players.find(
      (player) => player.id === state.members[0].playerId,
    )!;
    try {
      depositToTreasury(state, member, 0, 1);
      throw new Error('expected SimulationConfigError for zero deposit');
    } catch (error) {
      if (!(error instanceof SimulationConfigError)) throw error;
      expect(error.code).toBe('alliance-deposit-non-positive');
    }
  });

  it('records treasury log entries for audit', () => {
    const players = makePlayers(4);
    const states = createAllianceStates(
      buildAllianceManifests('twoBalanced', players),
    );
    const state = [...states.values()][0];
    const member = players.find(
      (player) => player.id === state.members[0].playerId,
    )!;
    depositToTreasury(state, member, 10_000, 3);
    expect(state.treasuryLog).toHaveLength(1);
    const entry: AllianceTreasuryRecord = state.treasuryLog[0];
    expect(entry.kind).toBe('deposit');
    expect(entry.day).toBe(3);
    expect(entry.actorId).toBe(member.id);
    expect(entry.treasuryBefore).toBe(0);
    expect(entry.treasuryAfter).toBe(10_000);
  });
});

describe('authorizeTreasuryAid - leader-only enforcement', () => {
  it('throws when a non-leader attempts to authorize aid', () => {
    const players = makePlayers(4);
    const states = createAllianceStates(
      buildAllianceManifests('twoBalanced', players),
    );
    const state = [...states.values()][0];
    const leader = players.find((p) => p.id === state.leaderId)!;
    const nonLeaderMember = state.members.find((seat) => !seat.isLeader)!;
    const nonLeader = players.find((p) => p.id === nonLeaderMember.playerId)!;
    const recipient = nonLeader;

    depositToTreasury(state, leader, 50_000, 1);
    try {
      authorizeTreasuryAid(state, nonLeader, recipient, 1_000, 1, 100_000);
      throw new Error('expected SimulationConfigError for non-leader aid');
    } catch (error) {
      if (!(error instanceof SimulationConfigError)) throw error;
      expect(error.code).toBe('alliance-aid-not-leader');
    }
  });

  it('throws when the recipient is not a member', () => {
    const players = makePlayers(4);
    const states = createAllianceStates(
      buildAllianceManifests('twoBalanced', players),
    );
    const state = [...states.values()][0];
    const leader = players.find((p) => p.id === state.leaderId)!;
    const outsider = makePlayer('outsider');
    depositToTreasury(state, leader, 50_000, 1);
    try {
      authorizeTreasuryAid(state, leader, outsider, 1_000, 1, 100_000);
      throw new Error(
        'expected SimulationConfigError for non-member recipient',
      );
    } catch (error) {
      if (!(error instanceof SimulationConfigError)) throw error;
      expect(error.code).toBe('alliance-aid-recipient-non-member');
    }
  });
});

describe('authorizeTreasuryAid - caps', () => {
  it('caps aid at min(10% treasury, 25% trailing-7d income)', () => {
    const players = makePlayers(4);
    const states = createAllianceStates(
      buildAllianceManifests('twoBalanced', players),
    );
    const state = [...states.values()][0];
    const leader = players.find((p) => p.id === state.leaderId)!;
    const recipientSeat = state.members.find((seat) => !seat.isLeader)!;
    const recipient = players.find((p) => p.id === recipientSeat.playerId)!;

    depositToTreasury(state, leader, 100_000, 1);
    // treasury 100k => 10% cap = 10_000; income 20k => 25% cap = 5_000.
    const trailingIncome = 20_000;
    const expectedCap = Math.min(
      Math.floor(100_000 * ALLIANCE_AID_TREASURY_FRACTION),
      Math.floor(trailingIncome * ALLIANCE_AID_INCOME_FRACTION),
    );
    expect(expectedCap).toBe(5_000);

    const record = authorizeTreasuryAid(
      state,
      leader,
      recipient,
      50_000,
      1,
      trailingIncome,
    );
    expect(record).not.toBeNull();
    expect(record!.amount).toBe(5_000);
    expect(record!.kind).toBe('aid');
  });

  it('treasury fraction binds when it is the smaller cap', () => {
    const players = makePlayers(4);
    const states = createAllianceStates(
      buildAllianceManifests('twoBalanced', players),
    );
    const state = [...states.values()][0];
    const leader = players.find((p) => p.id === state.leaderId)!;
    const recipientSeat = state.members.find((seat) => !seat.isLeader)!;
    const recipient = players.find((p) => p.id === recipientSeat.playerId)!;

    depositToTreasury(state, leader, 10_000, 1);
    // treasury 10k => 10% = 1_000; income 1_000_000 => 25% = 250_000.
    const record = authorizeTreasuryAid(
      state,
      leader,
      recipient,
      50_000,
      1,
      1_000_000,
    );
    expect(record!.amount).toBe(1_000);
  });

  it('returns null when the recipient was already aided today', () => {
    const players = makePlayers(4);
    const states = createAllianceStates(
      buildAllianceManifests('twoBalanced', players),
    );
    const state = [...states.values()][0];
    const leader = players.find((p) => p.id === state.leaderId)!;
    const recipientSeat = state.members.find((seat) => !seat.isLeader)!;
    const recipient = players.find((p) => p.id === recipientSeat.playerId)!;

    depositToTreasury(state, leader, 80_000, 1);
    const first = authorizeTreasuryAid(
      state,
      leader,
      recipient,
      1_000,
      1,
      1_000_000,
    );
    const second = authorizeTreasuryAid(
      state,
      leader,
      recipient,
      1_000,
      1,
      1_000_000,
    );
    expect(first).not.toBeNull();
    expect(second).toBeNull();
  });

  it('allows a fresh aid on the next day', () => {
    const players = makePlayers(4);
    const states = createAllianceStates(
      buildAllianceManifests('twoBalanced', players),
    );
    const state = [...states.values()][0];
    const leader = players.find((p) => p.id === state.leaderId)!;
    const recipientSeat = state.members.find((seat) => !seat.isLeader)!;
    const recipient = players.find((p) => p.id === recipientSeat.playerId)!;

    depositToTreasury(state, leader, 80_000, 1);
    const day1 = authorizeTreasuryAid(
      state,
      leader,
      recipient,
      1_000,
      1,
      1_000_000,
    );
    const day2 = authorizeTreasuryAid(
      state,
      leader,
      recipient,
      1_000,
      2,
      1_000_000,
    );
    expect(day1).not.toBeNull();
    expect(day2).not.toBeNull();
    expect(day2!.day).toBe(2);
  });

  it('returns null when the income cap is zero', () => {
    const players = makePlayers(4);
    const states = createAllianceStates(
      buildAllianceManifests('twoBalanced', players),
    );
    const state = [...states.values()][0];
    const leader = players.find((p) => p.id === state.leaderId)!;
    const recipientSeat = state.members.find((seat) => !seat.isLeader)!;
    const recipient = players.find((p) => p.id === recipientSeat.playerId)!;
    depositToTreasury(state, leader, 80_000, 1);
    const record = authorizeTreasuryAid(state, leader, recipient, 1_000, 1, 0);
    expect(record).toBeNull();
  });
});

describe('authorizeTreasuryAid - conservation', () => {
  it('conserves treasury + recipient gold across deposit + aid', () => {
    const players = makePlayers(4);
    const states = createAllianceStates(
      buildAllianceManifests('twoBalanced', players),
    );
    const state = [...states.values()][0];
    const leader = players.find((p) => p.id === state.leaderId)!;
    const recipientSeat = state.members.find((seat) => !seat.isLeader)!;
    const recipient = players.find((p) => p.id === recipientSeat.playerId)!;
    const members = toMap(players);

    const baseline = state.treasury + recipient.gold;
    depositToTreasury(state, leader, 80_000, 1);
    const afterDeposit = state.treasury + recipient.gold;
    expect(afterDeposit - baseline).toBe(80_000);

    const record = authorizeTreasuryAid(
      state,
      leader,
      recipient,
      10_000,
      1,
      1_000_000,
    );
    expect(record).not.toBeNull();
    const afterAid = state.treasury + recipient.gold;
    expect(afterAid).toBe(afterDeposit);
    expect(record!.treasuryBefore - record!.treasuryAfter).toBe(record!.amount);
    expect(record!.recipientGoldAfter - record!.recipientGoldBefore).toBe(
      record!.amount,
    );

    const final = allianceGoldTotal(state, members);
    expect(final.total).toBe(DEFAULT_GOLD * 2);
  });

  it('the aid record captures full before/after conservation evidence', () => {
    const players = makePlayers(4);
    const states = createAllianceStates(
      buildAllianceManifests('twoBalanced', players),
    );
    const state = [...states.values()][0];
    const leader = players.find((p) => p.id === state.leaderId)!;
    const recipientSeat = state.members.find((seat) => !seat.isLeader)!;
    const recipient = players.find((p) => p.id === recipientSeat.playerId)!;

    depositToTreasury(state, leader, 100_000, 5);
    const record = authorizeTreasuryAid(
      state,
      leader,
      recipient,
      5_000,
      5,
      1_000_000,
    );
    expect(record!.treasuryBefore - record!.treasuryAfter).toBe(record!.amount);
    expect(record!.recipientGoldAfter - record!.recipientGoldBefore).toBe(
      record!.amount,
    );
    expect(record!.actorId).toBe(leader.id);
    expect(record!.recipientId).toBe(recipient.id);
  });
});

describe('estimateTrailing7dIncome', () => {
  it('returns a non-negative safe integer derived from per-tick income', () => {
    const player = makePlayer('p', 10, 0);
    const income = estimateTrailing7dIncome(player);
    expect(Number.isSafeInteger(income)).toBe(true);
    expect(income).toBeGreaterThanOrEqual(0);
  });

  it('rejects a non-positive ticksPerDay', () => {
    try {
      estimateTrailing7dIncome(makePlayer('p'), 0);
      throw new Error('expected SimulationConfigError for ticksPerDay=0');
    } catch (error) {
      if (!(error instanceof SimulationConfigError)) throw error;
      expect(error.code).toBe('alliance-ticks-per-day-invalid');
    }
  });
});

describe('isIntelFresh', () => {
  it('treats same-day and age-1 intel as fresh', () => {
    expect(isIntelFresh(freshIntel(10), 10)).toBe(true);
    expect(isIntelFresh(freshIntel(9), 10)).toBe(true);
  });

  it('excludes age-2 and older intel', () => {
    expect(isIntelFresh(freshIntel(8), 10)).toBe(false);
    expect(isIntelFresh(freshIntel(5), 10)).toBe(false);
  });

  it('excludes failed intel and undefined', () => {
    const failed = freshIntel(10);
    failed.success = false;
    expect(isIntelFresh(failed, 10)).toBe(false);
    expect(isIntelFresh(undefined, 10)).toBe(false);
  });
});

describe('shareFreshIntel - fresh vs stale', () => {
  it('delivers fresh intel to the other members and copies into their caches', () => {
    const players = makePlayers(3);
    const states = createAllianceStates(
      buildAllianceManifests('focusFive', players),
    );
    const state = [...states.values()][0];
    const members = toMap(players);
    const sharerId = state.members[0].playerId;
    const intel = freshIntel(7);

    const shares = shareFreshIntel(
      state,
      sharerId,
      'target_99',
      intel,
      7,
      members,
    );
    expect(shares).toHaveLength(2);
    for (const share of shares) {
      expect(share.sharerId).toBe(sharerId);
      expect(share.targetId).toBe('target_99');
      expect(share.intelDay).toBe(7);
      const recipient = members.get(share.memberId)!;
      expect(recipient.intelCache.get('target_99')).toBe(intel);
    }
    expect(state.intelShares).toHaveLength(2);
  });

  it('excludes stale intel entirely (no records, no cache writes)', () => {
    const players = makePlayers(3);
    const states = createAllianceStates(
      buildAllianceManifests('focusFive', players),
    );
    const state = [...states.values()][0];
    const members = toMap(players);
    const sharerId = state.members[0].playerId;
    const stale = freshIntel(3);

    const shares = shareFreshIntel(
      state,
      sharerId,
      'target_99',
      stale,
      10,
      members,
    );
    expect(shares).toHaveLength(0);
    expect(state.intelShares).toHaveLength(0);
    for (const member of state.memberIds) {
      expect(members.get(member)?.intelCache.has('target_99')).toBe(false);
    }
  });

  it('does not clobber equal-or-fresher successful intel the recipient holds', () => {
    const players = makePlayers(3);
    const states = createAllianceStates(
      buildAllianceManifests('focusFive', players),
    );
    const state = [...states.values()][0];
    const members = toMap(players);
    const sharerId = state.members[0].playerId;
    const recipients = state.members
      .map((seat) => seat.playerId)
      .filter((id) => id !== sharerId);
    const newer = freshIntel(8);
    members.get(recipients[0])!.intelCache.set('target_99', newer);

    const older = freshIntel(7);
    const shares = shareFreshIntel(
      state,
      sharerId,
      'target_99',
      older,
      8,
      members,
    );
    const delivered = shares.map((share) => share.memberId);
    expect(delivered).not.toContain(recipients[0]);
    expect(members.get(recipients[0])!.intelCache.get('target_99')).toBe(newer);
  });

  it('rejects a non-member sharer', () => {
    const players = makePlayers(3);
    const states = createAllianceStates(
      buildAllianceManifests('focusFive', players),
    );
    const state = [...states.values()][0];
    const outsider = makePlayer('outsider');
    try {
      shareFreshIntel(
        state,
        'outsider',
        't',
        freshIntel(1),
        1,
        toMap([outsider]),
      );
      throw new Error('expected SimulationConfigError for non-member sharer');
    } catch (error) {
      if (!(error instanceof SimulationConfigError)) throw error;
      expect(error.code).toBe('alliance-intel-sharer-non-member');
    }
  });
});

describe('nominateFocusTarget', () => {
  it('records a deterministic attacker order when none is supplied', () => {
    const players = makePlayers(3);
    const states = createAllianceStates(
      buildAllianceManifests('focusFive', players),
    );
    const state = [...states.values()][0];
    const nomination = nominateFocusTarget(state, 'target_1', undefined, 4);
    expect(nomination.targetId).toBe('target_1');
    expect(nomination.nominatedOnDay).toBe(4);
    expect(nomination.attackerOrder).toEqual(defaultAttackerOrder(state));
    expect(state.nominations).toHaveLength(1);
  });

  it('rejects nominating an alliance member as the focus target', () => {
    const players = makePlayers(3);
    const states = createAllianceStates(
      buildAllianceManifests('focusFive', players),
    );
    const state = [...states.values()][0];
    const memberId = state.members[0].playerId;
    try {
      nominateFocusTarget(state, memberId, undefined, 1);
      throw new Error('expected SimulationConfigError for nominating an ally');
    } catch (error) {
      if (!(error instanceof SimulationConfigError)) throw error;
      expect(error.code).toBe('alliance-nominate-ally');
    }
  });

  it('rejects an attacker order containing a non-member', () => {
    const players = makePlayers(3);
    const states = createAllianceStates(
      buildAllianceManifests('focusFive', players),
    );
    const state = [...states.values()][0];
    try {
      nominateFocusTarget(
        state,
        'target_1',
        ['outsider', ...state.memberIds],
        1,
      );
      throw new Error('expected SimulationConfigError for non-member attacker');
    } catch (error) {
      if (!(error instanceof SimulationConfigError)) throw error;
      expect(error.code).toBe('alliance-nominate-non-member-attacker');
    }
  });
});

describe('planCoordinatedAttack - legal focus ordering', () => {
  function setupFocusFive() {
    const attackers = makePlayers(5, 'attacker', DEFAULT_LEVEL);
    const target = makePlayer('target_99', DEFAULT_LEVEL, 200_000);
    const population = [...attackers, target];
    const states = createAllianceStates(
      buildAllianceManifests('focusFive', attackers),
    );
    const state = [...states.values()][0];
    return { attackers, target, population, state };
  }

  function ctx(population: PlayerState[], day = 1): CoordinatedAttackContext {
    return {
      players: toMap(population),
      currentTick: 100,
      windowTicks: 48,
      currentDay: day,
    };
  }

  it('emits one eligible order per attacker in nomination order', () => {
    const { target, population, state } = setupFocusFive();
    const nomination = nominateFocusTarget(state, target.id, undefined, 1);
    const plan = planCoordinatedAttack(state, nomination, ctx(population));

    expect(plan.legalOrders).toHaveLength(5);
    expect(plan.orders).toHaveLength(5);
    expect(plan.targetId).toBe(target.id);
    const expectedOrder = defaultAttackerOrder(state);
    expect(plan.legalOrders.map((order) => order.attackerId)).toEqual(
      expectedOrder,
    );
    for (const order of plan.legalOrders) {
      expect(order.eligible).toBe(true);
      expect(order.reason).toBe('eligible');
      expect(order.pairAttackCountInWindow).toBe(0);
    }
  });

  it('preserves the explicit attacker order supplied at nomination', () => {
    const { attackers, target, population, state } = setupFocusFive();
    const explicit = [...state.memberIds].sort().reverse();
    const nomination = nominateFocusTarget(state, target.id, explicit, 1);
    const plan = planCoordinatedAttack(state, nomination, ctx(population));
    expect(plan.legalOrders.map((order) => order.orderIndex)).toEqual([
      0, 1, 2, 3, 4,
    ]);
    expect(plan.legalOrders.map((order) => order.attackerId)).toEqual(explicit);
    expect(attackers.length).toBe(5);
  });

  it('records the plan onto the alliance state', () => {
    const { target, population, state } = setupFocusFive();
    const nomination = nominateFocusTarget(state, target.id, undefined, 1);
    planCoordinatedAttack(state, nomination, ctx(population, 7));
    expect(state.attackPlans).toHaveLength(1);
    expect(state.attackPlans[0].plannedOnDay).toBe(7);
  });
});

describe('planCoordinatedAttack - pair limit (five per pair per 24h)', () => {
  it('marks an attacker at the pair cap as pair-limit-reached', () => {
    const attackers = makePlayers(1, 'attacker');
    const target = makePlayer('target_99');
    const population = [...attackers, target];
    const states = createAllianceStates(
      buildAllianceManifests('focusFive', attackers),
    );
    const realState = [...states.values()][0];
    // Pre-log five attacks within the rolling window (currentTick=100, window=48).
    const attacker = attackers[0];
    attacker.attackHistory.set(target.id, [96, 97, 98, 99, 100]);
    const nomination = nominateFocusTarget(realState, target.id, undefined, 1);
    const plan = planCoordinatedAttack(realState, nomination, {
      players: toMap(population),
      currentTick: 100,
      windowTicks: 48,
      currentDay: 1,
    });
    expect(plan.legalOrders).toHaveLength(0);
    expect(plan.orders[0].reason).toBe('pair-limit-reached');
    expect(plan.orders[0].pairAttackCountInWindow).toBe(5);
  });

  it('countAttacksInWindow ignores history outside the rolling window', () => {
    const attacker = makePlayer('a');
    const defenderId = 'target_99';
    attacker.attackHistory.set(defenderId, [10, 11, 12]);
    // currentTick=100, windowTicks=48 => minTick=53; 10/11/12 are all older.
    expect(countAttacksInWindow(attacker, defenderId, 100, 48)).toBe(0);
    attacker.attackHistory.set(defenderId, [60, 90, 100]);
    expect(countAttacksInWindow(attacker, defenderId, 100, 48)).toBe(3);
  });

  it('allows up to (but not including) ALLIANCE_MAX_ATTACKS_PER_PAIR_24H', () => {
    const attackers = makePlayers(1, 'attacker');
    const target = makePlayer('target_99');
    const population = [...attackers, target];
    const states = createAllianceStates(
      buildAllianceManifests('focusFive', attackers),
    );
    const state = [...states.values()][0];
    const attacker = attackers[0];
    const recent: number[] = [];
    for (let i = 0; i < ALLIANCE_MAX_ATTACKS_PER_PAIR_24H - 1; i++) {
      recent.push(90 + i);
    }
    attacker.attackHistory.set(target.id, recent);
    const nomination = nominateFocusTarget(state, target.id, undefined, 1);
    const plan = planCoordinatedAttack(state, nomination, {
      players: toMap(population),
      currentTick: 100,
      windowTicks: 48,
      currentDay: 1,
    });
    expect(plan.legalOrders).toHaveLength(1);
    expect(plan.orders[0].pairAttackCountInWindow).toBe(
      ALLIANCE_MAX_ATTACKS_PER_PAIR_24H - 1,
    );
  });
});

describe('planCoordinatedAttack - no attacks on protected / ineligible / ally', () => {
  function planAgainst(target: PlayerState, attackers: PlayerState[]) {
    const population = [...attackers, target];
    const states = createAllianceStates(
      buildAllianceManifests('focusFive', attackers),
    );
    const state = [...states.values()][0];
    const nomination = nominateFocusTarget(state, target.id, undefined, 1);
    return planCoordinatedAttack(state, nomination, {
      players: toMap(population),
      currentTick: 100,
      windowTicks: 48,
      currentDay: 1,
    });
  }

  it('produces no legal orders against a protected low-level target', () => {
    const attackers = makePlayers(5, 'attacker', DEFAULT_LEVEL);
    const protectedTarget = makePlayer(
      'target_low',
      ALLIANCE_PROTECTED_MAX_LEVEL,
    );
    const plan = planAgainst(protectedTarget, attackers);
    expect(plan.legalOrders).toHaveLength(0);
    expect(plan.orders.every((order) => order.reason === 'protected')).toBe(
      true,
    );
  });

  it('produces no legal orders against an out-of-level-range target', () => {
    const attackers = makePlayers(5, 'attacker', DEFAULT_LEVEL);
    const farTarget = makePlayer(
      'target_far',
      DEFAULT_LEVEL + ALLIANCE_ATTACK_LEVEL_RANGE + 1,
    );
    const plan = planAgainst(farTarget, attackers);
    expect(plan.legalOrders).toHaveLength(0);
    expect(
      plan.orders.every((order) => order.reason === 'out-of-level-range'),
    ).toBe(true);
  });

  it('marks attackers with no attack turns as insufficient-turns', () => {
    const attackers = makePlayers(2, 'attacker', DEFAULT_LEVEL);
    attackers[0].attackTurns = 0;
    const target = makePlayer('target_99', DEFAULT_LEVEL);
    const plan = planAgainst(target, attackers);
    const zeroTurn = plan.orders.find(
      (order) => order.attackerId === attackers[0].id,
    );
    expect(zeroTurn?.reason).toBe('insufficient-turns');
    expect(plan.legalOrders.map((order) => order.attackerId)).toEqual([
      attackers[1].id,
    ]);
  });

  it('marks attackers with no stamina as insufficient-stamina', () => {
    const attackers = makePlayers(2, 'attacker', DEFAULT_LEVEL);
    attackers[0].stamina = 0;
    const target = makePlayer('target_99', DEFAULT_LEVEL);
    const plan = planAgainst(target, attackers);
    const zeroStam = plan.orders.find(
      (order) => order.attackerId === attackers[0].id,
    );
    expect(zeroStam?.reason).toBe('insufficient-stamina');
  });

  it('marks every order as ally when the target is a co-member', () => {
    const attackers = makePlayers(5, 'attacker', DEFAULT_LEVEL);
    const population = [...attackers];
    const states = createAllianceStates(
      buildAllianceManifests('focusFive', attackers),
    );
    const state = [...states.values()][0];
    const memberTargetId = state.members[0].playerId;
    const nomination: AllianceFocusFireNomination = {
      nominatedOnDay: 1,
      targetId: memberTargetId,
      attackerOrder: defaultAttackerOrder(state),
    };
    const plan = planCoordinatedAttack(state, nomination, {
      players: toMap(population),
      currentTick: 100,
      windowTicks: 48,
      currentDay: 1,
    });
    expect(plan.legalOrders).toHaveLength(0);
    // The member-target also appears in the attacker order, so the order where
    // attacker === target resolves to 'self'; every other order is 'ally'.
    expect(
      plan.orders.every(
        (order) => order.reason === 'ally' || order.reason === 'self',
      ),
    ).toBe(true);
    const selfOrder = plan.orders.find((order) => order.reason === 'self');
    expect(selfOrder?.attackerId).toBe(memberTargetId);
  });

  it('marks a missing attacker as attacker-missing', () => {
    const attackers = makePlayers(2, 'attacker', DEFAULT_LEVEL);
    const target = makePlayer('target_99', DEFAULT_LEVEL);
    const states = createAllianceStates(
      buildAllianceManifests('focusFive', attackers),
    );
    const state = [...states.values()][0];
    const nomination: AllianceFocusFireNomination = {
      nominatedOnDay: 1,
      targetId: target.id,
      attackerOrder: [
        'ghost_who_is_not_in_population',
        ...defaultAttackerOrder(state),
      ],
    };
    const plan = planCoordinatedAttack(state, nomination, {
      players: toMap([...attackers, target]),
      currentTick: 100,
      windowTicks: 48,
      currentDay: 1,
    });
    expect(plan.orders[0].reason).toBe('attacker-missing');
    expect(plan.legalOrders).toHaveLength(2);
  });

  it('honors a disabled protectedMaxLevel (null) so a low-level target is legal', () => {
    const attackers = makePlayers(5, 'attacker', DEFAULT_LEVEL);
    const lowTarget = makePlayer('target_low', 5);
    const population = [...attackers, lowTarget];
    const states = createAllianceStates(
      buildAllianceManifests('focusFive', attackers),
    );
    const state = [...states.values()][0];
    const nomination = nominateFocusTarget(state, lowTarget.id, undefined, 1);
    const plan = planCoordinatedAttack(state, nomination, {
      players: toMap(population),
      currentTick: 100,
      windowTicks: 48,
      currentDay: 1,
      protectedMaxLevel: null,
    });
    expect(plan.legalOrders.length).toBe(5);
  });
});

describe('isWithinLevelRange', () => {
  it('mirrors the symmetric BattleUser.canAttack range', () => {
    expect(isWithinLevelRange(10, 10)).toBe(true);
    expect(isWithinLevelRange(5, 10)).toBe(true);
    expect(isWithinLevelRange(15, 10)).toBe(true);
    expect(isWithinLevelRange(4, 10)).toBe(false);
    expect(isWithinLevelRange(16, 10)).toBe(false);
  });
});

describe('recordRetaliation', () => {
  it('records an aggression against a member', () => {
    const players = makePlayers(3);
    const states = createAllianceStates(
      buildAllianceManifests('focusFive', players),
    );
    const state = [...states.values()][0];
    const memberId = state.members[0].playerId;
    const record = recordRetaliation(state, memberId, 'aggressor_1', 9);
    expect(record.day).toBe(9);
    expect(record.memberId).toBe(memberId);
    expect(record.aggressorId).toBe('aggressor_1');
    expect(record.allianceId).toBe(state.allianceId);
    expect(state.retaliationRecords).toHaveLength(1);
  });

  it('rejects a non-member "victim"', () => {
    const players = makePlayers(3);
    const states = createAllianceStates(
      buildAllianceManifests('focusFive', players),
    );
    const state = [...states.values()][0];
    try {
      recordRetaliation(state, 'outsider', 'aggressor_1', 1);
      throw new Error('expected SimulationConfigError for non-member victim');
    } catch (error) {
      if (!(error instanceof SimulationConfigError)) throw error;
      expect(error.code).toBe('alliance-retaliation-non-member');
    }
  });
});

describe('safe-integer invariants fail fast', () => {
  it('deposit throws SimulationInvariantError when treasury overflows MAX_SAFE_INTEGER', () => {
    const players = makePlayers(4);
    const states = createAllianceStates(
      buildAllianceManifests('twoBalanced', players),
    );
    const state = [...states.values()][0];
    const leader = players.find((p) => p.id === state.leaderId)!;
    // Pre-load the treasury near the safe-integer ceiling so a small deposit
    // pushes it past MAX_SAFE_INTEGER. Member hand gold stays in range.
    state.treasury = Number.MAX_SAFE_INTEGER - 100;
    leader.gold = 1_000;
    try {
      depositToTreasury(state, leader, 200, 1);
      throw new Error(
        'expected SimulationInvariantError for treasury overflow',
      );
    } catch (error) {
      if (!(error instanceof SimulationInvariantError)) throw error;
      expect(error.reason).toBe('unsafe-integer');
      expect(error.field).toBe('treasury');
    }
  });

  it('deposit throws SimulationInvariantError for a fractional amount', () => {
    const players = makePlayers(4);
    const states = createAllianceStates(
      buildAllianceManifests('twoBalanced', players),
    );
    const state = [...states.values()][0];
    const leader = players.find((p) => p.id === state.leaderId)!;
    try {
      depositToTreasury(state, leader, 10.5, 1);
      throw new Error(
        'expected SimulationInvariantError for fractional amount',
      );
    } catch (error) {
      if (!(error instanceof SimulationInvariantError)) throw error;
      expect(error.reason).toBe('fractional');
    }
  });

  it('deposit throws SimulationInvariantError for a negative amount', () => {
    const players = makePlayers(4);
    const states = createAllianceStates(
      buildAllianceManifests('twoBalanced', players),
    );
    const state = [...states.values()][0];
    const leader = players.find((p) => p.id === state.leaderId)!;
    try {
      depositToTreasury(state, leader, -500, 1);
      throw new Error('expected SimulationInvariantError for negative amount');
    } catch (error) {
      if (!(error instanceof SimulationInvariantError)) throw error;
      expect(error.reason).toBe('negative');
    }
  });

  it('aid throws SimulationInvariantError when recipient gold overflows', () => {
    const players = makePlayers(4);
    const states = createAllianceStates(
      buildAllianceManifests('twoBalanced', players),
    );
    const state = [...states.values()][0];
    const leader = players.find((p) => p.id === state.leaderId)!;
    const recipientSeat = state.members.find((seat) => !seat.isLeader)!;
    const recipient = players.find((p) => p.id === recipientSeat.playerId)!;
    recipient.gold = Number.MAX_SAFE_INTEGER;
    // A modest treasury is enough: the income cap is huge (trailing income
    // MAX_SAFE_INTEGER), so the 10% treasury cap binds and any positive aid
    // pushes recipient gold past the safe-integer ceiling.
    depositToTreasury(state, leader, 80_000, 1);
    try {
      authorizeTreasuryAid(
        state,
        leader,
        recipient,
        Number.MAX_SAFE_INTEGER,
        1,
        Number.MAX_SAFE_INTEGER,
      );
      throw new Error(
        'expected SimulationInvariantError for recipient overflow',
      );
    } catch (error) {
      if (!(error instanceof SimulationInvariantError)) throw error;
      expect(error.reason).toBe('unsafe-integer');
    }
  });

  it('DOMINANT_SPLIT_FRACTION and FOCUS_FIVE_ALLIANCE_SIZE keep documented values', () => {
    expect(DOMINANT_SPLIT_FRACTION).toBe(0.6);
    expect(FOCUS_FIVE_ALLIANCE_SIZE).toBe(5);
    expect(ALLIANCE_ATTACK_LEVEL_RANGE).toBe(5);
    expect(ALLIANCE_MAX_ATTACKS_PER_PAIR_24H).toBe(5);
    expect(ALLIANCE_PROTECTED_MAX_LEVEL).toBe(9);
  });
});
