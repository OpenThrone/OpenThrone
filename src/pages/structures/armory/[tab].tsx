import { useEffect, useState } from 'react';

import Alert from '@/components/alert';
import ItemSection from '@/components/itemsection'; // Assuming you have a similar component for items
import { ArmoryUpgrades, Fortifications } from '@/constants';
// Importing the WeaponTypes constant
import { useUser } from '@/context/users';
import { useRouter } from 'next/router';
import Link from 'next/link';

const ArmoryTab = () => {
  const [data, setData] = useState({ citizens: 0, gold: 0, goldInBank: 0 });
  const router = useRouter();
  const { tab } = router.query; // You can remove forceUpdate if not used
  const currentPage = tab || 'offense';
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
  const [totalDefenseCost, setTotalDefenseCost] = useState(0);
  const [totalOffenseCost, setTotalOffenseCost] = useState(0);
  const [armoryLevel, setArmoryLevel] = useState(user?.armoryLevel || 0);
  const [totalCost, setTotalCost] = useState({
    OFFENSE: {
      WEAPON: 0,
      HELM: 0,
      BRACERS: 0,
      SHIELD: 0,
      BOOTS: 0,
    },
    DEFENSE: {
      WEAPON: 0,
      HELM: 0,
      BRACERS: 0,
      SHIELD: 0,
      BOOTS: 0,
    },
  });

  const calculateTotalCost = () => {

    const offenseCost = Object.values(totalCost.OFFENSE).reduce(
      (acc, curr) => acc + curr,
      0
    );
    const defenseCost = Object.values(totalCost.DEFENSE).reduce(
      (acc, curr) => acc + curr,
      0
    );
    return offenseCost + defenseCost;
  };

  useEffect(() => {
    // Calculate the total offense cost
    const offenseCost = Object.values(totalCost.OFFENSE).reduce(
      (acc, curr) => acc + curr,
      0
    );

    // Calculate the total defense cost
    const defenseCost = Object.values(totalCost.DEFENSE).reduce(
      (acc, curr) => acc + curr,
      0
    );

    // Update the total offense and defense costs
    setTotalOffenseCost(offenseCost);
    setTotalDefenseCost(defenseCost);
  }, [totalCost]);

  const updateTotalCost = (section: string, item: string, cost: number) => {
    setTotalCost((prevTotalCost) => {
      // Create a copy of the previous total cost state
      const newTotalCost = { ...prevTotalCost };

      // Update the cost for the specified section and item
      newTotalCost[section][item] = cost;

      // Calculate the total cost for the section
      const sectionTotalCost = Object.values(newTotalCost[section]).reduce(
        (acc, curr) => acc + curr,
        0
      );

      // Update the total cost for the section
      newTotalCost[section] = {
        ...newTotalCost[section],
        [item]: cost,
      };

      return newTotalCost;
    });
  };


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
      cost: new Intl.NumberFormat('en-GB').format(item.cost - (user?.priceBonus/100 * item.cost)),
      enabled: item.armoryLevel <= armoryLevel,
      level: item.level,
      usage: item.usage,
      fortName: ArmoryUpgrades.find((f) => f.level === item.level)
        ?.name,
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

    setArmoryLevel(user?.armoryLevel || 0);
  }, [user, armoryLevel]);

  const handleEquip = (itemType: string) => {
    // Logic to equip items based on itemType
  };

  const handleUnequip = (itemType: string) => {
    // Logic to unequip items based on itemType
  };

  const handleEquipAll = () => {
    // Logic to equip all items
  };

  const handleUnequipAll = () => {
    // Logic to unequip all items
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
        <p>
          Armory Level: <span>{user?.armoryLevel}</span>
        </p>
      </div>
      <div className="mb-4 flex justify-center">
        <div className="flex space-x-2">
          <Link href="/structures/armory/offense" className={`border border-blue-500 px-4 py-2 hover:bg-blue-500 hover:text-white ${currentPage === 'offense' ? 'bg-blue-500 text-white' : ''}`}>
            Offense

          </Link>
          <Link href="/structures/armory/defense" className={`border border-blue-500 px-4 py-2 hover:bg-blue-500 hover:text-white ${currentPage === 'defense' ? 'bg-blue-500 text-white' : ''}`}>
            Defense
          </Link>
        </div>
      </div>
      {currentPage === 'offense' && (
        <>
          <div className="mt-4">
            <p>Total Cost: {new Intl.NumberFormat('en-GB').format(totalOffenseCost)}</p>
          </div>
          <ItemSection
            heading="Offensive Weapons"
            items={offensiveWeapons}
            onEquip={() => handleEquip('OFFENSE')}
            onUnequip={() => handleUnequip('OFFENSE')}
            updateTotalCost={(cost) => updateTotalCost('OFFENSE', 'WEAPON', cost)}
          />
          <ItemSection
            heading="Offensive Helm"
            items={offensiveHelm}
            onEquip={() => handleEquip('OFFENSE')}
            onUnequip={() => handleUnequip('OFFENSE')}
            updateTotalCost={(cost) => updateTotalCost('OFFENSE', 'HELM', cost)}
          />
          <ItemSection
            heading="Offensive Bracers"
            items={offensiveBracers}
            onEquip={() => handleEquip('OFFENSE')}
            onUnequip={() => handleUnequip('OFFENSE')}
            updateTotalCost={(cost) => updateTotalCost('OFFENSE', 'BRACERS', cost)}
          />
          <ItemSection
            heading="Offensive Shield"
            items={offensiveShield}
            onEquip={() => handleEquip('OFFENSE')}
            onUnequip={() => handleUnequip('OFFENSE')}
            updateTotalCost={(cost) => updateTotalCost('OFFENSE', 'SHIELD', cost)}
          />
          <ItemSection
            heading="Offensive Boots"
            items={offensiveBoots}
            onEquip={() => handleEquip('OFFENSE')}
            onUnequip={() => handleUnequip('OFFENSE')}
            updateTotalCost={(cost) => updateTotalCost('OFFENSE', 'BOOTS',cost)}
          />
          <div className="mt-4">
        <p>Total Cost: {new Intl.NumberFormat('en-GB').format(totalOffenseCost)}</p>
      </div>
      <div className="mt-4 flex justify-between">
        <button
          type="button"
          className="rounded bg-blue-500 px-4 py-2 font-bold text-white hover:bg-blue-700"
          onClick={handleEquipAll}
        >
          Train All
        </button>
        <button
          type="button"
          className="rounded bg-red-500 px-4 py-2 font-bold text-white hover:bg-red-700"
          onClick={handleUnequipAll}
        >
          Untrain All
        </button>
      </div>
        </>
      )}
      {currentPage === 'defense' && (
        <>
          <div className="mt-4">
            <p>Total Cost: {new Intl.NumberFormat('en-GB').format(totalDefenseCost)}</p>
          </div>
          <ItemSection
            heading="Defensive Weapons"
            items={defensiveWeapons}
            onEquip={() => handleEquip('DEFENSE')}
            onUnequip={() => handleUnequip('DEFENSE')}
            updateTotalCost={(cost) => updateTotalCost('DEFENSE', 'WEAPON', cost)}
          />
          <ItemSection
            heading="Defensive Helm"
            items={DefensiveHelm}
            onEquip={() => handleEquip('DEFENSE')}
            onUnequip={() => handleUnequip('DEFENSE')}
            updateTotalCost={(cost) => updateTotalCost('DEFENSE', 'HELM', cost)}
          />
          <ItemSection
            heading="Defensive Bracers"
            items={DefensiveBracers}
            onEquip={() => handleEquip('DEFENSE')}
            onUnequip={() => handleUnequip('DEFENSE')}
            updateTotalCost={(cost) => updateTotalCost('DEFENSE', 'BRACERS', cost)}
          />
          <ItemSection
            heading="Defensive Shield"
            items={DefensiveShield}
            onEquip={() => handleEquip('DEFENSE')}
            onUnequip={() => handleUnequip('DEFENSE')}
            updateTotalCost={(cost) => updateTotalCost('DEFENSE','SHIELD', cost)}
          />
          <ItemSection
            heading="Defensive Boots"
            items={DefensiveBoots}
            onEquip={() => handleEquip('DEFENSE')}
            onUnequip={() => handleUnequip('DEFENSE')}
            updateTotalCost={(cost) => updateTotalCost('DEFENSE', 'BOOTS', cost)}
          />
          <div className="mt-4">
            <p>Total Cost: {new Intl.NumberFormat('en-GB').format(totalDefenseCost)}</p>
          </div>
          <div className="mt-4 flex justify-between">
            <button
              type="button"
              className="rounded bg-blue-500 px-4 py-2 font-bold text-white hover:bg-blue-700"
              onClick={handleEquipAll}
            >
              Train All
            </button>
            <button
              type="button"
              className="rounded bg-red-500 px-4 py-2 font-bold text-white hover:bg-red-700"
              onClick={handleUnequipAll}
            >
              Untrain All
            </button>
          </div>
        </>
      )}
      
    </div>
  );
};

export default ArmoryTab;
