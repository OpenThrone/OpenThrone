import { hasFeature } from '@/constants/FeatureUnlocks';
import {
  deadCombatRows,
  distributeReanimation,
  enemyReanimationQuantity,
  ownReanimationQuantity,
  REANIMATED_UNIT_LEVEL,
  reanimationDailyCap,
  type ReanimationFallenRow,
} from '@/constants/Reanimation';
import type { Prisma } from '@/lib/prisma-exports';
import { getOTDayKey } from '@/utils/timefunctions';

type Tx = Prisma.TransactionClient;

/** Trained combat unit rows that make up the daily cap's army basis. */
const COMBAT_UNIT_TYPES = ['OFFENSE', 'DEFENSE', 'SPY', 'SENTRY'] as const;

/** One unit type's share of a battle's risen dead (always level 1). */
export interface ReanimatedUnitGrant {
  unitType: string;
  quantity: number;
}

/** What one battle's dead yielded for each UNDEAD side. */
export interface ReanimationBattleOutcome {
  /** Level-1 stacks for the Undead attacker; empty when not eligible. */
  attacker: ReanimatedUnitGrant[];
  /** Level-1 stacks for the Undead defender; empty when not eligible. */
  defender: ReanimatedUnitGrant[];
}

/** The upgrade levels of one side, as stored on the users row. */
export interface ReanimationSideLevels {
  userId: number;
  fortLevel: number;
  economyLevel: number;
  race: string | null;
}

/** Total units in a grant list. */
export const reanimatedUnitsTotal = (
  grants: readonly ReanimatedUnitGrant[],
): number =>
  grants.reduce((sum, grant) => sum + Math.max(0, grant.quantity), 0);

/**
 * Undead reanimation (#211, phase 5 of #205): after any resolved attack, each
 * UNDEAD side with the REANIMATION feature raises a share of its own fallen
 * and of the enemy's dead as level-1 units of the same type. The day's total
 * is capped at 2% of the trained combat army measured at the first battle of
 * the OT day; excess is lost, never carried over.
 */
export class ReanimationService {
  /**
   * Battle hook run inside the battle transaction, after casualties and after
   * the captives hook, under the locks the battle already holds (both users
   * rows are locked FOR UPDATE before it runs, so the daily ledger read is
   * authoritative and concurrent battles queue instead of double-raising — a
   * retried battle is a new transaction that replays from the rolled-back
   * state, so nothing can rise twice). Own fallen rise first; the enemy's
   * dead fill whatever is left of the day's cap.
   *
   * This method only computes the grants and stamps the daily ledger on the
   * users rows: the returned level-1 stacks must be added to the rosters with
   * applyReanimatedUnits AFTER the battle's own updateUserUnits calls, which
   * rewrite every stack from the battle's survivors and would clobber an
   * earlier grant.
   */
  static async reanimateFromBattle(
    tx: Tx,
    input: {
      attacker: ReanimationSideLevels;
      defender: ReanimationSideLevels;
      /** The attacker's killed rows, as the battle engine records them. */
      attackerKilledUnits: ReanimationFallenRow[];
      /** The defender's killed rows, as the battle engine records them. */
      defenderKilledUnits: ReanimationFallenRow[];
      /** Captives the attacker's dungeon took out of the defender's killed. */
      captivesTaken: number;
      now?: Date;
    },
  ): Promise<ReanimationBattleOutcome> {
    const now = input.now ?? new Date();
    // The defender's dead rows — killed combat rows minus the captives the
    // attacker's dungeon took (a captive sits in a dungeon, not in a grave) —
    // feed BOTH the Undead attacker's enemy pool and the Undead defender's
    // own pool. The attacker's rows can never have been captured.
    const attackerDead = deadCombatRows(input.attackerKilledUnits, 0);
    const defenderDead = deadCombatRows(
      input.defenderKilledUnits,
      input.captivesTaken,
    );

    const attacker = await this.reanimateSide(tx, {
      side: input.attacker,
      ownDead: attackerDead,
      enemyDead: defenderDead,
      now,
    });
    const defender = await this.reanimateSide(tx, {
      side: input.defender,
      ownDead: defenderDead,
      enemyDead: attackerDead,
      now,
    });
    return { attacker, defender };
  }

  /**
   * One Undead side's share of a battle: 8% of its own fallen plus 4% of the
   * enemy's dead (+0.5pp each per fort level above 5, capped at 15% / 8%),
   * floored once per pool on the fallen total, then distributed across the
   * fallen rows largest-remainder so split stacks can neither dodge nor farm
   * the share. Stamps the day's cap basis at the side's first battle of the
   * OT day, exactly like the morale pass stamps kingdom_morale_day.
   */
  private static async reanimateSide(
    tx: Tx,
    input: {
      side: ReanimationSideLevels;
      ownDead: ReanimationFallenRow[];
      enemyDead: ReanimationFallenRow[];
      now: Date;
    },
  ): Promise<ReanimatedUnitGrant[]> {
    if (
      !hasFeature(
        {
          economyLevel: input.side.economyLevel ?? 0,
          fortLevel: input.side.fortLevel ?? 0,
          race: input.side.race,
        },
        'REANIMATION',
      )
    ) {
      return [];
    }
    const fortLevel = input.side.fortLevel ?? 0;
    const ownFallen = input.ownDead.reduce((sum, row) => sum + row.quantity, 0);
    const enemyFallen = input.enemyDead.reduce(
      (sum, row) => sum + row.quantity,
      0,
    );
    const ownPool = ownReanimationQuantity(ownFallen, fortLevel);
    const enemyPool = enemyReanimationQuantity(enemyFallen, fortLevel);

    const todayKey = getOTDayKey(input.now);
    const row = await tx.users.findUnique({
      where: { id: input.side.userId },
      select: {
        reanimated_today: true,
        reanimation_day: true,
        reanimation_cap: true,
      },
    });
    let cap: number;
    let usedToday: number;
    let newDay = false;
    if (row && row.reanimation_day === todayKey) {
      cap = Math.max(0, row.reanimation_cap ?? 0);
      usedToday = Math.max(0, row.reanimated_today ?? 0);
    } else {
      // First reanimation-eligible battle of the OT day: the cap is 2% of the
      // trained combat army as it stands NOW. The battle's own casualties are
      // persisted later in this transaction, so this still reads the
      // pre-battle army — the closest thing to "measured at the start of the
      // day" available under the battle's locks.
      const army = await tx.userUnit.aggregate({
        _sum: { quantity: true },
        where: {
          userId: input.side.userId,
          isMercenary: false,
          type: { in: [...COMBAT_UNIT_TYPES] },
        },
      });
      cap = reanimationDailyCap(Number(army._sum.quantity ?? 0));
      usedToday = 0;
      newDay = true;
    }
    const remaining = Math.max(0, cap - usedToday);

    // Own fallen rise first; the enemy's dead fill what is left of the cap.
    const ownGrant = Math.min(ownPool, remaining);
    const enemyGrant = Math.min(enemyPool, remaining - ownGrant);
    const grants = new Map<string, number>();
    const addGrants = (fallen: ReanimationFallenRow[], total: number) => {
      if (total <= 0) return;
      const takes = distributeReanimation(
        fallen.map((row) => row.quantity),
        total,
      );
      for (let index = 0; index < fallen.length; index += 1) {
        if (takes[index] <= 0) continue;
        grants.set(
          fallen[index].type,
          (grants.get(fallen[index].type) ?? 0) + takes[index],
        );
      }
    };
    addGrants(input.ownDead, ownGrant);
    addGrants(input.enemyDead, enemyGrant);
    const granted = ownGrant + enemyGrant;

    // Stamp the ledger: always on the day's first eligible battle (so the
    // measured cap basis sticks), and on every battle that raised the dead.
    if (newDay || granted > 0) {
      await tx.users.update({
        where: { id: input.side.userId },
        data: {
          reanimated_today: usedToday + granted,
          reanimation_day: todayKey,
          reanimation_cap: cap,
        },
      });
    }

    return [...grants.entries()]
      .map(([unitType, quantity]) => ({ unitType, quantity }))
      .sort((a, b) => a.unitType.localeCompare(b.unitType));
  }

  /**
   * Adds one side's granted level-1 stacks to its roster. Must run after the
   * battle's updateUserUnits calls (which rewrite every stack from the
   * battle's in-memory survivors and delete stacks outside that roster);
   * inside the same transaction the grants can never be lost. Reanimated
   * units are always level 1, whatever tier they fell from.
   */
  static async applyReanimatedUnits(
    tx: Tx,
    userId: number,
    grants: readonly ReanimatedUnitGrant[],
  ): Promise<number> {
    let applied = 0;
    for (const grant of grants) {
      if (grant.quantity <= 0) continue;
      await tx.userUnit.upsert({
        where: {
          userId_type_level_isMercenary: {
            userId,
            type: grant.unitType as Prisma.UserUnitCreateInput['type'],
            level: REANIMATED_UNIT_LEVEL,
            isMercenary: false,
          },
        },
        update: { quantity: { increment: grant.quantity } },
        create: {
          userId,
          type: grant.unitType as Prisma.UserUnitCreateInput['type'],
          level: REANIMATED_UNIT_LEVEL,
          quantity: grant.quantity,
          isMercenary: false,
        },
      });
      applied += grant.quantity;
    }
    return applied;
  }
}
