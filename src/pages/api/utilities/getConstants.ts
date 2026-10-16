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
import { withApiGuard } from '@/middleware/apiGuard';
import type { AuthenticatedRequest } from '@/types/api';
import type { ApiAuthActor } from '@/types/api-auth';

const guardedHandler = withApiGuard({
  methods: ['GET'],
  authMode: 'optional',
  allowApiToken: true,
  requiredScopes: ['constants:read'],
});

const handler = async (
  req: AuthenticatedRequest,
  res: NextApiResponse,
  context: { actor: ApiAuthActor },
) => {
  const { session } = req;
  const requestedId = Number(req.query.id);
  const sessionUserId = session?.user?.id;
  const isAdminSession = sessionUserId === 1 || sessionUserId === 2;
  const isSelfRequest =
    !!sessionUserId &&
    (Number.isNaN(requestedId) || requestedId === Number(sessionUserId));
  const isTokenActor =
    context.actor.type === 'api_client' ||
    context.actor.type === 'service_token';

  if ((sessionUserId && (isAdminSession || isSelfRequest)) || isTokenActor) {
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

export default guardedHandler(handler);
