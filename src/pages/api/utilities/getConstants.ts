import { BattleUpgrades, Fortifications, UnitTypes, levelXPArray, OffensiveUpgrades, EconomyUpgrades, SpyUpgrades, SentryUpgrades, ArmoryUpgrades, HouseUpgrades, ItemTypes } from '@/constants';
import { withAuth } from '@/middleware/auth';

const handler = async (req, res) => {
  const session = req.session;
  const { id, xtoken } = req.query;
  if (session || xtoken === 'openthrone-gsheets') {
    if (session?.user?.id !== 1 && session?.user?.id !== 2 && session?.user?.id !== id) {
      return res.status(401).json({ status: 'Not authorized' });
    }
    const forts = Fortifications
    const units = UnitTypes
    const battle_upgrades = BattleUpgrades
    const levels = levelXPArray
    const eco = EconomyUpgrades
    const offense = OffensiveUpgrades
    const spy = SpyUpgrades
    const sentry = SentryUpgrades
    const armory = ArmoryUpgrades
    const house = HouseUpgrades
    const items = ItemTypes

    return res.status(200).json(
      {
        forts: forts,
        units: units,
        items: /*{
          defense: {
            weapon: items.filter((i) => i.usage === 'DEFENSE' && i.type === 'WEAPON'),
            helm: items.filter((i) => i.usage === 'DEFENSE' && i.type === 'HELM'),
            armor: items.filter((i) => i.usage === 'DEFENSE' && i.type === 'ARMOR'),
            shield: items.filter((i) => i.usage === 'DEFENSE' && i.type === 'SHIELD'),
            boots: items.filter((i) => i.usage === 'DEFENSE' && i.type === 'BOOTS'),
            bracers: items.filter((i) => i.usage === 'DEFENSE' && i.type === 'BRACERS'),
          },
          offense: {
            weapon: items.filter((i) => i.usage === 'OFFENSE' && i.type === 'WEAPON'),
            helm: items.filter((i) => i.usage === 'OFFENSE' && i.type === 'HELM'),
            armor: items.filter((i) => i.usage === 'OFFENSE' && i.type === 'ARMOR'),
            shield: items.filter((i) => i.usage === 'OFFENSE' && i.type === 'SHIELD'),
            boots: items.filter((i) => i.usage === 'OFFENSE' && i.type === 'BOOTS'),
            bracers: items.filter((i) => i.usage === 'OFFENSE' && i.type === 'BRACERS'),
          },
          spy: {
            weapon: items.filter((i) => i.usage === 'SPY' && i.type === 'WEAPON'),
            helm: items.filter((i) => i.usage === 'SPY' && i.type === 'HELM'),
            armor: items.filter((i) => i.usage === 'SPY' && i.type === 'ARMOR'),
            shield: items.filter((i) => i.usage === 'SPY' && i.type === 'SHIELD'),
            boots: items.filter((i) => i.usage === 'SPY' && i.type === 'BOOTS'),
            bracers: items.filter((i) => i.usage === 'SPY' && i.type === 'BRACERS'),
          },
          sentry: {
            weapon: items.filter((i) => i.usage === 'SENTRY' && i.type === 'WEAPON'),
            helm: items.filter((i) => i.usage === 'SENTRY' && i.type === 'HELM'),
            armor: items.filter((i) => i.usage === 'SENTRY' && i.type === 'ARMOR'),
            shield: items.filter((i) => i.usage === 'SENTRY' && i.type === 'SHIELD'),
            boots: items.filter((i) => i.usage === 'SENTRY' && i.type === 'BOOTS'),
            bracers: items.filter((i) => i.usage === 'SENTRY' && i.type === 'BRACERS'),
          },
        }*/ items,
        battle_upgrades,
        offense,
        spy,
        sentry,
        armory,
        house,
        eco,
        levels
      });
  }
  // console.log('failed: ', session);
  return res.status(401).json({ status: 'Not logged in', req });
}

export default withAuth(handler);