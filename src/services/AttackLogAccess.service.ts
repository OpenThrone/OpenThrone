import prisma from '@/lib/prisma';
import type { Prisma } from '@/lib/prisma-exports';
import { withLockedChatRoom } from '@/services/chatRoomGuards';
import { projectDefenseAdvisoryFacts } from '@/utils/defenseAdvisory';
import { getLevelFromXP } from '@/utils/utilities';

/**
 * Who may read an attack log, and what each reader sees.
 *
 * Read access: the attacker, the defender, a user the log was shared with, or a
 * current member of an alliance the log was shared with. Nobody else (staff
 * included). Anyone who may read a log may share it on to a chat room they
 * currently belong to.
 *
 * Redaction is allowlist-based: every field returned is picked explicitly.
 */

export type AttackLogViewerRole = 'attacker' | 'defender' | 'shared';

/** Describes one ACL row as needed for read checks. */
export interface AttackLogAclEntry {
  shared_with_user_id: number | null;
  shared_with_alliance_id: number | null;
}

/** Minimal attack log shape needed for read checks. */
export interface AttackLogAccessSubject {
  id: number;
  attacker_id: number;
  defender_id: number;
  /** When omitted, the ACL is loaded from the database. */
  acl?: AttackLogAclEntry[] | null;
}

/** Prisma select for the ACL fields used by read checks. */
export const ATTACK_LOG_ACL_SELECT = {
  shared_with_user_id: true,
  shared_with_alliance_id: true,
} as const;

const isPositiveId = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

/** Returns the alliance IDs the user currently belongs to. */
export async function getCurrentAllianceIds(userId: number): Promise<number[]> {
  if (!isPositiveId(userId)) return [];
  const memberships = await prisma.alliance_memberships.findMany({
    where: { user_id: userId },
    select: { alliance_id: true },
  });
  return memberships.map((membership) => membership.alliance_id);
}

/**
 * Resolves the viewer's role for an attack log, or null when the viewer may not
 * read it. Alliance shares require current membership of that alliance; batch
 * callers may pass memberships already read via getCurrentAllianceIds.
 */
export async function getAttackLogViewerRole(
  userId: number,
  log: AttackLogAccessSubject | null | undefined,
  client: Prisma.TransactionClient = prisma,
  currentAllianceIds?: number[],
): Promise<AttackLogViewerRole | null> {
  if (!log || !isPositiveId(userId)) return null;
  if (log.attacker_id === userId) return 'attacker';
  if (log.defender_id === userId) return 'defender';

  const acl =
    log.acl ??
    (await client.attack_log_acl.findMany({
      where: { attack_log_id: log.id },
      select: ATTACK_LOG_ACL_SELECT,
    }));

  if (acl.some((entry) => entry.shared_with_user_id === userId)) {
    return 'shared';
  }

  const sharedAllianceIds = [
    ...new Set(
      acl
        .map((entry) => entry.shared_with_alliance_id)
        .filter((id): id is number => isPositiveId(id)),
    ),
  ];
  if (sharedAllianceIds.length === 0) return null;
  if (currentAllianceIds) {
    return sharedAllianceIds.some((id) => currentAllianceIds.includes(id))
      ? 'shared'
      : null;
  }

  const membership = await client.alliance_memberships.findFirst({
    where: { user_id: userId, alliance_id: { in: sharedAllianceIds } },
    select: { alliance_id: true },
  });
  return membership ? 'shared' : null;
}

/** True when the user may read the attack log. */
export async function canReadAttackLog(
  userId: number,
  log: AttackLogAccessSubject | null | undefined,
  client: Prisma.TransactionClient = prisma,
): Promise<boolean> {
  return (await getAttackLogViewerRole(userId, log, client)) !== null;
}

/** Prisma filter matching every attack log the user may read. */
export function readableAttackLogWhere(
  userId: number,
  allianceIds: number[],
): Prisma.attack_logWhereInput {
  const or: Prisma.attack_logWhereInput[] = [
    { attacker_id: userId },
    { defender_id: userId },
    { acl: { some: { shared_with_user_id: userId } } },
  ];
  if (allianceIds.length > 0) {
    or.push({
      acl: { some: { shared_with_alliance_id: { in: allianceIds } } },
    });
  }
  return { OR: or };
}

/**
 * Returns the users a sharer may grant access to through a chat room: the other
 * current participants. Throws when the sharer is not a current participant, or,
 * for an alliance room, not a current member of that alliance. In alliance rooms
 * only current alliance members receive access.
 */
export async function getRoomShareRecipientIds(
  sharerId: number,
  roomId: number,
  client: Prisma.TransactionClient = prisma,
): Promise<number[]> {
  const room = await client.chatRoom.findUnique({
    where: { id: roomId },
    select: { allianceId: true, participants: { select: { userId: true } } },
  });
  if (!room) {
    throw new Error('Chat room not found');
  }

  const participantIds: number[] = room.participants.map((p) => p.userId);
  if (!participantIds.includes(sharerId)) {
    throw new Error('You are not a participant in this chat room');
  }

  let eligibleIds: number[] = participantIds;
  if (room.allianceId) {
    const members = await client.alliance_memberships.findMany({
      where: { alliance_id: room.allianceId, user_id: { in: participantIds } },
      select: { user_id: true },
    });
    const memberIds = new Set<number>(members.map((m) => m.user_id));
    if (!memberIds.has(sharerId)) {
      throw new Error('You are not a participant in this chat room');
    }
    eligibleIds = participantIds.filter((id) => memberIds.has(id));
  }

  return [...new Set(eligibleIds)].filter((id) => id !== sharerId);
}

/**
 * Grants per-user read access to the other current members of a room. The caller
 * must already have verified that the sharer can read the log.
 */
export async function grantAttackLogAccessToRoom(
  attackLogId: number,
  sharerId: number,
  roomId: number,
  client?: Prisma.TransactionClient,
): Promise<{ newUserIds: number[]; existingUserIds: number[] }> {
  if (!client) {
    return withLockedChatRoom(roomId, (tx) =>
      grantAttackLogAccessToRoom(attackLogId, sharerId, roomId, tx),
    );
  }
  const recipientIds = await getRoomShareRecipientIds(sharerId, roomId, client);
  if (recipientIds.length === 0) {
    return { newUserIds: [], existingUserIds: [] };
  }

  const existing = await client.attack_log_acl.findMany({
    where: {
      attack_log_id: attackLogId,
      shared_with_user_id: { in: recipientIds },
    },
    select: { shared_with_user_id: true },
  });
  const existingIds = new Set<number | null>(
    existing.map((e) => e.shared_with_user_id),
  );
  const newUserIds = recipientIds.filter((id) => !existingIds.has(id));

  if (newUserIds.length > 0) {
    await client.attack_log_acl.createMany({
      data: newUserIds.map((userId) => ({
        attack_log_id: attackLogId,
        shared_with_user_id: userId,
      })),
    });
  }

  return {
    newUserIds,
    existingUserIds: recipientIds.filter((id) => existingIds.has(id)),
  };
}

// ---------------------------------------------------------------------------
// Allowlist redaction
// ---------------------------------------------------------------------------

type JsonRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is JsonRecord =>
  !!value && typeof value === 'object' && !Array.isArray(value);

/** Legacy logs store some sub-objects as JSON strings. */
const parseJsonish = (value: unknown): unknown => {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
};

const asRecord = (value: unknown): JsonRecord => {
  const parsed = parseJsonish(value);
  return isRecord(parsed) ? parsed : {};
};

const toNumber = (value: unknown): number => {
  const n =
    typeof value === 'string' || typeof value === 'bigint'
      ? Number(value)
      : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : 0;
};

const toOptionalNumber = (value: unknown): number | null =>
  value === null || value === undefined ? null : toNumber(value);

/** Numbers and bigints (as strings) such as gold amounts. */
const toAmount = (value: unknown): string => {
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }
  if (typeof value === 'string' && /^-?\d+$/.test(value)) return value;
  return '0';
};

const toOptionalAmount = (value: unknown): string | null =>
  value === null || value === undefined ? null : toAmount(value);

const toLabel = (value: unknown): string | null =>
  typeof value === 'string' ? value : null;

interface UnitStack {
  type: string;
  level: number;
  quantity: number;
}

const pickUnits = (value: unknown): UnitStack[] => {
  const parsed = parseJsonish(value);
  const list = Array.isArray(parsed)
    ? parsed
    : isRecord(parsed)
      ? Object.values(parsed)
      : [];
  return list.filter(isRecord).map((unit) => ({
    type: String(unit.type ?? ''),
    level: toNumber(unit.level),
    quantity: toNumber(unit.quantity),
  }));
};

const pickItems = (value: unknown) => {
  const parsed = parseJsonish(value);
  const list = Array.isArray(parsed)
    ? parsed
    : isRecord(parsed)
      ? Object.values(parsed)
      : [];
  return list.filter(isRecord).map((item) => ({
    usage: String(item.usage ?? ''),
    type: String(item.type ?? ''),
    level: toNumber(item.level),
    quantity: toNumber(item.quantity),
  }));
};

const sumQuantity = (units: UnitStack[], type: string) =>
  units
    .filter((unit) => unit.type === type)
    .reduce((total, unit) => total + unit.quantity, 0);

/** Loss totals for everyone; the per-unit breakdown only for that side. */
const pickLosses = (value: unknown, includeBreakdown: boolean) => {
  const losses = asRecord(value);
  const total = toNumber(losses.total);
  return includeBreakdown
    ? { total, units: pickUnits(losses.units) }
    : { total };
};

const pickIntelligence = (value: unknown) => {
  if (!isRecord(value)) return null;
  return {
    offense: toOptionalNumber(value.offense),
    defense: toOptionalNumber(value.defense),
    spyOffense: toOptionalNumber(value.spyOffense),
    spyDefense: toOptionalNumber(value.spyDefense),
    units: value.units == null ? null : pickUnits(value.units),
    mercenaries:
      value.mercenaries == null ? null : pickUnits(value.mercenaries),
    items: value.items == null ? null : pickItems(value.items),
    fortLevel: toOptionalNumber(value.fortLevel),
    fortHitpoints: toOptionalNumber(value.fortHitpoints),
    defenseBonus: toOptionalNumber(value.defenseBonus),
    spyLevel: toOptionalNumber(value.spyLevel),
    sentryLevel: toOptionalNumber(value.sentryLevel),
    gold: toOptionalAmount(value.gold),
    goldInBank: toOptionalAmount(value.goldInBank),
  };
};

/**
 * Spy mission results. Every reader sees the mission outcome and any intel
 * gathered (sharing intel is the point of sharing an intel report). The attacker
 * also sees their own spy losses and, on success only, the odds; the defender the per-unit target losses.
 */
export function redactSpyResultsForViewer(
  value: unknown,
  role: AttackLogViewerRole,
): JsonRecord {
  const spy = asRecord(value);
  const out: JsonRecord = {
    spiesSent: toNumber(spy.spiesSent),
    spiesLost: toNumber(spy.spiesLost),
    success: spy.success === true,
    turns: toNumber(spy.turns),
    attackerLevel: toOptionalNumber(spy.attackerLevel),
    defenderLevel: toOptionalNumber(spy.defenderLevel),
  };
  if ('intelPercentage' in spy) {
    out.intelPercentage = toNumber(spy.intelPercentage);
    out.intelligenceGathered = pickIntelligence(spy.intelligenceGathered);
  }
  if ('unitsKilled' in spy) out.unitsKilled = toNumber(spy.unitsKilled);
  if ('targetUnit' in spy) out.targetUnit = toLabel(spy.targetUnit);
  if ('unit' in spy) out.unit = toLabel(spy.unit);
  if ('goldStolen' in spy) out.goldStolen = toAmount(spy.goldStolen);
  if ('fortDmg' in spy) out.fortDmg = toNumber(spy.fortDmg);

  if (role === 'attacker') {
    out.spyLosses = pickUnits(spy.spyLosses);
    // Failed-mission odds invert to the defender's sentry strength; hide them.
    if (out.success === true) {
      out.successProbability = toNumber(spy.successProbability);
    }
    if ('experienceGained' in spy) {
      out.experienceGained = toNumber(spy.experienceGained);
    }
  }
  if (role === 'defender' && 'targetLosses' in spy) {
    out.targetLosses = pickUnits(spy.targetLosses);
  }
  return out;
}

/**
 * Attack battle stats. Every reader sees what the battle report shows: damage,
 * XP, pillage, fort damage, loss totals and the attacker's soldier count. Only
 * the attacker sees their own unit levels, loss breakdown and turns; only the
 * defender sees their own loss breakdown and absolute fort hitpoints. Defender
 * rosters, defense points, replay inputs and daily allowances are never returned.
 */
export function redactBattleStatsForViewer(
  value: unknown,
  role: AttackLogViewerRole,
): JsonRecord {
  const stats = asRecord(value);
  const start = asRecord(stats.startOfAttack);
  const startAttacker = asRecord(start.Attacker);
  const startDefender = asRecord(start.Defender);
  const attackerUnits = pickUnits(startAttacker.units).filter(
    (unit) => unit.type === 'OFFENSE',
  );
  const xp = asRecord(stats.xpEarned);
  const fortStart = toNumber(stats.forthpAtStart);
  const fortEnd = toNumber(stats.forthpAtEnd);
  const rounds = parseJsonish(stats.mitigation_log);
  const damageFor = (source: string): number | null => {
    if (!Array.isArray(rounds)) return null;
    const matching = rounds.filter(
      (round) => isRecord(round) && round.source === source,
    );
    if (
      !matching.length ||
      matching.some(
        (round) =>
          typeof round.mitigatedDamage !== 'number' ||
          !Number.isFinite(round.mitigatedDamage) ||
          round.mitigatedDamage < 0,
      )
    )
      return null;
    return matching.reduce((sum, round) => sum + round.mitigatedDamage, 0);
  };
  const wounded = asRecord(stats.wounded);
  const woundsFor = (side: string, ownSide: boolean) => {
    if (!Array.isArray(wounded[side])) return null;
    const units = pickUnits(wounded[side]);
    const total = units.reduce((sum, unit) => sum + unit.quantity, 0);
    return ownSide ? { total, units } : { total };
  };
  const replay = asRecord(stats.replay);
  // Battles log `defender_protected` (the shared rule's verdict at battle time).
  // Only legacy rows without it fall back to the level-only rule, since era join
  // time, population and forfeiture are not reconstructable from the log.
  const defenderProtected =
    typeof stats.defender_protected === 'boolean'
      ? stats.defender_protected
      : replay.formulaVersion === 'combat-v6' &&
          typeof startDefender.experience === 'number'
        ? getLevelFromXP(startDefender.experience) <= 9
        : null;

  const out: JsonRecord = {
    startOfAttack: {
      Attacker: {
        experience: toNumber(startAttacker.experience),
        units:
          role === 'attacker'
            ? attackerUnits
            : [
                {
                  type: 'OFFENSE',
                  level: 0,
                  quantity: sumQuantity(attackerUnits, 'OFFENSE'),
                },
              ],
      },
      Defender: { experience: toNumber(startDefender.experience) },
    },
    attackerDamageDealt: toNumber(stats.attackerDamageDealt),
    defenderDamageDealt: toNumber(stats.defenderDamageDealt),
    xpEarned: JSON.stringify({
      attacker: toNumber(xp.attacker),
      defender: toNumber(xp.defender),
    }),
    pillagedGold: toAmount(stats.pillagedGold),
    fortDamage: Math.max(0, fortStart - fortEnd),
    attacker_losses: pickLosses(stats.attacker_losses, role === 'attacker'),
    defender_losses: pickLosses(stats.defender_losses, role === 'defender'),
    combat_summary: {
      attackerDamageHp: damageFor('ATTACKER'),
      defenderDamageHp: damageFor('DEFENDER'),
      attackerWounded: woundsFor('attacker', role === 'attacker'),
      defenderWounded: woundsFor('defender', role === 'defender'),
      defenderProtected,
      fortAbsorbedDamage: Array.isArray(rounds)
        ? rounds.some(
            (round) =>
              isRecord(round) &&
              round.source === 'ATTACKER' &&
              typeof round.fortSoakMultiplier === 'number' &&
              round.fortSoakMultiplier < 1,
          )
        : null,
    },
  };

  if (role === 'attacker') {
    // Nullable facts preserve missing legacy data instead of inventing zero losses.
    const nonnegative = (value: unknown): number | null => {
      if (value === null || value === undefined || value === '') return null;
      const number = typeof value === 'string' ? Number(value) : value;
      return typeof number === 'number' &&
        Number.isFinite(number) &&
        number >= 0
        ? number
        : null;
    };
    out.recommendation_facts = {
      army:
        Array.isArray(parseJsonish(startAttacker.units)) &&
        attackerUnits.length > 0
          ? attackerUnits.reduce((sum, unit) => sum + unit.quantity, 0)
          : null,
      deaths: nonnegative(asRecord(stats.attacker_losses).total),
      wounded: nonnegative(asRecord(woundsFor('attacker', true)).total),
      enemyDeaths: nonnegative(asRecord(stats.defender_losses).total),
      damageDealt: damageFor('ATTACKER'),
      damageReceived: damageFor('DEFENDER'),
      turns: nonnegative(stats.turns),
    };
    out.turns = toNumber(stats.turns);
  }
  if (role === 'defender') {
    out.defense_advisory = projectDefenseAdvisoryFacts(stats);
    out.forthpAtStart = fortStart;
    out.forthpAtEnd = fortEnd;
  }
  return out;
}

const pickPlayer = (value: unknown) => {
  if (!isRecord(value)) return null;
  const player: JsonRecord = { id: toNumber(value.id) };
  for (const key of ['display_name', 'avatar', 'race'] as const) {
    if (key in value) player[key] = toLabel(value[key]);
  }
  if ('experience' in value) player.experience = toNumber(value.experience);
  return player;
};

const toTimestamp = (value: unknown): string | null => {
  if (value instanceof Date) return value.toISOString();
  return typeof value === 'string' ? value : null;
};

/** Attack log row as returned to a reader. */
export interface RedactedAttackLog {
  id: number;
  type: string;
  timestamp: string | null;
  winner: number;
  attacker_id: number;
  defender_id: number;
  attackerPlayer: JsonRecord | null;
  defenderPlayer: JsonRecord | null;
  stats: JsonRecord;
}

/** Builds the attack log a reader in the given role may see. */
export function redactAttackLogForViewer(
  log: {
    id: number;
    type?: string | null;
    timestamp?: Date | string | null;
    winner: number;
    attacker_id: number;
    defender_id: number;
    stats?: unknown;
    attackerPlayer?: unknown;
    defenderPlayer?: unknown;
  },
  role: AttackLogViewerRole,
): RedactedAttackLog {
  const type = log.type ?? 'attack';
  const stats = asRecord(log.stats);
  return {
    id: log.id,
    type,
    timestamp: toTimestamp(log.timestamp),
    winner: log.winner,
    attacker_id: log.attacker_id,
    defender_id: log.defender_id,
    attackerPlayer: pickPlayer(log.attackerPlayer),
    defenderPlayer: pickPlayer(log.defenderPlayer),
    stats:
      type === 'attack'
        ? redactBattleStatsForViewer(stats, role)
        : { spyResults: redactSpyResultsForViewer(stats.spyResults, role) },
  };
}

/**
 * Retest (replay) output for a reader. Shared fields match the battle report;
 * army sizes, strength, loss breakdowns, wounded and fort HP are only returned
 * for the viewer's own side. The raw engine result is never returned.
 */
export function redactRetestForViewer(
  value: unknown,
  role: AttackLogViewerRole,
): JsonRecord {
  const result = asRecord(value);
  const out: JsonRecord = {
    replayMode: toLabel(result.replayMode),
    exactReplay: result.exactReplay === true,
  };
  if ('formulaVersion' in result) {
    out.formulaVersion = toOptionalNumber(result.formulaVersion);
  }
  if ('message' in result) out.message = toLabel(result.message);
  if ('originalGold' in result)
    out.originalGold = toAmount(result.originalGold);

  // Spy replay: both results use the spy report allowlist.
  if ('originalResult' in result) {
    out.originalResult = redactSpyResultsForViewer(result.originalResult, role);
    out.result = redactSpyResultsForViewer(result.result, role);
    return out;
  }
  if (result.replayMode !== 'EXACT') return out;

  const strength = asRecord(result.strength);
  const wounded = asRecord(result.wounded);
  Object.assign(out, {
    attackerWon: result.attackerWon === true,
    newGold: toAmount(result.newGold),
    originalAttackerLosses: toNumber(result.originalAttackerLosses),
    originalDefenderLosses: toNumber(result.originalDefenderLosses),
    newSimulationAttackerLossesTotal: toNumber(
      result.newSimulationAttackerLossesTotal,
    ),
    newSimulationDefenderLossesTotal: toNumber(
      result.newSimulationDefenderLossesTotal,
    ),
  });

  if (role === 'attacker') {
    Object.assign(out, {
      originalAttackerArmy: toNumber(result.originalAttackerArmy),
      newSimulationAttackerArmy: toNumber(result.newSimulationAttackerArmy),
      newSimulationAttackerLossesBreakdown: pickLosses(
        result.newSimulationAttackerLossesBreakdown,
        true,
      ),
      strength: { attackerOffense: toNumber(strength.attackerOffense) },
      wounded: { attacker: pickUnits(wounded.attacker) },
    });
  }
  if (role === 'defender') {
    Object.assign(out, {
      originalDefenderArmy: toNumber(result.originalDefenderArmy),
      newSimulationDefenderArmy: toNumber(result.newSimulationDefenderArmy),
      newSimulationDefenderLossesBreakdown: pickLosses(
        result.newSimulationDefenderLossesBreakdown,
        true,
      ),
      strength: { defenderDefense: toNumber(strength.defenderDefense) },
      wounded: { defender: pickUnits(wounded.defender) },
      fortHPAtEnd: toNumber(result.fortHPAtEnd),
    });
  }
  return out;
}
