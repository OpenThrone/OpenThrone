import { useEffect, useState } from 'react';
import Alert from '@/components/alert';
import ItemSection from '@/components/itemsection';
import { ArmoryUpgrades } from '@/constants';
import { useUser } from '@/context/users';
import { useRouter } from 'next/router';
import Link from 'next/link';
import toLocale from '@/utils/numberFormatting';
const useItems = (user, armoryLevel) => {
  const [items, setItems] = useState({ OFFENSE: {}, DEFENSE: {}, SPY: {} });

  useEffect(() => {
    if (user && user.availableItemTypes) {
      console.log(user.availableItemTypes)
      const categories = ['WEAPON', 'HELM', 'BRACERS', 'SHIELD', 'BOOTS','ARMOR'];
      const types = ['OFFENSE', 'DEFENSE', 'SPY'];
      types.forEach((type) => {
        categories.forEach((category) => {
          setItems((prevItems) => ({
            ...prevItems,
            [type]: {
              ...prevItems[type],
              [category]: user.availableItemTypes
                .filter((unit) => unit.usage === type && unit.type === category)
                .map((unit) => itemMapFunction(unit, type, category, user, armoryLevel)),
            },
          }));
        });
      });
    }
  }, [user, armoryLevel]);
  console.log(items);
  return items;
};

const itemMapFunction = (item, itemType, idPrefix, user, armoryLevel) => {
  return {
    id: `${itemType}_${idPrefix}_${item.level}`,
    name: item.name,
    bonus: item.bonus,
    ownedItems:
      user?.items.find(
        (i) =>
          i.type === item.type &&
          i.level === item.level &&
          i.usage === item.usage
      )?.quantity || 0,
    cost: toLocale(item.cost - (user?.priceBonus / 100 * item.cost), user?.locale),
    enabled: item.armoryLevel <= armoryLevel,
    level: item.level,
    type: item.type,
    usage: item.usage,
    armoryLevel: item.armoryLevel,
    fortName: ArmoryUpgrades.find((f) => f.level === item.armoryLevel)?.name,
  };
};

const ArmoryTab = () => {
  const router = useRouter();
  const { tab } = router.query;
  const currentPage = tab || 'offense';
  const { user } = useUser();
  const armoryLevel = user?.armoryLevel || 0;
  const items = useItems(user, armoryLevel);
  const [totalDefenseCost, setTotalDefenseCost] = useState(0);
  const [totalOffenseCost, setTotalOffenseCost] = useState(0);
  const [totalSpyCost, setTotalSpyCost] = useState(0);
  const [totalCost, setTotalCost] = useState({
    OFFENSE: { WEAPON: 0, HELM: 0, BRACERS: 0, SHIELD: 0, BOOTS: 0, ARMOR: 0 },
    DEFENSE: { WEAPON: 0, HELM: 0, BRACERS: 0, SHIELD: 0, BOOTS: 0, ARMOR: 0 },
    SPY: { WEAPON: 0, HELM: 0, BRACERS: 0, SHIELD: 0, BOOTS: 0, ARMOR: 0 },
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
    const spyCost = Object.values(totalCost.SPY).reduce(
      (acc, curr) => acc + curr,
      0
    );
    return offenseCost + defenseCost + spyCost;
  };

  useEffect(() => {
    setTotalOffenseCost(calculateTotalCost('OFFENSE'));
    setTotalDefenseCost(calculateTotalCost('DEFENSE'));
    setTotalSpyCost(calculateTotalCost('SPY'));
  }, [items]);

  useEffect(() => {
    // Calculate the total cost for each category
    const offenseCost = Object.values(totalCost.OFFENSE).reduce((acc, curr) => acc + curr, 0);
    const defenseCost = Object.values(totalCost.DEFENSE).reduce((acc, curr) => acc + curr, 0);
    const spyCost = Object.values(totalCost.SPY).reduce((acc, curr) => acc + curr, 0);

    // Update the total costs
    setTotalOffenseCost(offenseCost);
    setTotalDefenseCost(defenseCost);
    setTotalSpyCost(spyCost);
  }, [items,totalCost]);

  const updateTotalCost = (section, item, cost) => {
    setTotalCost((prevTotalCost) => {
      const newTotalCost = { ...prevTotalCost };

      // Assuming item.cost is available
      const itemCost = cost;

      newTotalCost[section][item] = itemCost;

      return newTotalCost;
    });
  };

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
          Citizens: <span>{toLocale(user?.citizens, user?.locale)}</span>
        </p>
        <p className="mb-0">
          Gold On Hand: <span>{toLocale(user?.gold, user?.locale)}</span>
        </p>
        <p className="mb-0">
          Banked Gold: <span>{toLocale(user?.goldInBank, user?.locale)}</span>
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
          <Link href="/structures/armory/spy" className={`border border-blue-500 px-4 py-2 hover:bg-blue-500 hover:text-white ${currentPage === 'spy' ? 'bg-blue-500 text-white' : ''}`}>
            Spy
          </Link>
        </div>
      </div>
      
      {['OFFENSE', 'DEFENSE', 'SPY'].map((type) =>
        currentPage === type.toLowerCase() && (
          <>
            {['WEAPON', 'HELM', 'BRACERS', 'SHIELD', 'BOOTS', 'ARMOR'].map((iType) => (
              <ItemSection
                key={`${type}_${iType}`}
                heading={`${type.charAt(0).toUpperCase() + type.slice(1)} ${iType}`}
                items={items[type] ? items[type][iType] : []}
                onEquip={() => handleEquip(type, iType)}
                onUnequip={() => handleUnequip(type, iType)}
                updateTotalCost={(cost) => updateTotalCost(type.toUpperCase(), iType, cost)}
              />
            ))}

            <div className="mt-4">
              <p>Total Cost: {toLocale(
                type === 'OFFENSE' ? totalOffenseCost :
                  type === 'DEFENSE' ? totalDefenseCost :
                    totalSpyCost,
              )}</p>
            </div>
            <div className="mt-4 flex justify-between">
              <button
                type="button"
                className="rounded bg-blue-500 px-4 py-2 font-bold text-white hover:bg-blue-700"
                onClick={handleEquipAll}
              >
                Equip All
              </button>
              <button
                type="button"
                className="rounded bg-red-500 px-4 py-2 font-bold text-white hover:bg-red-700"
                onClick={handleUnequipAll}
              >
                Sell All
              </button>
            </div>
          </>
        )
      )}
      
    </div>
  );
};

export default ArmoryTab;
