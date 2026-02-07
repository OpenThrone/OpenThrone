import { timingSafeEqual } from 'crypto';

import type { NextApiResponse } from 'next';

import {
  ArmoryUpgrades,
  BattleUpgrades,
  EconomyUpgrades,
  Fortifications,
  HouseUpgrades,
  ItemTypes,
  levelXPArray,
  OffensiveUpgrades,
  SentryUpgrades,
  SpyUpgrades,
  UnitTypes,
} from '@/constants';
import { withAuth } from '@/middleware/auth';
import type { AuthenticatedRequest } from '@/types/api';

const isAuthorizedServiceToken = (token: string | undefined): boolean => {
  const expected = process.env.CONSTANTS_SERVICE_TOKEN;
  if (!expected || !token) {
    return false;
  }

  const providedBuffer = Buffer.from(token);
  const expectedBuffer = Buffer.from(expected);

  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(providedBuffer, expectedBuffer);
};

const handler = async (req: AuthenticatedRequest, res: NextApiResponse) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ status: 'Method not allowed' });
  }

  const { session } = req;
  const requestedId = Number(req.query.id);
  const xtoken =
    typeof req.query.xtoken === 'string' ? req.query.xtoken : undefined;
  const sessionUserId = session?.user?.id;
  const isAdminSession = sessionUserId === 1 || sessionUserId === 2;
  const isSelfRequest =
    !!sessionUserId &&
    (Number.isNaN(requestedId) || requestedId === Number(sessionUserId));

  if (
    (sessionUserId && (isAdminSession || isSelfRequest)) ||
    isAuthorizedServiceToken(xtoken)
  ) {
    if (
      sessionUserId &&
      !isAdminSession &&
      !Number.isNaN(requestedId) &&
      requestedId !== Number(sessionUserId)
    ) {
      return res.status(401).json({ status: 'Not authorized' });
    }
    const forts = Fortifications;
    const units = UnitTypes;
    const battle_upgrades = BattleUpgrades;
    const levels = levelXPArray;
    const eco = EconomyUpgrades;
    const offense = OffensiveUpgrades;
    const spy = SpyUpgrades;
    const sentry = SentryUpgrades;
    const armory = ArmoryUpgrades;
    const house = HouseUpgrades;
    const items = ItemTypes;

    return res.status(200).json({
      forts,
      units,
      items,
      battle_upgrades,
      offense,
      spy,
      sentry,
      armory,
      house,
      eco,
      levels,
    });
  }
  return res.status(401).json({ status: 'Not logged in' });
};

export default withAuth(handler, true);
