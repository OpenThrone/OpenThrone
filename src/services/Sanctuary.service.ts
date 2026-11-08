import { sanctuaryDailyCap, sanctuaryRecovery } from '@/constants/RacialPerks';
import {
  deadCombatRows,
  distributeReanimation,
  type ReanimationFallenRow,
} from '@/constants/Reanimation';
import type { Prisma } from '@/lib/prisma-exports';
import { getOTDayKey } from '@/utils/timefunctions';

type Tx = Prisma.TransactionClient;
export interface SanctuaryGrant {
  type: string;
  level: number;
  quantity: number;
}

export class SanctuaryService {
  /** Called before survivor rosters are written, under the defender's lock. */
  static async recover(
    tx: Tx,
    userId: number,
    tier: number,
    fallen: ReanimationFallenRow[],
    captives: number,
    now = new Date(),
  ): Promise<SanctuaryGrant[]> {
    if (tier < 1 || tier > 4) return [];
    const rows = deadCombatRows(fallen, captives);
    const user = await tx.users.findUniqueOrThrow({
      where: { id: userId },
      select: {
        sanctuary_day: true,
        sanctuary_cap: true,
        sanctuary_recovered_today: true,
      },
    });
    const day = getOTDayKey(now);
    const fresh = user.sanctuary_day !== day;
    const army = fresh
      ? await tx.userUnit.aggregate({
          _sum: { quantity: true },
          where: {
            userId,
            isMercenary: false,
            type: { in: ['OFFENSE', 'DEFENSE', 'SPY', 'SENTRY'] },
          },
        })
      : null;
    const cap = fresh
      ? sanctuaryDailyCap(Number(army?._sum.quantity ?? 0), tier)
      : user.sanctuary_cap;
    const used = fresh ? 0 : user.sanctuary_recovered_today;
    const quantity = Math.min(
      Math.max(0, cap - used),
      sanctuaryRecovery(
        rows.reduce((sum, row) => sum + row.quantity, 0),
        tier,
      ),
    );
    const split = distributeReanimation(
      rows.map((row) => row.quantity),
      quantity,
    );
    if (fresh || quantity > 0)
      await tx.users.update({
        where: { id: userId },
        data: {
          sanctuary_day: day,
          sanctuary_cap: cap,
          sanctuary_recovered_today: used + quantity,
        },
      });
    return rows
      .map((row, i) => ({
        type: row.type,
        level: row.level,
        quantity: split[i],
      }))
      .filter((row) => row.quantity > 0);
  }

  static async apply(
    tx: Tx,
    userId: number,
    grants: SanctuaryGrant[],
  ): Promise<void> {
    for (const grant of grants) {
      const type = grant.type as Prisma.UserUnitCreateInput['type'];
      await tx.userUnit.upsert({
        where: {
          userId_type_level_isMercenary: {
            userId,
            type,
            level: grant.level,
            isMercenary: false,
          },
        },
        update: { quantity: { increment: grant.quantity } },
        create: {
          userId,
          type,
          level: grant.level,
          isMercenary: false,
          quantity: grant.quantity,
        },
      });
    }
  }
}
