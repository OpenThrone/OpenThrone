import {
  applyMoraleDelta,
  ARMY_DESERTION_MORALE_THRESHOLD,
  armyDesertionAllowance,
  armyDesertionQuantity,
  CITIZENS_DESERTION_MORALE_THRESHOLD,
  citizensDesertionQuantity,
  computeDailyMoraleDelta,
  DEFECTOR_ATTACK_WINDOW_HOURS,
  DEFECTOR_RECIPIENT_ACTIVE_HOURS,
  DEFECTOR_RECIPIENT_CANDIDATE_LIMIT,
  defectorRecipientDailyCap,
  distributeDesertion,
  KINGDOM_MORALE_DEFAULT,
  mercenaryDesertionQuantity,
  MORALE_BROKE_MERCENARY_UPKEEP,
  splitDefectors,
} from '@/constants/KingdomMorale';
import prisma from '@/lib/prisma';
import type { Prisma } from '@/lib/prisma-exports';
import { CheatDetectionService } from '@/services/CheatDetection.service';
import { getRuntimeConfig } from '@/services/RuntimeConfig.service';
import { getActiveAccountStatus } from '@/services/User.service';
import {
  getProtectionStatus,
  type ProtectionEraInput,
  type ProtectionSettings,
} from '@/utils/battleProtection';
import { logError, logInfo } from '@/utils/logger';
import { getOTDayKey, getOTStartDate } from '@/utils/timefunctions';

type Tx = Prisma.TransactionClient;

/** Same per-user transaction budget as the daily cron's other passes. */
const MORALE_TX_OPTIONS = { timeout: 10_000, maxWait: 5_000 } as const;

/** Unit rows that count as the "trained army" for desertion and defection. */
const TRAINED_UNIT_TYPES = ['OFFENSE', 'DEFENSE', 'SPY', 'SENTRY'] as const;
type TrainedUnitType = (typeof TRAINED_UNIT_TYPES)[number];

const isTrainedUnitType = (type: string): type is TrainedUnitType =>
  (TRAINED_UNIT_TYPES as readonly string[]).includes(type);

export type DailyKingdomMoraleContext = {
  era: ProtectionEraInput | null;
  settings: ProtectionSettings;
};

const HOUR_MS = 60 * 60 * 1000;

/** Total size of the non-mercenary trained rows in a unit list. */
const trainedTotal = (
  units: Array<{ type: string; quantity: number; isMercenary: boolean }>,
) =>
  units
    .filter(
      (unit) => unit.isMercenary === false && isTrainedUnitType(unit.type),
    )
    .reduce((sum, unit) => sum + unit.quantity, 0);

/** Player-facing summary of one day of desertion, recorded next to the events. */
export function desertionSummaryMessage(summary: {
  moraleBefore: number;
  moraleAfter: number;
  citizensLost: number;
  trainedDeserted: number;
  defected: number;
  abandoned: number;
  mercenariesLost: number;
}): string {
  const parts: string[] = [];
  if (summary.citizensLost > 0)
    parts.push(`${summary.citizensLost} citizens left your kingdom`);
  if (summary.trainedDeserted > 0)
    parts.push(
      `${summary.trainedDeserted} soldiers deserted (${summary.defected} defected to your enemies, ${summary.abandoned} vanished into the wilds)`,
    );
  if (summary.mercenariesLost > 0)
    parts.push(
      `${summary.mercenariesLost} mercenaries abandoned their contracts`,
    );
  if (parts.length === 0) return '';
  return `Morale fell from ${summary.moraleBefore} to ${summary.moraleAfter}. ${parts.join(', ')}.`;
}

/** Encapsulates kingdom morale data access and domain operations (#205). */
export class KingdomMoraleService {
  /**
   * One player's daily morale drift plus desertion, mirroring the daily-event
   * ledger pattern (bank_history stats) the cron already uses. Applies at
   * most once per player per OT day (users.kingdom_morale_day, checked and
   * stamped under the row lock) and never throws: a failure is logged and the
   * remaining daily updates continue. Defector-farming detection runs after
   * the transaction commits, outside it, so its own failure can never roll
   * the pass back.
   */
  static async processDailyKingdomMorale(
    userId: number,
    context: DailyKingdomMoraleContext,
    eraToken: { id: number; startDate: Date },
  ): Promise<'success' | 'stale' | 'failed'> {
    // Captured once for the whole pass — transaction and post-commit
    // detection — so the pass's event stamps and the detection window agree.
    const now = new Date();
    // Desertion (and with it defection) is an admin switch, off by default.
    // An unreadable config fails safe: morale still drifts, nobody deserts.
    const desertionEnabled = await getRuntimeConfig()
      .then((config) => config.enableDesertion === true)
      .catch(() => false);
    let outcome: 'success' | 'stale' | 'failed';
    try {
      outcome = await prisma.$transaction(async (tx) => {
        const todayKey = getOTDayKey(now);

        // A defector recipient's row may need locking below, and every users
        // lock this pass takes must be acquired together in ascending id
        // order — attacks and spy lock their pair that way — which requires
        // knowing the recipient before the first lock is taken. Cheap
        // unlocked peek: only a kingdom that can end today below the army
        // threshold can produce defectors at all.
        const peek = await tx.users.findUnique({
          where: { id: userId },
          select: {
            currentEraId: true,
            last_active: true,
            gold: true,
            kingdom_morale: true,
          },
        });
        let defectorRecipient: { id: number } | null = null;
        if (
          desertionEnabled &&
          peek &&
          peek.currentEraId === eraToken.id &&
          peek.last_active &&
          new Date(peek.last_active).getTime() >= eraToken.startDate.getTime()
        ) {
          // Mirror the pass's total delta exactly — daily drift plus the
          // broke-mercenary upkeep hit — so the fallback lock path below only
          // fires when a concurrent write moved morale between peek and lock.
          let peekDelta = computeDailyMoraleDelta({
            lastActiveAt: peek.last_active,
            now,
          }).delta;
          if (peek.gold <= 0n) {
            const activeMercenaryContracts = await tx.forceContract.count({
              where: {
                userId,
                kind: 'MERCENARY',
                status: 'ACTIVE',
                expiresAt: { gt: now },
              },
            });
            if (activeMercenaryContracts > 0)
              peekDelta += MORALE_BROKE_MERCENARY_UPKEEP;
          }
          if (
            applyMoraleDelta(
              Number(peek.kingdom_morale ?? KINGDOM_MORALE_DEFAULT),
              peekDelta,
            ) < ARMY_DESERTION_MORALE_THRESHOLD
          ) {
            defectorRecipient = await this.findDefectorRecipient(
              tx,
              userId,
              context,
              now,
            );
          }
        }

        // Lock every users row this pass touches in ONE ascending-id
        // statement, mirroring attacks, so concurrent morale passes and
        // attack/spy transactions can never deadlock each other.
        if (defectorRecipient) {
          const [firstId, secondId] = [userId, defectorRecipient.id].sort(
            (a, b) => a - b,
          );
          await tx.$queryRaw`SELECT id FROM users WHERE id IN (${firstId}, ${secondId}) ORDER BY id FOR UPDATE`;
        } else {
          await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
        }

        const activeEra = await tx.era.findFirst({
          where: { endDate: null },
          orderBy: { startDate: 'desc' },
          select: { id: true, startDate: true },
        });
        if (
          activeEra?.id !== eraToken.id ||
          new Date(activeEra.startDate).getTime() !==
            eraToken.startDate.getTime()
        )
          return 'stale' as const;

        const row = await tx.users.findUnique({
          where: { id: userId },
          select: {
            id: true,
            currentEraId: true,
            last_active: true,
            gold: true,
            kingdom_morale: true,
            kingdom_morale_day: true,
            desertion_floor: true,
            experience: true,
            house_level: true,
            era_joined_at: true,
            created_at: true,
            event_citizens_received: true,
            UserUnit: { where: { isMercenary: false } },
          },
        });
        if (!row) return 'stale' as const;
        // No current era (or lapsed participation) exempts the player entirely.
        if (
          row.currentEraId !== eraToken.id ||
          !row.last_active ||
          new Date(row.last_active).getTime() < eraToken.startDate.getTime()
        )
          return 'stale' as const;
        // Already applied for this OT day (retried or overlapping cron run):
        // a strict no-op.
        if (row.kingdom_morale_day === todayKey) return 'stale' as const;

        // New-player protection and non-ACTIVE/vacation accounts are exempt
        // from inactivity decay and desertion.
        const protectedFromMorale =
          getProtectionStatus(
            {
              experience: row.experience,
              population: row.UserUnit.reduce(
                (sum, unit) => sum + unit.quantity,
                0,
              ),
              houseLevel: row.house_level,
              eraJoinedAt: row.era_joined_at,
              createdAt: row.created_at,
              eventCitizensReceived: row.event_citizens_received,
            },
            context.era,
            context.settings,
          ).protected || (await getActiveAccountStatus(userId, tx)) !== null;
        if (protectedFromMorale) return 'success' as const;

        const moraleBefore = Number(
          row.kingdom_morale ?? KINGDOM_MORALE_DEFAULT,
        );
        const { delta, rule } = computeDailyMoraleDelta({
          lastActiveAt: row.last_active,
          now,
        });
        let totalDelta = delta;
        // A broke kingdom still holding mercenary contracts cannot pay its
        // upkeep bill (contracts are prepaid here, so zero gold is the signal).
        let brokeMercenaryUpkeep = false;
        if (row.gold <= 0n) {
          const contracts = await tx.forceContract.findMany({
            where: {
              userId,
              kind: 'MERCENARY',
              status: 'ACTIVE',
              expiresAt: { gt: now },
            },
            select: { id: true },
          });
          if (contracts.length > 0) {
            totalDelta += MORALE_BROKE_MERCENARY_UPKEEP;
            brokeMercenaryUpkeep = true;
          }
        }
        const moraleAfter = applyMoraleDelta(moraleBefore, totalDelta);

        const summary = {
          moraleBefore,
          moraleAfter,
          citizensLost: 0,
          trainedDeserted: 0,
          defected: 0,
          abandoned: 0,
          mercenariesLost: 0,
        };
        const events: Array<Prisma.DesertionEventCreateManyInput> = [];
        let desertionFloorUpdate: number | null | undefined;

        // Untrained citizens leave below the citizen threshold.
        if (
          desertionEnabled &&
          moraleAfter < CITIZENS_DESERTION_MORALE_THRESHOLD
        ) {
          for (const unit of row.UserUnit.filter(
            (candidate) => candidate.type === 'CITIZEN',
          )) {
            const leaving = citizensDesertionQuantity(unit.quantity);
            if (leaving <= 0) continue;
            await tx.userUnit.update({
              where: { id: unit.id },
              data: { quantity: { decrement: leaving } },
            });
            summary.citizensLost += leaving;
            events.push({
              userId,
              eraId: row.currentEraId,
              kind: 'CITIZENS',
              unitType: 'CITIZEN',
              unitLevel: unit.level,
              quantity: leaving,
            });
          }
        }

        // Trained army deserts below the army threshold: 1% of the WHOLE
        // army (computed on the total so many small stacks cannot evade it),
        // distributed across rows in proportion to their size, and never past
        // 75% of the floor recorded on the era's first crossing.
        if (desertionEnabled && moraleAfter < ARMY_DESERTION_MORALE_THRESHOLD) {
          const trainedRows = row.UserUnit.filter(
            (candidate) =>
              isTrainedUnitType(candidate.type) && candidate.quantity > 0,
          );
          const armyBefore = trainedRows.reduce(
            (sum, unit) => sum + unit.quantity,
            0,
          );
          // The floor is recorded ONCE per era, at the first crossing, and is
          // deliberately not cleared when morale recovers: only an era reset
          // clears it, so repeated recover-and-crash cycles cannot re-arm a
          // fresh 25% bleed of a shrinking army.
          let floorValue = row.desertion_floor;
          if (floorValue === null) {
            floorValue = armyBefore;
            desertionFloorUpdate = armyBefore;
          }
          const defectorsByRow: Array<{
            unitType: string;
            unitLevel: number;
            quantity: number;
          }> = [];
          const allowance = armyDesertionAllowance(armyBefore, floorValue);
          const dayLoss = Math.min(
            armyDesertionQuantity(armyBefore),
            allowance,
          );
          const rowLosses = distributeDesertion(
            trainedRows.map((unit) => unit.quantity),
            dayLoss,
          );
          for (let index = 0; index < trainedRows.length; index += 1) {
            const unit = trainedRows[index];
            const loss = rowLosses[index];
            if (loss <= 0) continue;
            await tx.userUnit.update({
              where: { id: unit.id },
              data: { quantity: { decrement: loss } },
            });
            summary.trainedDeserted += loss;
            const { defect } = splitDefectors(loss);
            if (defect > 0)
              defectorsByRow.push({
                unitType: unit.type,
                unitLevel: unit.level,
                quantity: defect,
              });
            const abandon = loss - defect;
            if (abandon > 0) {
              events.push({
                userId,
                eraId: row.currentEraId,
                kind: 'ABANDON',
                unitType:
                  unit.type as Prisma.DesertionEventCreateManyInput['unitType'],
                unitLevel: unit.level,
                quantity: abandon,
              });
              summary.abandoned += abandon;
            }
          }

          // Mercenary contracts lose 10% of the whole surviving pool per day
          // (same whole-pool rounding as the trained army: several small
          // contracts cannot each floor their way out of the loss),
          // distributed across contracts in proportion to their survivors.
          const contracts = await tx.forceContract.findMany({
            where: {
              userId,
              kind: 'MERCENARY',
              status: 'ACTIVE',
              expiresAt: { gt: now },
            },
          });
          if (contracts.length > 0) {
            const contractLosses = distributeDesertion(
              contracts.map((contract) => contract.survivingQuantity),
              mercenaryDesertionQuantity(
                contracts.reduce(
                  (sum, contract) => sum + contract.survivingQuantity,
                  0,
                ),
              ),
            );
            for (let index = 0; index < contracts.length; index += 1) {
              const contract = contracts[index];
              const leaving = contractLosses[index];
              if (leaving <= 0) continue;
              const survivors = contract.survivingQuantity - leaving;
              await tx.forceContract.update({
                where: { id: contract.id },
                data: {
                  survivingQuantity: survivors,
                  ...(survivors <= 0
                    ? { status: 'DEPLETED', closedAt: now }
                    : {}),
                },
              });
              summary.mercenariesLost += leaving;
              events.push({
                userId,
                eraId: row.currentEraId,
                kind: 'MERCENARY',
                unitType: contract.type,
                unitLevel: contract.level,
                quantity: leaving,
              });
            }
          }

          // Defectors join the player who attacked this kingdom most in the
          // last 72h, capped at 1% of that player's own army per day. They
          // arrive as untrained CITIZENS, so the receiver must still pay to
          // train them before they fight. The recipient's row is locked
          // BEFORE the cap is read, so concurrent passes for different
          // losers cannot both spend the same cap.
          if (defectorsByRow.length > 0) {
            let lockedRecipient = defectorRecipient;
            if (!lockedRecipient) {
              // The pre-lock peek did not expect desertion today (a
              // concurrent action pushed morale below the threshold after
              // it). Locking a LOWER id now would invert the ascending lock
              // order and could deadlock with attacks, so only a higher id
              // may be taken; otherwise today's defectors abandon instead.
              const found = await this.findDefectorRecipient(
                tx,
                userId,
                context,
                now,
              );
              if (found && found.id > userId) {
                await tx.$queryRaw`SELECT id FROM users WHERE id = ${found.id} FOR UPDATE`;
                lockedRecipient = found;
              } else if (found && found.id < userId) {
                // Counted so a too-inaccurate peek shows up in the logs; the
                // peek mirrors the pass's exact delta inputs, so this only
                // fires when a concurrent write raced the peek-to-lock window.
                logInfo(
                  `Kingdom morale: defector fallback recipient ${found.id} has a lower id than loser ${userId}; defectors abandon today`,
                );
              }
            }
            // Eligibility was last read BEFORE these rows were locked.
            // Re-validate from fresh reads now that both are locked: a
            // recipient that became ineligible (alliance joined, status
            // change, protection, inactivity) forfeits and the defectors
            // abandon instead of landing on an ineligible kingdom.
            if (
              lockedRecipient &&
              !(await this.isEligibleDefectorRecipient(
                tx,
                userId,
                lockedRecipient.id,
                context,
                now,
              ))
            ) {
              lockedRecipient = null;
            }
            if (lockedRecipient) {
              const recipientArmy = await tx.userUnit.findMany({
                where: { userId: lockedRecipient.id, isMercenary: false },
                select: { type: true, quantity: true, isMercenary: true },
              });
              const gainedToday = await tx.desertionEvent.aggregate({
                _sum: { quantity: true },
                where: {
                  kind: 'DEFECT',
                  defectedToUserId: lockedRecipient.id,
                  createdAt: { gte: getOTStartDate() },
                },
              });
              let capRemaining = Math.max(
                0,
                defectorRecipientDailyCap(trainedTotal(recipientArmy)) -
                  Number(gainedToday._sum.quantity ?? 0),
              );
              // Every defector that lands becomes one untrained citizen, so
              // the day's whole intake is a single CITIZEN row increment.
              let citizensGained = 0;
              for (const group of defectorsByRow) {
                const transfer = Math.min(group.quantity, capRemaining);
                capRemaining -= transfer;
                summary.defected += transfer;
                if (transfer > 0) {
                  citizensGained += transfer;
                  // The event records what the LOSER lost (its own row's
                  // type and level); the receiving side's ledger renders the
                  // citizen wording instead of a tier.
                  events.push({
                    userId,
                    eraId: row.currentEraId,
                    kind: 'DEFECT',
                    unitType:
                      group.unitType as Prisma.DesertionEventCreateManyInput['unitType'],
                    unitLevel: group.unitLevel,
                    quantity: transfer,
                    defectedToUserId: lockedRecipient.id,
                  });
                }
                const overflowAbandon = group.quantity - transfer;
                if (overflowAbandon > 0) {
                  events.push({
                    userId,
                    eraId: row.currentEraId,
                    kind: 'ABANDON',
                    unitType:
                      group.unitType as Prisma.DesertionEventCreateManyInput['unitType'],
                    unitLevel: group.unitLevel,
                    quantity: overflowAbandon,
                  });
                  summary.abandoned += overflowAbandon;
                }
              }
              if (citizensGained > 0) {
                await tx.userUnit.upsert({
                  where: {
                    userId_type_level_isMercenary: {
                      userId: lockedRecipient.id,
                      type: 'CITIZEN',
                      level: 1,
                      isMercenary: false,
                    },
                  },
                  update: { quantity: { increment: citizensGained } },
                  create: {
                    userId: lockedRecipient.id,
                    type: 'CITIZEN',
                    level: 1,
                    quantity: citizensGained,
                    isMercenary: false,
                  },
                });
                const loser = await tx.users.findUnique({
                  where: { id: userId },
                  select: { display_name: true },
                });
                await tx.bank_history.create({
                  data: {
                    gold_amount: 0n,
                    from_user_id: userId,
                    from_user_account_type: 'HAND',
                    to_user_id: lockedRecipient.id,
                    to_user_account_type: 'HAND',
                    date_time: now,
                    history_type: 'KINGDOM_MORALE',
                    stats: {
                      defectorsReceived: summary.defected,
                      fromUserId: userId,
                      fromDisplayName: loser?.display_name ?? null,
                      message: `${summary.defected} deserters joined your kingdom as citizens from ${loser?.display_name ?? 'a demoralised kingdom'}.`,
                    },
                  },
                });
              }
            } else {
              // No eligible attacker: every deserter abandons instead.
              for (const group of defectorsByRow) {
                events.push({
                  userId,
                  eraId: row.currentEraId,
                  kind: 'ABANDON',
                  unitType:
                    group.unitType as Prisma.DesertionEventCreateManyInput['unitType'],
                  unitLevel: group.unitLevel,
                  quantity: group.quantity,
                });
                summary.abandoned += group.quantity;
              }
            }
          }
        } else if (row.desertion_floor !== null) {
          // Morale at or above the threshold: the floor ratchets UP to the
          // current trained army, so a genuinely rebuilt army keeps a
          // meaningful 25% guarantee. It never falls within the era.
          const armyNow = row.UserUnit.filter(
            (candidate) =>
              isTrainedUnitType(candidate.type) && candidate.quantity > 0,
          ).reduce((sum, unit) => sum + unit.quantity, 0);
          if (armyNow > row.desertion_floor) desertionFloorUpdate = armyNow;
        }
        // Morale at or above the threshold never clears the floor: it stays
        // until the era resets and only ever ratchets up (see above), capping
        // the era's total bleed at 25% of the army recorded at the first
        // crossing without re-enabling recover-and-crash bleed cycles.

        const moraleChanged = moraleAfter !== moraleBefore;
        // Always stamp the OT day key: the pass applies at most once per
        // player per day, so a retried or overlapping cron run is a no-op.
        await tx.users.update({
          where: { id: userId },
          data: {
            kingdom_morale: moraleAfter,
            kingdom_morale_day: todayKey,
            ...(desertionFloorUpdate !== undefined
              ? { desertion_floor: desertionFloorUpdate }
              : {}),
          },
        });

        if (events.length > 0)
          await tx.desertionEvent.createMany({ data: events });

        if (moraleChanged || events.length > 0) {
          await tx.bank_history.create({
            data: {
              gold_amount: 0n,
              from_user_id: 0,
              from_user_account_type: 'BANK',
              to_user_id: userId,
              to_user_account_type: 'HAND',
              date_time: now,
              history_type: 'KINGDOM_MORALE',
              stats: {
                moraleBefore,
                moraleAfter,
                moraleDelta: moraleAfter - moraleBefore,
                rule,
                ...(brokeMercenaryUpkeep ? { brokeMercenaryUpkeep: true } : {}),
                citizensLost: summary.citizensLost,
                trainedDeserted: summary.trainedDeserted,
                defected: summary.defected,
                abandoned: summary.abandoned,
                mercenariesLost: summary.mercenariesLost,
                ...(events.length > 0
                  ? { message: desertionSummaryMessage(summary) }
                  : {}),
              },
            },
          });
        }

        return 'success' as const;
      }, MORALE_TX_OPTIONS);
    } catch (error) {
      logError(`Daily kingdom morale pass failed for user ${userId}`, {
        error,
      });
      outcome = 'failed';
    }

    // Defector-farming cheat signal (#205): evaluated AFTER the pass
    // commits, on plain prisma. A failed statement inside the pass's own
    // transaction would abort it on Postgres and roll the whole day's
    // morale effects back with it, so detection must live outside; it
    // re-reads the committed desertionEvent rows instead. A re-run of the
    // pass on the same OT day (which returns 'stale') still reaches here,
    // so a detection that failed after a committed pass is re-evaluated on
    // the retry, and the per-pair dedupe keeps that re-evaluation
    // idempotent. Signal only: a detection failure is logged and never
    // fails the morale pass.
    if (outcome !== 'failed') {
      try {
        await CheatDetectionService.detectDefectorFarming(userId, now);
      } catch (error) {
        logError(`Defector farming detection failed for user ${userId}`, {
          error,
        });
      }
    }
    return outcome;
  }

  /**
   * Fresh-read eligibility of one candidate defector recipient: era-current,
   * active, not sanctioned/vacationing, not still protected as a new player,
   * sharing no alliance with the loser — and not the loser itself. Used both
   * to pick a recipient and to re-validate one after its row is locked.
   */
  private static async isEligibleDefectorRecipient(
    tx: Tx,
    userId: number,
    candidateId: number,
    context: DailyKingdomMoraleContext,
    now: Date,
  ): Promise<boolean> {
    const attacker = await tx.users.findUnique({
      where: { id: candidateId },
      select: {
        id: true,
        currentEraId: true,
        last_active: true,
        experience: true,
        house_level: true,
        era_joined_at: true,
        created_at: true,
        event_citizens_received: true,
        UserUnit: { where: { isMercenary: false } },
      },
    });
    if (!attacker || attacker.currentEraId !== context.era?.id) return false;
    if (
      !attacker.last_active ||
      attacker.last_active.getTime() <
        now.getTime() - DEFECTOR_RECIPIENT_ACTIVE_HOURS * HOUR_MS
    )
      return false;
    if ((await getActiveAccountStatus(candidateId, tx)) !== null) return false;
    if (
      getProtectionStatus(
        {
          experience: attacker.experience,
          population: attacker.UserUnit.reduce(
            (sum, unit) => sum + unit.quantity,
            0,
          ),
          houseLevel: attacker.house_level,
          eraJoinedAt: attacker.era_joined_at,
          createdAt: attacker.created_at,
          eventCitizensReceived: attacker.event_citizens_received,
        },
        context.era,
        context.settings,
      ).protected
    )
      return false;
    const sharedAlliance = await tx.alliance_memberships.findFirst({
      where: {
        user_id: candidateId,
        alliance: { members: { some: { user_id: userId } } },
      },
      select: { id: true },
    });
    if (sharedAlliance) return false;
    return true;
  }

  /**
   * The eligible player who attacked `userId` most within the defector window
   * (ties broken by the most recent attack), provided they are active,
   * era-current, not sanctioned/vacationing, not still protected as a new
   * player, share no alliance with the loser — and are not the loser itself.
   * The candidate list is bounded; the FIRST eligible candidate wins, so a
   * few ineligible top attackers cannot exhaust the search.
   */
  private static async findDefectorRecipient(
    tx: Tx,
    userId: number,
    context: DailyKingdomMoraleContext,
    now: Date,
  ): Promise<{ id: number } | null> {
    const candidates = await tx.attack_log.groupBy({
      by: ['attacker_id'],
      _count: { attacker_id: true },
      _max: { timestamp: true },
      where: {
        defender_id: userId,
        type: 'attack',
        // A kingdom never receives its own defectors.
        attacker_id: { not: userId },
        timestamp: {
          gte: new Date(now.getTime() - DEFECTOR_ATTACK_WINDOW_HOURS * HOUR_MS),
        },
      },
      orderBy: [
        { _count: { attacker_id: 'desc' } },
        { _max: { timestamp: 'desc' } },
      ],
      take: DEFECTOR_RECIPIENT_CANDIDATE_LIMIT,
    });
    for (const candidate of candidates) {
      if (
        await this.isEligibleDefectorRecipient(
          tx,
          userId,
          candidate.attacker_id,
          context,
          now,
        )
      ) {
        return { id: candidate.attacker_id };
      }
    }
    return null;
  }
}
