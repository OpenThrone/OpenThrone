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

const handler = async (req, res) => {
  const { session } = req;
  const { id, xtoken } = req.query;
  if (session || xtoken === 'openthrone-gsheets') {
    if (
      session?.user?.id !== 1 &&
      session?.user?.id !== 2 &&
      session?.user?.id !== id
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
  // console.log('failed: ', session);
  return res.status(401).json({ status: 'Not logged in', req });
};

export default withAuth(handler);
