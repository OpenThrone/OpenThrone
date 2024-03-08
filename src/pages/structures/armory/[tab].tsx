import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import Alert from '@/components/alert';
import ItemSection from '@/components/itemsection';
import { ArmoryUpgrades } from '@/constants';
import { useUser } from '@/context/users';
import { alertService } from '@/services';
import toLocale from '@/utils/numberFormatting';

const useItems = (user, armoryLevel) => {
  const [items, setItems] = useState({ OFFENSE: {}, DEFENSE: {}, SPY: {} });

  useEffect(() => {
    if (user && user.availableItemTypes) {
      const categories = [
        'WEAPON',
        'HELM',
        'BRACERS',
        'SHIELD',
        'BOOTS',
        'ARMOR',
      ];
      const types = ['OFFENSE', 'DEFENSE', 'SPY', 'SENTRY'];
      types.forEach((type) => {
        categories.forEach((category) => {
          setItems((prevItems) => ({
            ...prevItems,
            [type]: {
              ...prevItems[type],
              [category]: user.availableItemTypes
                .filter((unit) => unit.usage === type && unit.type === category)
                .map((unit) =>
                  itemMapFunction(unit, type, category, user, armoryLevel),
                ),
            },
          }));
        });
      });
    }
  }, [user, armoryLevel]);
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
          i.usage === item.usage,
      )?.quantity || 0,
    cost: toLocale(
      item.cost - (user?.priceBonus / 100) * item.cost,
      user?.locale,
    ),
    enabled: item.armoryLevel <= armoryLevel,
    level: item.level,
    type: item.type,
    usage: item.usage,
    armoryLevel: item.armoryLevel,
    fortName: ArmoryUpgrades.find((f) => f.level === item.armoryLevel)?.name,
  };
};

type costProps = {
  OFFENSE: { WEAPON: number, HELM: number, BRACERS: number, SHIELD: number, BOOTS: number, ARMOR: number },
  DEFENSE: { WEAPON: number, HELM: number, BRACERS: number, SHIELD: number, BOOTS: number, ARMOR: number },
  SPY: { WEAPON: number, HELM: number, BRACERS: number, SHIELD: number, BOOTS: number, ARMOR: number },
  SENTRY: { WEAPON: number, HELM: number, BRACERS: number, SHIELD: number, BOOTS: number, ARMOR: number },
}

const ArmoryTab = () => {
  const router = useRouter();
  const tab = usePathname()?.split('/')[3];
  const currentPage = tab || 'offense';
  const { user, forceUpdate } = useUser();
  const armoryLevel = user?.armoryLevel || 0;
  const items = useItems(user, armoryLevel);
  const [totalDefenseCost, setTotalDefenseCost] = useState(0);
  const [totalOffenseCost, setTotalOffenseCost] = useState(0);
  const [totalSpyCost, setTotalSpyCost] = useState(0);
  const [totalSentryCost, setTotalSentryCost] = useState(0);
  const [totalCost, setTotalCost] = useState<costProps>({
    OFFENSE: { WEAPON: 0, HELM: 0, BRACERS: 0, SHIELD: 0, BOOTS: 0, ARMOR: 0 },
    DEFENSE: { WEAPON: 0, HELM: 0, BRACERS: 0, SHIELD: 0, BOOTS: 0, ARMOR: 0 },
    SPY: { WEAPON: 0, HELM: 0, BRACERS: 0, SHIELD: 0, BOOTS: 0, ARMOR: 0 },
    SENTRY: { WEAPON: 0, HELM: 0, BRACERS: 0, SHIELD: 0, BOOTS: 0, ARMOR: 0 },
  });
  const calculateTotalCost = (type: string = 'ALL') => {
    if (type === 'ALL') {
      const offenseCost = Object.values(totalCost.OFFENSE).reduce(
        (acc, curr) => acc + curr,
        0,
      );
      const defenseCost = Object.values(totalCost.DEFENSE).reduce(
        (acc, curr) => acc + curr,
        0,
      );
      const spyCost = Object.values(totalCost.SPY).reduce(
        (acc, curr) => acc + curr,
        0,
      );
      const sentryCost = Object.values(totalCost.SENTRY).reduce(
        (acc, curr) => acc + curr,
        0,
      );
      return offenseCost + defenseCost + spyCost + sentryCost;
    }
    return Object.values(totalCost[type]).reduce((acc, curr) => acc + curr, 0);
  };

  useEffect(() => {
    setTotalOffenseCost(calculateTotalCost('OFFENSE'));
    setTotalDefenseCost(calculateTotalCost('DEFENSE'));
    setTotalSpyCost(calculateTotalCost('SPY'));
    setTotalSpyCost(calculateTotalCost('SENTRY'));
  }, [items]);

  useEffect(() => {
    // Calculate the total cost for each category
    const offenseCost = calculateTotalCost('OFFENSE') as number;
    const defenseCost = calculateTotalCost('DEFENSE') as number;
    const spyCost = calculateTotalCost('SPY') as number;
    const sentryCost = calculateTotalCost('SENTRY') as number;

    // Update the total costs
    setTotalOffenseCost(offenseCost);
    setTotalDefenseCost(defenseCost);
    setTotalSpyCost(spyCost);
    setTotalSentryCost(sentryCost);
  }, [items, totalCost]);

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

  const resetTotalCost = () => {
    setTotalCost({
      OFFENSE: { WEAPON: 0, HELM: 0, BRACERS: 0, SHIELD: 0, BOOTS: 0, ARMOR: 0 },
      DEFENSE: { WEAPON: 0, HELM: 0, BRACERS: 0, SHIELD: 0, BOOTS: 0, ARMOR: 0 },
      SPY: { WEAPON: 0, HELM: 0, BRACERS: 0, SHIELD: 0, BOOTS: 0, ARMOR: 0 },
      SENTRY: { WEAPON: 0, HELM: 0, BRACERS: 0, SHIELD: 0, BOOTS: 0, ARMOR: 0 },
    });
    setTotalDefenseCost(0);
    setTotalOffenseCost(0);
    setTotalSpyCost(0);
    setTotalSentryCost(0);
  }

  const handleEquipAll = async () => {
    const itemsToUnequip = [];

    ['OFFENSE', 'DEFENSE', 'SPY', 'SENTRY'].forEach((type) => {
      
      Object.keys(items[type]).forEach((category) => {
        items[type][category].forEach((item) => {
          const inputElement = document.querySelector(
            `input[name="${item.id}"]`,
          ) as HTMLInputElement;
          if (inputElement) {
            if(parseInt(inputElement.value) > 0)
            itemsToUnequip.push({
              type: item.type, // Assuming item.type is already in the correct format
              quantity: inputElement.value,
              usage: item.usage,
              level: item.level,
            });  
          }
        });
      });
    });

    if (itemsToUnequip.length === 0) return;

    try {
      const response = await fetch('/api/armory/equip', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.id,
          items: itemsToUnequip,
        }),
      });

      const data = await response.json();

      if (response.ok) {

        resetTotalCost();
        alertService.success(data.message);
        const newItems = { ...items };
        ['OFFENSE', 'DEFENSE', 'SPY', 'SENTRY'].forEach((type) => {
          Object.keys(newItems[type]).forEach((category) => {
            newItems[type][category] = newItems[type][category].map((item) => ({
              ...item,
              ownedItems: item.ownedItems,
            }));
            newItems[type][category].forEach((item) => {
              const inputElement = document.querySelector(
                `input[name="${item.id}"]`,
              ) as HTMLInputElement;
              if (inputElement) {
                inputElement.value = '0';
              }
            });
          });
        });
        
        forceUpdate();
      } else {
        alertService.error(data.error);
      }
    } catch (error) {
      alertService.error('Failed to buy items. Please try again.');
      console.log('error', error);
    }
  };

  const handleUnequipAll = async () => {
    const itemsToUnequip = [];

    ['OFFENSE', 'DEFENSE', 'SPY', 'SENTRY'].forEach((type) => {
      Object.keys(items[type]).forEach((category) => {
        items[type][category].forEach((item) => {
          const inputElement = document.querySelector(
            `input[name="${item.id}"]`,
          );
          if (inputElement) {
            // No need to query the DOM since we are unequipping all
            if (item.ownedItems > 0) {
              itemsToUnequip.push({
                type: item.type, // Assuming item.type is already in the correct format
                quantity: inputElement.value,
                usage: item.usage,
                level: item.level,
              });
              console.log('itemsToUnequip', itemsToUnequip);
            }
          }
        });
      });
    });

    if (itemsToUnequip.length === 0) return;

    try {
      const response = await fetch('/api/armory/unequip', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.id,
          items: itemsToUnequip,
        }),
      });

      const data = await response.json();

      if (response.ok) {

        resetTotalCost();
        alertService.success(data.message);
        const newItems = { ...items };
        ['OFFENSE', 'DEFENSE', 'SPY', 'SENTRY'].forEach((type) => {
          Object.keys(newItems[type]).forEach((category) => {
            newItems[type][category] = newItems[type][category].map((item) => ({
              ...item,
              ownedItems: item.ownedItems,
            }));
            newItems[type][category].forEach((item) => {
              const inputElement = document.querySelector(
                `input[name="${item.id}"]`,
              );
              if (inputElement) {
                inputElement.value = '0';
              }
            });
          });
        });

        forceUpdate();
      } else {
        alertService.error(data.error);
      }
    } catch (error) {
      alertService.error('Failed to unequip items. Please try again.');
      console.log('error', error);
    }
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
          <Link
            href="/structures/armory/offense"
            className={`border border-blue-500 px-4 py-2 hover:bg-blue-500 hover:text-white ${currentPage === 'offense' ? 'bg-blue-500 text-white' : ''}`}
          >
            Offense
          </Link>
          <Link
            href="/structures/armory/defense"
            className={`border border-blue-500 px-4 py-2 hover:bg-blue-500 hover:text-white ${currentPage === 'defense' ? 'bg-blue-500 text-white' : ''}`}
          >
            Defense
          </Link>
          <Link
            href="/structures/armory/spy"
            className={`border border-blue-500 px-4 py-2 hover:bg-blue-500 hover:text-white ${currentPage === 'spy' ? 'bg-blue-500 text-white' : ''}`}
          >
            Spy
          </Link>
          <Link
            href="/structures/armory/sentry"
            className={`border border-blue-500 px-4 py-2 hover:bg-blue-500 hover:text-white ${currentPage === 'sentry' ? 'bg-blue-500 text-white' : ''}`}
          >
            Sentry
          </Link>
        </div>
      </div>

      {['OFFENSE', 'DEFENSE', 'SPY', 'SENTRY'].map(
        (type) =>
          currentPage === type.toLowerCase() && (
            <>
              {['WEAPON', 'HELM', 'BRACERS', 'SHIELD', 'BOOTS', 'ARMOR'].map(
                (iType) => {
                  const categoryItems = items[type] ? items[type][iType] : [];
                  return (
                    categoryItems?.length > 0 && (
                      <ItemSection
                        key={`${type}_${iType}`}
                        heading={`${type.charAt(0).toUpperCase() + type.slice(1)} ${iType}`}
                        items={items[type] ? items[type][iType] : []}
                        onEquip={() => handleEquip(type, iType)}
                        onUnequip={() => handleUnequip(type, iType)}
                        updateTotalCost={(cost) =>
                          updateTotalCost(type.toUpperCase(), iType, cost)
                        }
                      />
                    )
                  );
                },
              )}

              <div className="mt-4">
                <p>
                  Total Cost:{' '}
                  {toLocale(
                    type === 'OFFENSE'
                      ? totalOffenseCost
                      : type === 'DEFENSE'
                        ? totalDefenseCost
                        : type === 'SPY'
                          ? totalSpyCost
                          : type === 'SENTRY'
                            ? totalSentryCost
                            : 0,
                  )}
                </p>
              </div>
              <div className="mt-4 flex justify-between">
                <button
                  type="button"
                  className="rounded bg-blue-500 px-4 py-2 font-bold text-white hover:bg-blue-700"
                  onClick={handleEquipAll}
                >
                  Buy All
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
          ),
      )}
    </div>
  );
};

export default ArmoryTab;
