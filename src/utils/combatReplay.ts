import { z } from 'zod';

import type { Prisma, users as PrismaUser } from '@/lib/prisma-exports';
import { BaseUser } from '@/models/BaseUser';
import { BattleUser } from '@/models/BattleUser';
import { SpyUser } from '@/models/SpyUser';
import type {
  BonusType,
  PlayerBattleUpgrade,
  PlayerItem,
  PlayerUnit,
  StructureUpgrade,
  UnitType,
} from '@/types/typings';
import { forceCombatIdentity } from '@/utils/forceCombatIdentity';
import type { CombatRandomReplay } from '@/utils/serverRandom';
import {
  decryptCombatReplayInputs,
  encryptCombatReplayInputs,
} from '@/utils/serverRandom';

/** An allowlist of engine inputs, never an account/profile dump. */
export interface CombatUserSnapshot {
  id: number;
  displayName: string;
  race: string;
  class: string;
  experience: number;
  fortLevel: number;
  fortHitpoints: number;
  houseLevel: number;
  gold: string;
  goldInBank?: string;
  attackTurns: number;
  stamina: number;
  defensePressureToday: number;
  defensePressureDate: string | null;
  spyPressureToday: number;
  spyPressureDate: string | null;
  units: PlayerUnit[];
  mercenaries: PlayerUnit[];
  items: Array<{
    id: number;
    userId: number;
    usage: 'OFFENSE' | 'DEFENSE' | 'SPY' | 'SENTRY';
    type: PlayerItem['type'];
    level: number;
    quantity: number;
  }>;
  structure_upgrades: StructureUpgrade[];
  battle_upgrades: PlayerBattleUpgrade[];
  bonus_points: Array<{
    id: number;
    userId: number;
    type: BonusType;
    level: number;
  }>;
}

export function captureCombatUser(
  user: BaseUser & { goldInBank?: bigint },
): CombatUserSnapshot {
  const units =
    user instanceof BattleUser ? user.getUnitsForDbUpdate() : user.units;
  const mercenaries =
    user instanceof BattleUser
      ? user.getMercenariesForDbUpdate()
      : user.mercenaries;
  return {
    id: user.id,
    displayName: user.displayName,
    race: user.race,
    class: user.class,
    experience: user.experience,
    fortLevel: user.fortLevel,
    fortHitpoints: user.fortHitpoints,
    houseLevel: user.houseLevel,
    gold: user.gold.toString(),
    ...(user.goldInBank === undefined
      ? {}
      : { goldInBank: user.goldInBank.toString() }),
    attackTurns: user.attackTurns,
    stamina: user.stamina,
    defensePressureToday: user.defensePressureToday,
    defensePressureDate: user.defensePressureDate
      ? new Date(user.defensePressureDate).toISOString()
      : null,
    spyPressureToday: user.spyPressureToday,
    spyPressureDate: user.spyPressureDate
      ? new Date(user.spyPressureDate).toISOString()
      : null,
    units: units.map((unit) => ({
      id: unit.id,
      userId: user.id,
      type: unit.type,
      level: unit.level,
      quantity: unit.quantity,
      isMercenary: false,
      ...forceCombatIdentity(unit),
    })),
    mercenaries: mercenaries.map((unit) => ({
      id: unit.id,
      userId: user.id,
      type: unit.type,
      level: unit.level,
      quantity: unit.quantity,
      isMercenary: true,
      ...forceCombatIdentity(unit),
    })),
    items: user.items.map(({ id, type, level, usage, quantity }) => ({
      id,
      userId: user.id,
      type,
      level,
      usage,
      quantity,
    })),
    structure_upgrades: user.structure_upgrades.map(({ id, type, level }) => ({
      id,
      userId: user.id,
      type,
      level,
    })),
    battle_upgrades: user.battle_upgrades.map(
      ({ id, type, level, quantity }) => ({
        id,
        userId: user.id,
        type,
        level,
        quantity,
      }),
    ),
    bonus_points: user.bonus_points.map(({ id, type, level }) => ({
      id,
      userId: user.id,
      type,
      level,
    })),
  };
}

export type AttackReplay = CombatRandomReplay & {
  domain: 'attack';
  attacker: CombatUserSnapshot;
  defender: CombatUserSnapshot;
  turns: number;
  defenderProtected: boolean;
  defenderDailyCasualtyRemaining: number;
  defenderDailyGoldRemaining: string;
};

export type SpyReplay = CombatRandomReplay & {
  domain: 'spy';
  attacker: CombatUserSnapshot;
  defender: CombatUserSnapshot;
  turns: number;
  spies: number;
  mission: 'INTEL' | 'ASSASSINATE' | 'INFILTRATE';
  target?: UnitType | 'CITIZEN_WORKERS';
  spyPressureToday: number;
  /** Shared daily casualty allowance left for the defender when the mission ran. */
  defenderDailyCasualtyRemaining?: number;
  /** Kills of the targeted type still allowed that day across all attackers. */
  targetTypeDailyRemaining?: number;
};

export type CombatReplay = AttackReplay | SpyReplay;

/** Public log metadata; the complete pre-execution state is sealed server-only. */
export type CombatReplayEnvelope = CombatRandomReplay & {
  encryptedInputs: string;
};

export function sealCombatReplay(replay: CombatReplay): CombatReplayEnvelope {
  const { formulaVersion, algorithm, domain, encryptedSeed, ...inputs } =
    replay;
  const metadata = { formulaVersion, algorithm, domain, encryptedSeed };
  return {
    ...metadata,
    encryptedInputs: encryptCombatReplayInputs(metadata, inputs),
  };
}

const rosterType = z.enum([
  'CITIZEN',
  'WORKER',
  'OFFENSE',
  'DEFENSE',
  'SPY',
  'SENTRY',
]);
const combatType = z.enum(['OFFENSE', 'DEFENSE', 'SPY', 'SENTRY']);
const relation = { id: z.number().int(), userId: z.number().int() };
const level = z.number().int().nonnegative();
const quantity = z.number().int().nonnegative();
const decimalGold = z.string().regex(/^\d+$/);
const userSnapshotSchema = z.object({
  id: z.number().int(),
  displayName: z.string(),
  race: z.string(),
  class: z.string(),
  experience: z.number().finite(),
  fortLevel: level,
  fortHitpoints: z.number().finite().nonnegative(),
  houseLevel: level,
  gold: decimalGold,
  goldInBank: decimalGold.optional(),
  attackTurns: quantity,
  stamina: z.number().finite().nonnegative(),
  defensePressureToday: z.number().finite().nonnegative(),
  defensePressureDate: z.string().datetime().nullable(),
  spyPressureToday: z.number().finite().nonnegative(),
  spyPressureDate: z.string().datetime().nullable(),
  units: z.array(
    z.object({
      ...relation,
      type: rosterType,
      level,
      quantity,
      isMercenary: z.boolean(),
      forceContractId: z.number().int().positive().optional(),
      forceKind: z.enum(['MERCENARY', 'ALLIANCE']).optional(),
      forceEquipment: z
        .array(
          z.object({ type: z.string(), level: z.number().int().positive() }),
        )
        .optional(),
    }),
  ),
  mercenaries: z.array(
    z.object({
      ...relation,
      type: rosterType,
      level,
      quantity,
      isMercenary: z.boolean(),
      forceContractId: z.number().int().positive().optional(),
      forceKind: z.enum(['MERCENARY', 'ALLIANCE']).optional(),
      forceEquipment: z
        .array(
          z.object({ type: z.string(), level: z.number().int().positive() }),
        )
        .optional(),
    }),
  ),
  items: z.array(
    z.object({
      ...relation,
      type: z.enum(['WEAPON', 'HELM', 'ARMOR', 'BOOTS', 'BRACERS', 'SHIELD']),
      level,
      quantity,
      usage: combatType,
    }),
  ),
  structure_upgrades: z.array(
    z.object({
      ...relation,
      type: z.enum(['OFFENSE', 'SPY', 'SENTRY', 'ARMORY']),
      level,
    }),
  ),
  battle_upgrades: z.array(
    z.object({
      ...relation,
      type: combatType,
      level,
      quantity,
    }),
  ),
  bonus_points: z.array(
    z.object({
      ...relation,
      type: z.enum([
        'OFFENSE',
        'DEFENSE',
        'RECRUITING',
        'CASUALTY',
        'INTEL',
        'INCOME',
        'PRICES',
      ]),
      level,
    }),
  ),
});
const replayBase = {
  formulaVersion: z.string(),
  algorithm: z.string(),
  encryptedSeed: z.string().min(1),
  attacker: userSnapshotSchema,
  defender: userSnapshotSchema,
  turns: z.number().int().min(1).max(10),
};
const combatReplaySchema = z.discriminatedUnion('domain', [
  z.object({
    ...replayBase,
    domain: z.literal('attack'),
    defenderProtected: z.boolean(),
    defenderDailyCasualtyRemaining: quantity,
    defenderDailyGoldRemaining: decimalGold,
  }),
  z.object({
    ...replayBase,
    domain: z.literal('spy'),
    spies: quantity,
    mission: z.enum(['INTEL', 'ASSASSINATE', 'INFILTRATE']),
    target: z.union([rosterType, z.literal('CITIZEN_WORKERS')]).optional(),
    spyPressureToday: z.number().finite().nonnegative(),
    defenderDailyCasualtyRemaining: quantity.optional(),
    targetTypeDailyRemaining: quantity.optional(),
  }),
]);

const replayEnvelopeSchema = z.object({
  formulaVersion: z.string(),
  algorithm: z.string(),
  domain: z.enum(['attack', 'spy']),
  encryptedSeed: z.string().min(1),
  encryptedInputs: z.string().min(1),
});

/**
 * The installed zod build reports object outputs as weakly optional, so the
 * declared contracts are restored with casts after runtime validation
 * instead of trusting schema inference.
 */

/** Authenticate/decrypt server-only inputs, then validate before replay execution. */
export function parseCombatReplay(value: unknown): CombatReplay {
  const envelope = replayEnvelopeSchema.parse(value) as CombatReplayEnvelope;
  const inputs = decryptCombatReplayInputs(envelope, envelope.encryptedInputs);
  if (!inputs || typeof inputs !== 'object' || Array.isArray(inputs)) {
    throw new Error('Combat replay inputs are not an object');
  }
  const replay = combatReplaySchema.parse({
    ...inputs,
    ...envelope,
  }) as CombatReplay;
  if (
    replay.domain === 'spy' &&
    replay.mission === 'ASSASSINATE' &&
    !replay.target
  ) {
    throw new Error('Assassination replay is missing its target');
  }
  return replay;
}

/** Serialize outcomes with bounded actor snapshots and decimal bigint resources. */
export function serializeCombatResult(value: object): Prisma.InputJsonObject {
  return JSON.parse(
    JSON.stringify(
      value,
      function (this: Record<string, unknown>, key: string, entry: unknown) {
        const original = this[key];
        if (original instanceof BaseUser) return captureCombatUser(original);
        return typeof entry === 'bigint' ? entry.toString() : entry;
      },
    ),
  );
}

function restoreUserData(snapshot: CombatUserSnapshot): PrismaUser {
  // Models require Prisma's full account type but only consume these game fields.
  // Clone first: every replay must be independent of prior engine mutations.
  const value = structuredClone(snapshot);
  return {
    id: value.id,
    display_name: value.displayName,
    race: value.race,
    class: value.class,
    experience: value.experience,
    fort_level: value.fortLevel,
    fort_hitpoints: value.fortHitpoints,
    house_level: value.houseLevel,
    gold: BigInt(value.gold),
    gold_in_bank: BigInt(value.goldInBank ?? '0'),
    attack_turns: value.attackTurns,
    stamina: value.stamina,
    defense_pressure_today: value.defensePressureToday,
    defense_pressure_date: value.defensePressureDate,
    spy_pressure_today: value.spyPressureToday,
    spy_pressure_date: value.spyPressureDate,
    UserUnit: [...value.units, ...value.mercenaries],
    UserItem: value.items,
    UserStructureUpgrade: value.structure_upgrades,
    UserBattleUpgrade: value.battle_upgrades,
    UserBonusPoints: value.bonus_points,
  } as unknown as PrismaUser;
}

export function restoreBattleUser(snapshot: CombatUserSnapshot): BattleUser {
  return new BattleUser(restoreUserData(snapshot));
}

export function restoreSpyUser(snapshot: CombatUserSnapshot): SpyUser {
  return new SpyUser(restoreUserData(snapshot));
}
