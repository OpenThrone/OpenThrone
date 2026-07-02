'use server';

import { getCached, setCached } from '@/lib/postgres-rate-limiter';
import prisma from '@/lib/prisma';
import { rateLimiter } from '@/lib/rate-limiter';
import { withAuth } from '@/middleware/auth';
import UserModel from '@/models/Users';
import { calculateStrength } from '@/utils/attackFunctions';
import { getIpAddress } from '@/utils/ipUtils';
import { stringifyObj } from '@/utils/numberFormatting';
import { getLevelFromXP } from '@/utils/utilities';

const CACHE_TTL_MS = 30_000;
const MAX_CANDIDATES = 500;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 10;

const calculateUserScore = (
  user: any,
  xp = 0.7,
  fort = 0.2,
  house = 0.1,
  unit = 0.004,
  item = 0.003,
) => {
  const unitScore = user.units
    ? user.units.map((unit) => unit.quantity).reduce((a, b) => a + b, 0)
    : 0;
  const itemScore = user.items
    ? user.items
        .map((item) => item.quantity * (item.level * 0.1))
        .reduce((a, b) => a + b, 0)
    : 0;

  return {
    total:
      xp * user.experience +
      fort * user.fort_level +
      house * user.house_level +
      unit * unitScore +
      item * itemScore,
    itemScore,
    unitScore,
  };
};

const handler = async (req, res) => {
  const userId = Number(req?.session?.user?.id || 0) || 0;
  const ip = getIpAddress(req);
  const rateLimitKey = `compareTop:${userId || 'anon'}:${ip}`;
  const allowed = await rateLimiter(rateLimitKey, {
    windowMs: RATE_LIMIT_WINDOW_MS,
    max: RATE_LIMIT_MAX,
  });
  if (!allowed) {
    return res.status(429).json({ error: 'Rate limit exceeded' });
  }

  const cached = await getCached('compareTop');
  if (cached) {
    return res.status(200).json(cached);
  }

  const candidates = await prisma.users.findMany({
    where: {
      AND: [{ id: { not: 0 } }, { last_active: { not: null } }],
    },
    orderBy: { experience: 'desc' },
    take: MAX_CANDIDATES,
  });

  candidates.forEach((user: any) => {
    const uModel = new UserModel(user);
    user.population = uModel.population;
    user.ks = calculateStrength(uModel, 'OFFENSE');
    user.ds = calculateStrength(uModel, 'DEFENSE');
    user.networth = uModel.netWorth;
  });

  const safeCandidates = stringifyObj(candidates);
  safeCandidates.forEach((user: any) => {
    user.score = calculateUserScore(user);
  });
  safeCandidates.sort((a: any, b: any) => b.score.total - a.score.total);

  const payload = safeCandidates
    .map((user: any) => ({
      id: user.id,
      level: getLevelFromXP(user.experience),
      xp: user.experience,
      displayName: user.display_name,
      score: user.score.total,
      unitScore: user.score.unitScore,
      itemScore: user.score.itemScore,
      ks: user.ks,
      ds: user.ds,
      netWorth: user.networth,
      fortLevel: user.fort_level,
      houseLevel: user.house_level,
      population: user.population,
    }))
    .slice(0, 30);

  await setCached('compareTop', payload, CACHE_TTL_MS);
  return res.status(200).json(payload);
};

export default withAuth(handler);
