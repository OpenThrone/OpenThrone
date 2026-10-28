import type { NextApiResponse } from 'next';

import {
  captorRansomShare,
  convertCostPerUnit,
  convertReadyAt,
  DUNGEON_FORT_LEVEL,
  dungeonCapacity,
  escapesAt,
  ransomPricePerUnit,
} from '@/constants/Captives';
import { FEATURE_REQUIREMENTS } from '@/constants/FeatureUnlocks';
import { Fortifications } from '@/constants/Fortifications';
import prisma from '@/lib/prisma';
import { withApiGuard } from '@/middleware/apiGuard';
import type { AuthenticatedRequest } from '@/types/api';

const guardedHandler = withApiGuard({
  methods: ['GET'],
  authMode: 'required',
  rateLimitProfile: 'public_read',
});

/** One side of the dungeon panel: a captive stack and what it would cost. */
interface DungeonCaptiveView {
  id: number;
  unitType: string;
  unitLevel: number;
  quantity: number;
  /** The other kingdom: the source for held captives, the captor for your own. */
  counterpartName: string;
  capturedAt: string;
  /** Full ransom price for the stack (paid by the source), gold as a string. */
  ransomPrice: string;
  /** The captor's half of the ransom, gold as a string. */
  ransomShare: string;
  /** Conversion cost for the stack (captor-only, null for your own troops). */
  convertCost: string | null;
  /** When the stack may first be converted (captor-only). */
  convertReadyAt: string | null;
  /** When the stack escapes home as citizens. */
  escapesAt: string;
}

/** The signed-in kingdom's dungeon, for the overview panel (#210). */
const handler = async (req: AuthenticatedRequest, res: NextApiResponse) => {
  const userId = Number(req.session?.user?.id);
  if (!Number.isSafeInteger(userId) || userId <= 0) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const user = await prisma.users.findUnique({
    where: { id: userId },
    select: {
      fort_level: true,
      economy_level: true,
      race: true,
      currentEraId: true,
    },
  });
  if (!user) return res.status(404).json({ message: 'Kingdom not found' });

  const requiredFortLevel =
    FEATURE_REQUIREMENTS.DUNGEON.fortLevel ?? DUNGEON_FORT_LEVEL;
  const requiredFortName =
    Fortifications.find((fort) => fort.level === requiredFortLevel)?.name ??
    `Fort level ${requiredFortLevel}`;
  // Only current-era rows are ever listed; the rollover clears the table.
  const eraFilter = { eraId: user.currentEraId ?? -1 };

  const [heldRows, mineRows] = await Promise.all([
    prisma.captive.findMany({
      where: { captorId: userId, ...eraFilter },
      orderBy: { capturedAt: 'desc' },
      include: { source: { select: { display_name: true } } },
    }),
    prisma.captive.findMany({
      where: { sourceId: userId, ...eraFilter },
      orderBy: { capturedAt: 'desc' },
      include: { captor: { select: { display_name: true } } },
    }),
  ]);

  const view = (
    row: (typeof heldRows)[number] | (typeof mineRows)[number],
    counterpartName: string,
    asCaptor: boolean,
  ): DungeonCaptiveView => {
    const ransomPrice =
      ransomPricePerUnit(row.unitType, row.unitLevel) * BigInt(row.quantity);
    return {
      id: row.id,
      unitType: row.unitType,
      unitLevel: row.unitLevel,
      quantity: row.quantity,
      counterpartName,
      capturedAt: row.capturedAt.toISOString(),
      ransomPrice: ransomPrice.toString(),
      ransomShare: captorRansomShare(ransomPrice).toString(),
      convertCost: asCaptor
        ? (
            convertCostPerUnit(row.unitType, row.unitLevel) *
            BigInt(row.quantity)
          ).toString()
        : null,
      convertReadyAt: asCaptor
        ? convertReadyAt(row.capturedAt).toISOString()
        : null,
      escapesAt: escapesAt(row.capturedAt).toISOString(),
    };
  };

  const held = heldRows.map((row) => view(row, row.source.display_name, true));
  const mine = mineRows.map((row) => view(row, row.captor.display_name, false));

  return res.status(200).json({
    unlocked:
      user.fort_level >= requiredFortLevel &&
      (FEATURE_REQUIREMENTS.DUNGEON.economyLevel === undefined ||
        user.economy_level >= FEATURE_REQUIREMENTS.DUNGEON.economyLevel) &&
      (!FEATURE_REQUIREMENTS.DUNGEON.race ||
        user.race?.toUpperCase() === FEATURE_REQUIREMENTS.DUNGEON.race),
    fortLevel: user.fort_level,
    requiredFortLevel,
    requiredFortName,
    capacity: dungeonCapacity(user.fort_level),
    held,
    heldTotal: held.reduce((sum, row) => sum + row.quantity, 0),
    mine,
  });
};

export default guardedHandler(handler);
