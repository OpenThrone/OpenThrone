import BattleUpgradesSection from '@/components/battle-upgrade';
import DefenseUpgrade from '@/components/defenseupgrade';
import { useUser } from '@/context/users';
import toLocale from '@/utils/numberFormatting';

const Upgrades = () => {
  const { user } = useUser();
  return (
    <div className="mainArea pb-10">
      <h2>Upgrades</h2>
      <div className="my-5 flex justify-around">
        <p className="mb-0">
          Gold On Hand: <span>{toLocale(user?.gold)}</span>
        </p>
        <p className="mb-0">
          Banked Gold: <span>{toLocale(user?.goldInBank)}</span>
        </p>
      </div>
      <br />
      Offense - Steed (Only Type 2,3,4) can use War Elephants - Requires Battle
      Upgrade Level 2
      <div className="mb-4 flex justify-around">
        <BattleUpgradesSection heading='Offense' type='OFFENSE' items={user?.availableOffenseBattleUpgrades} />
      </div>
    </div>
  );
};

export default Upgrades;
