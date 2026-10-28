import type { NextApiResponse } from 'next';

import { FEATURE_REQUIREMENTS, hasFeature } from '@/constants/FeatureUnlocks';
import { Fortifications } from '@/constants/Fortifications';
import {
  REANIMATION_FORT_LEVEL,
  reanimationDailyCap,
} from '@/constants/Reanimation';
import prisma from '@/lib/prisma';
import { withApiGuard } from '@/middleware/apiGuard';
import type { AuthenticatedRequest } from '@/types/api';
import { getOTDayKey } from '@/utils/timefunctions';

const guardedHandler = withApiGuard({
  methods: ['GET'],
  authMode: 'required',
  rateLimitProfile: 'public_read',
});

/** Trained combat unit rows that make up the daily cap's army basis. */
const COMBAT_UNIT_TYPES = ['OFFENSE', 'DEFENSE', 'SPY', 'SENTRY'] as const;

/**
 * The signed-in kingdom's reanimation ledger (#211), for the overview line:
 * how many fallen rose again today against the day's cap. Only UNDEAD
 * kingdoms get numbers; every other race gets `race` back and the line never
 * renders. Before the day's first battle the cap shown is what the first
 * battle will measure: 2% of the trained combat army as it stands now.
 */
const handler = async (req: AuthenticatedRequest, res: NextApiResponse) => {
  const userId = Number(req.session?.user?.id);
  if (!Number.isSafeInteger(userId) || userId <= 0) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const user = await prisma.users.findUnique({
    where: { id: userId },
    select: {
      race: true,
      fort_level: true,
      economy_level: true,
      reanimated_today: true,
      reanimation_day: true,
      reanimation_cap: true,
    },
  });
  if (!user) return res.status(404).json({ message: 'Kingdom not found' });

  const race = user.race?.toUpperCase() ?? '';
  const requiredFortLevel =
    FEATURE_REQUIREMENTS.REANIMATION.fortLevel ?? REANIMATION_FORT_LEVEL;
  const requiredFortName =
    Fortifications.find((fort) => fort.level === requiredFortLevel)?.name ??
    null;
  const unlocked =
    race === 'UNDEAD' &&
    hasFeature(
      {
        economyLevel: user.economy_level ?? 0,
        fortLevel: user.fort_level ?? 0,
        race: user.race,
      },
      'REANIMATION',
    );

  const isToday = user.reanimation_day === getOTDayKey();
  let dailyCap: number;
  if (isToday) {
    dailyCap = user.reanimation_cap ?? 0;
  } else {
    // No battle has raised the dead yet today: show the cap the first battle
    // will measure from the current trained combat army.
    const army = await prisma.userUnit.aggregate({
      _sum: { quantity: true },
      where: {
        userId,
        isMercenary: false,
        type: { in: [...COMBAT_UNIT_TYPES] },
      },
    });
    dailyCap = reanimationDailyCap(Number(army._sum.quantity ?? 0));
  }

  return res.status(200).json({
    race,
    unlocked,
    requiredFortLevel,
    requiredFortName,
    reanimatedToday: isToday ? user.reanimated_today : 0,
    dailyCap,
  });
};

export default guardedHandler(handler);
