import { useEffect, useState } from 'react';

import Alert from '@/components/alert';
import ItemSection from '@/components/itemsection'; // Assuming you have a similar component for items
// Importing the WeaponTypes constant
import { useUser } from '@/context/users';

const Armory = () => {
  const [data, setData] = useState({ citizens: 0, gold: 0, goldInBank: 0 });
  const { user } = useUser();
  const [offensiveWeapons, setOffensiveWeapons] = useState(null); // Define the offensive units data here
  const [defensiveWeapons, setDefensiveWeapons] = useState(null); // Define the offensive units data here
  const [offensiveHelm, setOffensiveHelm] = useState(null);
  const [DefensiveHelm, setDefensiveHelm] = useState(null);
  const [offensiveBracers, setOffensiveBracers] = useState(null);
  const [DefensiveBracers, setDefensiveBracers] = useState(null);
  const [offensiveShield, setOffensiveShield] = useState(null);
  const [DefensiveShield, setDefensiveShield] = useState(null);
   const [offensiveBoots, setOffensiveBoots] = useState(null);
  const [DefensiveBoots, setDefensiveBoots] = useState(null);


  const itemMapFunction = (item, idPrefix: string, itemType: string) => {
    return {
      id: `${itemType}_${idPrefix}_${item.level}`,
      name: item.name,
      bonus: item.bonus,
      ownedItems:
        user.items.find(
          (i) =>
            i.type === item.type &&
            i.level === item.level &&
            i.usage === item.usage
        )?.quantity || 0,
      cost: new Intl.NumberFormat('en-GB').format(item.cost),
      enabled: item.level <= user?.fortLevel,
      level: item.level,
      usage: item.usage
    };
  };

  useEffect(() => {
    if (user && user.availableItemTypes) {
      setOffensiveWeapons(
        user.availableItemTypes
          .filter((unit) => unit.usage === 'OFFENSE' && unit.type == 'WEAPON')
          .map((unit) => itemMapFunction(unit, 'OFFENSE', 'WEAPON'))
      );
      setOffensiveHelm(
        user.availableItemTypes
          .filter((unit) => unit.usage === 'OFFENSE' && unit.type == 'HELM')
          .map((unit) => itemMapFunction(unit, 'OFFENSE', 'HELM'))
      );
      
      setOffensiveBracers(
        user.availableItemTypes
          .filter((unit) => unit.usage === 'OFFENSE' && unit.type == 'BRACERS')
          .map((unit) => itemMapFunction(unit, 'OFFENSE', 'BRACERS'))
      );
      
      setOffensiveShield(
        user.availableItemTypes
          .filter((unit) => unit.usage === 'OFFENSE' && unit.type == 'SHIELD')
          .map((unit) => itemMapFunction(unit, 'OFFENSE', 'SHIELD'))
      );
      
      setOffensiveBoots(
        user.availableItemTypes
          .filter((unit) => unit.usage === 'OFFENSE' && unit.type == 'BOOTS')
          .map((unit) => itemMapFunction(unit, 'OFFENSE', 'BOOTS'))
      );
      setDefensiveWeapons(
        user.availableItemTypes
          .filter((unit) => unit.usage === 'DEFENSE' && unit.type == 'WEAPON')
          .map((unit) => itemMapFunction(unit, 'DEFENSE', 'WEAPON'))
      );
      setDefensiveHelm(
        user.availableItemTypes
          .filter((unit) => unit.usage === 'DEFENSE' && unit.type == 'HELM')
          .map((unit) => itemMapFunction(unit, 'DEFENSE', 'HELM'))
      );
      
      setDefensiveBracers(
        user.availableItemTypes
          .filter((unit) => unit.usage === 'DEFENSE' && unit.type == 'BRACERS')
          .map((unit) => itemMapFunction(unit, 'DEFENSE', 'BRACERS'))
      );
      
      setDefensiveShield(
        user.availableItemTypes
          .filter((unit) => unit.usage === 'DEFENSE' && unit.type == 'SHIELD')
          .map((unit) => itemMapFunction(unit, 'DEFENSE', 'SHIELD'))
      );
      
      setDefensiveBoots(
        user.availableItemTypes
          .filter((unit) => unit.usage === 'DEFENSE' && unit.type == 'BOOTS')
          .map((unit) => itemMapFunction(unit, 'DEFENSE', 'BOOTS'))
      );
    }
  }, [user]);

  const handleEquip = (itemType: string) => {
    // Logic to equip items based on itemType
  };

  const handleUnequip = (itemType: string) => {
    // Logic to unequip items based on itemType
  };

  return (
    <div className="mainArea pb-10">
      <h2 className="text-2xl font-bold">Armory</h2>
      <div className="my-5 flex justify-between">
        <Alert />
      </div>
      <div className="my-5 flex justify-around">
        <p className="mb-0">
          Citizens: <span>{user?.citizens}</span>
        </p>
        <p className="mb-0">
          Gold On Hand: <span>{user?.gold}</span>
        </p>
        <p className="mb-0">
          Banked Gold: <span>{user?.goldInBank}</span>
        </p>
      </div>
      <ItemSection
        heading="Offensive Weapons"
        items={offensiveWeapons}
        onEquip={() => handleEquip('OFFENSE')}
        onUnequip={() => handleUnequip('OFFENSE')}
      />
      <ItemSection
        heading="Offensive Helm"
        items={offensiveHelm}
        onEquip={() => handleEquip('OFFENSE')}
        onUnequip={() => handleUnequip('OFFENSE')}
      />
      <ItemSection
        heading="Offensive Bracers"
        items={offensiveBracers}
        onEquip={() => handleEquip('OFFENSE')}
        onUnequip={() => handleUnequip('OFFENSE')}
      />
      <ItemSection
        heading="Offensive Shield"
        items={offensiveShield}
        onEquip={() => handleEquip('OFFENSE')}
        onUnequip={() => handleUnequip('OFFENSE')}
      />
      <ItemSection
        heading="Offensive Boots"
        items={offensiveBoots}
        onEquip={() => handleEquip('OFFENSE')}
        onUnequip={() => handleUnequip('OFFENSE')}
      />
      <ItemSection
        heading="Defensive Weapons"
        items={defensiveWeapons}
        onEquip={() => handleEquip('DEFENSE')}
        onUnequip={() => handleUnequip('DEFENSE')}
      />
      <ItemSection
        heading="Defensive Helm"
        items={DefensiveHelm}
        onEquip={() => handleEquip('DEFENSE')}
        onUnequip={() => handleUnequip('DEFENSE')}
      />
      {/* ... (Similarly, render other item sections) */}
    </div>
  );
};

export default Armory;
