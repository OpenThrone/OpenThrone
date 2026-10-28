import { describe, expect, it, vi } from 'bun:test';
import { installMockPrisma } from 'test/utils/mockPrisma';

// Redaction is pure; the prisma mock only keeps the import side-effect free.
installMockPrisma(vi);
const { redactAttackLogForViewer, redactRetestForViewer } =
  await import('@/services/AttackLogAccess.service');

// Synthetic battle data shaped like AttackService/SpyService logs.
const ATTACKER_ID = 1;
const DEFENDER_ID = 2;

const attackLog = () => ({
  id: 100,
  type: 'attack',
  timestamp: new Date('2026-10-01T00:00:00Z'),
  winner: ATTACKER_ID,
  attacker_id: ATTACKER_ID,
  defender_id: DEFENDER_ID,
  pillaged_gold: 500n,
  acl: [{ shared_with_user_id: 9, shared_with_alliance_id: null }],
  attackerPlayer: {
    id: ATTACKER_ID,
    display_name: 'synthetic-a',
    avatar: 'SHIELD',
    race: 'ELF',
    experience: 10,
    email: 'not-returned@example.invalid',
  },
  defenderPlayer: {
    id: DEFENDER_ID,
    display_name: 'synthetic-d',
    avatar: 'SHIELD',
    race: 'HUMAN',
    experience: 20,
  },
  stats: {
    startOfAttack: {
      Attacker: {
        experience: 10,
        units: [
          { type: 'OFFENSE', level: 1, quantity: 30 },
          { type: 'OFFENSE', level: 2, quantity: 12 },
        ],
      },
      Defender: { experience: 20 },
    },
    replay: { defender: { gold: '999999', units: [] }, seal: 'secret' },
    endTurns: 40,
    turns: 10,
    attackerDamageDealt: 1234,
    defenderDamageDealt: 56,
    defensePointsAtEnd: 77777,
    pillagedGold: '500',
    forthpAtStart: 1000,
    forthpAtEnd: 900,
    xpEarned: JSON.stringify({ attacker: 15, defender: 5, secret: 1 }),
    attacker_units: JSON.stringify([
      { type: 'OFFENSE', level: 1, quantity: 25 },
    ]),
    defender_units: JSON.stringify([
      { type: 'DEFENSE', level: 1, quantity: 4000 },
    ]),
    attacker_mercenaries: JSON.stringify([]),
    defender_mercenaries: JSON.stringify([
      { type: 'SENTRY', level: 3, quantity: 300 },
    ]),
    attacker_losses: JSON.stringify({
      total: 5,
      units: [{ type: 'OFFENSE', level: 1, quantity: 5 }],
    }),
    defender_losses: JSON.stringify({
      total: 40,
      units: [{ type: 'DEFENSE', level: 1, quantity: 40 }],
    }),
    defender_daily_gold_remaining: '123456',
    battle_contributions: { defender: { defense: 5 } },
  },
});

const FORBIDDEN_STAT_KEYS = [
  'replay',
  'defender_units',
  'defender_mercenaries',
  'attacker_units',
  'attacker_mercenaries',
  'defensePointsAtEnd',
  'defender_daily_gold_remaining',
  'battle_contributions',
  'endTurns',
];

describe('redactAttackLogForViewer: attack reports', () => {
  it('keeps admin before/after snapshots out of every player-facing report', () => {
    const log = attackLog();
    Object.assign(log.stats, {
      adminSnapshots: {
        version: 1,
        before: { defender: { gold: 'ADMIN_ONLY_BALANCE' } },
      },
    });
    for (const role of ['attacker', 'defender', 'shared'] as const) {
      const report = redactAttackLogForViewer(log, role);
      expect(report.stats).not.toHaveProperty('adminSnapshots');
      expect(JSON.stringify(report)).not.toContain('ADMIN_ONLY_BALANCE');
    }
  });
  it('never returns defender rosters, defense points, replay or ACL to any role', () => {
    for (const role of ['attacker', 'defender', 'shared'] as const) {
      const out = redactAttackLogForViewer(attackLog(), role);
      for (const key of FORBIDDEN_STAT_KEYS) {
        expect(out.stats).not.toHaveProperty(key);
      }
      expect(out).not.toHaveProperty('acl');
      expect(out).not.toHaveProperty('pillaged_gold');
      expect(out.attackerPlayer).not.toHaveProperty('email');
      const serialized = JSON.stringify(out);
      expect(serialized).not.toContain('4000');
      expect(serialized).not.toContain('77777');
      expect(serialized).not.toContain('secret');
    }
  });

  it('gives a shared viewer exactly what the report shows', () => {
    const out = redactAttackLogForViewer(attackLog(), 'shared');
    expect(out).toEqual({
      id: 100,
      type: 'attack',
      timestamp: '2026-10-01T00:00:00.000Z',
      winner: ATTACKER_ID,
      attacker_id: ATTACKER_ID,
      defender_id: DEFENDER_ID,
      attackerPlayer: {
        id: ATTACKER_ID,
        display_name: 'synthetic-a',
        avatar: 'SHIELD',
        race: 'ELF',
        experience: 10,
      },
      defenderPlayer: {
        id: DEFENDER_ID,
        display_name: 'synthetic-d',
        avatar: 'SHIELD',
        race: 'HUMAN',
        experience: 20,
      },
      stats: {
        startOfAttack: {
          Attacker: {
            experience: 10,
            units: [{ type: 'OFFENSE', level: 0, quantity: 42 }],
          },
          Defender: { experience: 20 },
        },
        attackerDamageDealt: 1234,
        defenderDamageDealt: 56,
        xpEarned: JSON.stringify({ attacker: 15, defender: 5 }),
        pillagedGold: '500',
        fortDamage: 100,
        defender_fatigue_percent: 0,
        // Dungeon captives (#210); legacy rows have none.
        captives_taken: 0,
        attacker_losses: { total: 5 },
        defender_losses: { total: 40 },
        combat_summary: {
          attackerDamageHp: null,
          defenderDamageHp: null,
          attackerWounded: null,
          defenderWounded: null,
          defenderProtected: null,
          fortAbsorbedDamage: null,
        },
      },
    });
  });

  it('adds only own-side detail for the attacker and the defender', () => {
    const asAttacker = redactAttackLogForViewer(attackLog(), 'attacker').stats;
    expect(asAttacker.attacker_losses).toEqual({
      total: 5,
      units: [{ type: 'OFFENSE', level: 1, quantity: 5 }],
    });
    expect(asAttacker.defender_losses).toEqual({ total: 40 });
    expect((asAttacker.startOfAttack as any).Attacker.units).toHaveLength(2);
    expect(asAttacker).not.toHaveProperty('forthpAtStart');
    expect(asAttacker).not.toHaveProperty('forthpAtEnd');

    const asDefender = redactAttackLogForViewer(attackLog(), 'defender').stats;
    expect(asDefender.defender_losses).toEqual({
      total: 40,
      units: [{ type: 'DEFENSE', level: 1, quantity: 40 }],
    });
    expect(asDefender.attacker_losses).toEqual({ total: 5 });
    expect(asDefender.forthpAtStart).toBe(1000);
    expect(asDefender.forthpAtEnd).toBe(900);
    expect(asDefender).not.toHaveProperty('turns');
  });
  it('reports chip damage, deaths and wounds separately for a battle like 23501', () => {
    const log = attackLog();
    Object.assign(log.stats, {
      attackerDamageDealt: 0,
      defenderDamageDealt: 50,
      replay: { formulaVersion: 'combat-v6' },
      mitigation_log: JSON.stringify([
        ...Array.from({ length: 5 }, () => ({
          source: 'ATTACKER',
          rawDamage: 25,
          mitigatedDamage: 1,
          fortSoakMultiplier: 0.5,
          privateField: 'never-return-this',
        })),
        { source: 'DEFENDER', mitigatedDamage: 668 },
      ]),
      wounded: JSON.stringify({
        attacker: [{ type: 'OFFENSE', level: 1, quantity: 1, userId: 1 }],
        defender: [{ type: 'DEFENSE', level: 2, quantity: 2 }],
      }),
    });
    for (const role of ['attacker', 'defender', 'shared'] as const) {
      const { stats } = redactAttackLogForViewer(log, role);
      expect(stats.attacker_losses).toMatchObject({ total: 5 });
      expect(stats.combat_summary).toEqual({
        attackerDamageHp: 5,
        defenderDamageHp: 668,
        attackerWounded:
          role === 'attacker'
            ? { total: 1, units: [{ type: 'OFFENSE', level: 1, quantity: 1 }] }
            : { total: 1 },
        defenderWounded:
          role === 'defender'
            ? { total: 2, units: [{ type: 'DEFENSE', level: 2, quantity: 2 }] }
            : { total: 2 },
        defenderProtected: true,
        fortAbsorbedDamage: true,
      });
      expect(stats).not.toHaveProperty('mitigation_log');
      expect(JSON.stringify(stats)).not.toContain('never-return-this');
    }
  });

  it('shows each side only its own reanimated count (#211)', () => {
    const log = attackLog();
    // Distinct counts: if the redaction ever handed a side the opponent's
    // number, these equalities fail.
    Object.assign(log.stats, {
      reanimated_units: { attacker: 12, defender: 7 },
    });
    const asAttacker = redactAttackLogForViewer(log, 'attacker').stats;
    expect(asAttacker.reanimated_units).toBe(12);
    const asDefender = redactAttackLogForViewer(log, 'defender').stats;
    expect(asDefender.reanimated_units).toBe(7);
    // A shared report (a shared viewer or an anonymous public reader) carries
    // no count at all, so the opponent never learns how many rose.
    const asShared = redactAttackLogForViewer(log, 'shared').stats;
    expect(asShared).not.toHaveProperty('reanimated_units');
    expect(JSON.stringify(asShared)).not.toContain('reanimated_units');
    // Legacy rows predate the stat; both sides simply read zero.
    const legacy = redactAttackLogForViewer(attackLog(), 'attacker').stats;
    expect(legacy.reanimated_units).toBe(0);
  });

  it('distinguishes recorded zero damage and wounds from missing or corrupt data', () => {
    const log = attackLog();
    Object.assign(log.stats, {
      defender_protected: false,
      mitigation_log: [
        { source: 'ATTACKER', mitigatedDamage: 0, fortSoakMultiplier: 1 },
      ],
      wounded: { attacker: [], defender: [] },
    });
    const summary = redactAttackLogForViewer(log, 'shared').stats
      .combat_summary;
    expect(summary).toMatchObject({
      attackerDamageHp: 0,
      defenderDamageHp: null,
      attackerWounded: { total: 0 },
      defenderWounded: { total: 0 },
      defenderProtected: false,
      fortAbsorbedDamage: false,
    });
    Object.assign(log.stats, { mitigation_log: '{broken', wounded: '{broken' });
    expect(
      redactAttackLogForViewer(log, 'shared').stats.combat_summary,
    ).toMatchObject({
      attackerDamageHp: null,
      defenderDamageHp: null,
      attackerWounded: null,
      defenderWounded: null,
    });
  });
});

describe('redactAttackLogForViewer: spy reports', () => {
  const intelLog = () => ({
    id: 101,
    type: 'INTEL',
    timestamp: '2026-10-01T00:00:00.000Z',
    winner: ATTACKER_ID,
    attacker_id: ATTACKER_ID,
    defender_id: DEFENDER_ID,
    stats: {
      replay: { seal: 'secret' },
      spyResults: {
        spiesSent: 5,
        spiesLost: 1,
        success: true,
        turns: 1,
        successProbability: 0.8,
        spyLosses: [{ type: 'SPY', level: 1, quantity: 1, mercenary: false }],
        attackerLevel: 3,
        defenderLevel: 4,
        intelPercentage: 40,
        intelligenceGathered: {
          offense: null,
          defense: 900,
          units: [
            { id: 55, userId: 2, type: 'DEFENSE', level: 1, quantity: 9 },
          ],
          mercenaries: null,
          items: [
            { id: 8, usage: 'DEFENSE', type: 'HELM', level: 1, quantity: 2 },
          ],
          gold: '700',
          goldInBank: null,
          hiddenExtra: 'secret',
        },
      },
    },
  });

  it('keeps gathered intel for a shared viewer but not attacker-only odds or losses', () => {
    const out = redactAttackLogForViewer(intelLog(), 'shared');
    const spy = out.stats.spyResults as any;
    expect(spy.intelligenceGathered.units).toEqual([
      { type: 'DEFENSE', level: 1, quantity: 9 },
    ]);
    expect(spy.intelligenceGathered.items).toEqual([
      { usage: 'DEFENSE', type: 'HELM', level: 1, quantity: 2 },
    ]);
    expect(spy.intelligenceGathered.gold).toBe('700');
    expect(spy.intelligenceGathered).not.toHaveProperty('hiddenExtra');
    expect(spy).not.toHaveProperty('successProbability');
    expect(spy).not.toHaveProperty('spyLosses');
    expect(out.stats).not.toHaveProperty('replay');
    expect(JSON.stringify(out)).not.toContain('secret');
  });

  it('gives the attacker their own spy losses and odds', () => {
    const spy = redactAttackLogForViewer(intelLog(), 'attacker').stats
      .spyResults as any;
    expect(spy.successProbability).toBe(0.8);
    expect(spy.spyLosses).toEqual([{ type: 'SPY', level: 1, quantity: 1 }]);
  });

  it('hides odds from the attacker when the mission failed', () => {
    const log = intelLog();
    log.stats.spyResults.success = false;
    const spy = redactAttackLogForViewer(log, 'attacker').stats
      .spyResults as any;
    expect(spy).not.toHaveProperty('successProbability');
    expect(spy.spyLosses).toEqual([{ type: 'SPY', level: 1, quantity: 1 }]);
  });
});

describe('redactRetestForViewer', () => {
  const attackRetest = () => ({
    replayMode: 'EXACT',
    exactReplay: true,
    formulaVersion: 5,
    originalAttackerArmy: 42,
    originalDefenderArmy: 4321,
    originalAttackerLosses: 5,
    originalDefenderLosses: 40,
    newSimulationAttackerArmy: 37,
    newSimulationDefenderArmy: 4281,
    newSimulationAttackerLossesTotal: 5,
    newSimulationAttackerLossesBreakdown: {
      total: 5,
      units: [{ type: 'OFFENSE', level: 1, quantity: 5 }],
    },
    newSimulationDefenderLossesTotal: 40,
    newSimulationDefenderLossesBreakdown: {
      total: 40,
      units: [{ type: 'DEFENSE', level: 1, quantity: 40 }],
    },
    fortHPAtEnd: 900,
    attackerWon: true,
    strength: { attackerOffense: 1111, defenderDefense: 9876 },
    originalGold: '500',
    newGold: '500',
    canonicalOutcome: { battleStats: { defender: { defense: 9876 } } },
    wounded: {
      attacker: [{ type: 'OFFENSE', level: 1, quantity: 1 }],
      defender: [{ type: 'DEFENSE', level: 1, quantity: 2 }],
    },
    result: { defenderStats: { gold: '999999' } },
  });

  it('hides defender strength and army size from a shared viewer and the attacker', () => {
    for (const role of ['shared', 'attacker'] as const) {
      const out = redactRetestForViewer(attackRetest(), role);
      expect(out).not.toHaveProperty('originalDefenderArmy');
      expect(out).not.toHaveProperty('newSimulationDefenderArmy');
      expect(out).not.toHaveProperty('fortHPAtEnd');
      expect(out).not.toHaveProperty('result');
      expect(out).not.toHaveProperty('canonicalOutcome');
      expect((out.strength as any)?.defenderDefense).toBeUndefined();
      const serialized = JSON.stringify(out);
      expect(serialized).not.toContain('9876');
      expect(serialized).not.toContain('4321');
      expect(serialized).not.toContain('999999');
    }
  });

  it('returns only report-level fields to a shared viewer', () => {
    expect(redactRetestForViewer(attackRetest(), 'shared')).toEqual({
      replayMode: 'EXACT',
      exactReplay: true,
      formulaVersion: 5,
      originalGold: '500',
      attackerWon: true,
      newGold: '500',
      originalAttackerLosses: 5,
      originalDefenderLosses: 40,
      newSimulationAttackerLossesTotal: 5,
      newSimulationDefenderLossesTotal: 40,
    });
  });

  it('returns own-side strength to each party', () => {
    const asAttacker = redactRetestForViewer(attackRetest(), 'attacker');
    expect(asAttacker.strength).toEqual({ attackerOffense: 1111 });
    expect(asAttacker.originalAttackerArmy).toBe(42);
    const asDefender = redactRetestForViewer(attackRetest(), 'defender');
    expect(asDefender.strength).toEqual({ defenderDefense: 9876 });
    expect(asDefender.originalDefenderArmy).toBe(4321);
    expect(asDefender).not.toHaveProperty('originalAttackerArmy');
  });

  it('redacts spy replays with the spy report allowlist', () => {
    const out = redactRetestForViewer(
      {
        replayMode: 'EXACT',
        exactReplay: true,
        formulaVersion: 5,
        originalResult: {
          spiesSent: 2,
          successProbability: 0.4,
          intelPercentage: 10,
          intelligenceGathered: null,
        },
        result: { spiesSent: 2, successProbability: 0.4 },
      },
      'defender',
    );
    expect(out.originalResult).not.toHaveProperty('successProbability');
    expect(out.result).not.toHaveProperty('successProbability');
    expect((out.originalResult as any).spiesSent).toBe(2);
  });
});

describe('defender-only defense advisories', () => {
  it('projects safe breach facts for the defender without leaking them to other readers', () => {
    const log = attackLog();
    Object.assign(log.stats, {
      fort_breached: true,
      defender_losses: JSON.stringify({
        total: 4,
        units: [{ type: 'WORKER', level: 1, quantity: 4 }],
      }),
    });
    const defender = redactAttackLogForViewer(log, 'defender');
    expect(defender.stats.defense_advisory).toEqual({
      fortBreached: true,
      civilianLosses: 4,
      offensiveLosses: 0,
    });
    for (const role of ['attacker', 'shared'] as const) {
      const redacted = redactAttackLogForViewer(log, role);
      expect(redacted.stats).not.toHaveProperty('defense_advisory');
      expect(redacted.stats).not.toHaveProperty('fort_breached');
      expect(redacted.stats.defender_losses).toEqual({ total: 4 });
    }
  });
  it('does not turn absent legacy fort endpoints into a breach', () => {
    const log = attackLog();
    delete (log.stats as Partial<typeof log.stats>).forthpAtStart;
    delete (log.stats as Partial<typeof log.stats>).forthpAtEnd;
    expect(
      redactAttackLogForViewer(log, 'defender').stats.defense_advisory,
    ).toEqual({ fortBreached: null, civilianLosses: 0, offensiveLosses: 0 });
  });
});

describe('recommendation battle facts', () => {
  it('keeps missing casualties unknown and only returns own quality facts', () => {
    const log = attackLog();
    const visible = redactAttackLogForViewer(log, 'attacker');
    expect(visible.stats.recommendation_facts).toBeDefined();
    expect(
      redactAttackLogForViewer(log, 'shared').stats.recommendation_facts,
    ).toBeUndefined();
    expect(
      redactAttackLogForViewer(log, 'defender').stats.recommendation_facts,
    ).toBeUndefined();
    const legacy = redactAttackLogForViewer(
      { ...log, stats: { startOfAttack: log.stats.startOfAttack, turns: 10 } },
      'attacker',
    );
    expect(legacy.stats.recommendation_facts).toMatchObject({
      deaths: null,
      wounded: null,
      enemyDeaths: null,
      damageDealt: null,
    });
  });
});
