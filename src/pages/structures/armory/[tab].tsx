import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import Alert from '@/components/alert';
import NewItemSection  from '@/components/newItemSection';
import { ArmoryUpgrades } from '@/constants';
import { useUser } from '@/context/users';
import { alertService } from '@/services';
import toLocale from '@/utils/numberFormatting';
import { Group, Paper, rem, SimpleGrid, Tabs, ThemeIcon, Text, Space } from '@mantine/core';
import UserModel from '@/models/Users';
import { BiCoinStack, BiSolidBank, BiMoney } from 'react-icons/bi';
import { faPeopleGroup } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import PageTemplate from '@/components/PageTemplate';

const useItems = (user: UserModel, armoryLevel: unknown) => {
  const [items, setItems] = useState({ OFFENSE: {}, DEFENSE: {}, SPY: {}, SENTRY: {} });

  useEffect(() => {
    if(!user) return;
    if (user.availableItemTypes) {
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
                .filter((unit: { usage: string; type: string; }) => unit.usage === type && unit.type === category)
                .map((unit: any) =>
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

const itemMapFunction = (item: { level: any; name: any; bonus: any; type: any; usage: any; cost: number; armoryLevel: number; }, itemType: string, idPrefix: string, user: { items: any[]; priceBonus: number; locale: string; }, armoryLevel: number) => {
  return {
    id: `${itemType}_${idPrefix}_${item.level}`,
    name: item.name,
    bonus: item.bonus,
    ownedItems:
      user?.items.find(
        (i: { type: any; level: any; usage: any; }) =>
          i.type === item.type &&
          i.level === item.level &&
          i.usage === item.usage,
      )?.quantity || 0,
    cost: item.cost - (user?.priceBonus / 100) * item.cost,
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

const ArmoryTab = (props) => {
  const router = useRouter();
  const tab = usePathname()?.split('/armory/')[1];
  const [currentPage, setCurrentPage] = useState('offense');
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
  const [totalUnits, setTotalUnits] = useState({
    OFFENSE: 0,
    DEFENSE: 0,
    SPY: 0,
    SENTRY: 0,
  });
  
  const [itemCosts, setItemCosts] = useState<{ [key: string]: number }>({});

  const calculateTotalCost = useCallback((type = 'ALL') => {
    try {
      if (type === 'ALL') {
        const offenseCost = Object.values(totalCost.OFFENSE).reduce((acc, curr) => acc + curr, 0);
        const defenseCost = Object.values(totalCost.DEFENSE).reduce((acc, curr) => acc + curr, 0);
        const spyCost = Object.values(totalCost.SPY).reduce((acc, curr) => acc + curr, 0);
        const sentryCost = Object.values(totalCost.SENTRY).reduce((acc, curr) => acc + curr, 0);
        return offenseCost + defenseCost + spyCost + sentryCost;
      }
      return Object.values(totalCost[type]).reduce((acc, curr) => acc + curr, 0);
    } catch (e) {
      console.error(e);
      return 0;
    }
  }, [totalCost]);
  useEffect(() => {
    setCurrentPage(tab || 'offense')
  }, [tab])

  useEffect(() => {
    setTotalOffenseCost(calculateTotalCost('OFFENSE'));
    setTotalDefenseCost(calculateTotalCost('DEFENSE'));
    setTotalSpyCost(calculateTotalCost('SPY'));
    setTotalSpyCost(calculateTotalCost('SENTRY'));
  }, [items, calculateTotalCost]);

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
    if (user) {
      setTotalUnits({
        OFFENSE: user.units.reduce((acc, unit) => {
          if (unit.type === 'OFFENSE') {
            return acc + unit.quantity;
          }
          return acc;
        }, 0) || 0,
        DEFENSE: user.units.reduce((acc, unit) => {
          if (unit.type === 'DEFENSE') {
            return acc + unit.quantity;
          }
          return acc;
        }, 0) || 0,
        SPY: user.units.reduce((acc, unit) => {
          if (unit.type === 'SPY') {
            return acc + unit.quantity;
          }
          return acc;
        }, 0) || 0,
        SENTRY: user.units.reduce((acc, unit) => {
          if (unit.type === 'SENTRY') {
            return acc + unit.quantity;
          }
          return acc;
        }, 0) || 0,
      });

    }
  }, [items, totalCost, user, calculateTotalCost]);

  const updateTotalCost = (section, type, cost) => {
    setTotalCost((prevTotalCost) => {
      const newTotalCost = { ...prevTotalCost };
      if (!newTotalCost[section]) newTotalCost[section] = {};
      newTotalCost[section][type] = cost;
      return newTotalCost;
    });
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
    setItemCosts({});
  }

  const handleEquipAll = async () => {
    if (!user) {
      alertService.error('User not found. Please try again.');
      return;
    }
    const itemsToUnequip = [];

    ['OFFENSE', 'DEFENSE', 'SPY', 'SENTRY'].forEach((type) => {

      Object.keys(items[type]).forEach((category) => {
        items[type][category].forEach((item: { id: any; type: any; usage: any; level: any; }) => {
          const inputElement = document.querySelector(
            `input[name="${item.id}"]`,
          ) as HTMLInputElement;
          if (inputElement) {
            if (parseInt(inputElement.value) > 0)
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
            newItems[type][category] = newItems[type][category].map((item: { ownedItems: any; }) => ({
              ...item,
              ownedItems: item.ownedItems,
            }));
            newItems[type][category].forEach((item: { id: any; }) => {
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
    if (!user) {
      alertService.error('User not found. Please try again.');
      return;
    }
    const itemsToUnequip = [];

    ['OFFENSE', 'DEFENSE', 'SPY', 'SENTRY'].forEach((type) => {
      Object.keys(items[type]).forEach((category) => {
        items[type][category].forEach((item: { id: any; ownedItems: number; type: any; usage: any; level: any; }) => {
          const inputElement = document.querySelector(
            `input[name="${item.id}"]`,
          ) as HTMLInputElement;
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
            newItems[type][category] = newItems[type][category].map((item: { ownedItems: any; }) => ({
              ...item,
              ownedItems: item.ownedItems,
            }));
            newItems[type][category].forEach((item: { id: any; }) => {
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
      alertService.error('Failed to unequip items. Please try again.');
      console.log('error', error);
    }
  };

  const parentRef = useRef(null);
  const stickyRef = useRef(null);

  useEffect(() => {
    const handleScroll = () => {
      const stickyElement = stickyRef.current;
      const parentElement = parentRef.current;
      const { bottom } = parentElement.getBoundingClientRect();
      const windowHeight = window.innerHeight;

      if (bottom <= windowHeight) {
        stickyElement.style.position = 'absolute';
        stickyElement.style.bottom = '0';
        stickyElement.style.width = '100%';
      } else {
        stickyElement.style.position = 'fixed';
        stickyElement.style.bottom = '0';
        stickyElement.style.width = '69vw';
        stickyElement.style.maxWidth = '1200px';
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, [stickyRef, parentRef]);

  return (
    <PageTemplate title="Armory">
    <div ref={parentRef} style={{ position: 'relative', paddingBottom: '50px' }}>
      <div className="my-5 flex justify-between">
        <Alert />
      </div>
      <SimpleGrid cols={{ base: 1, xs: 2, md: 4 }}>
        <Paper withBorder p="sm" radius="md">
          <Group justify="space-between">
            <Text size="lg" fw={'bold'} c="dimmed">
              Citizens
            </Text>
            <ThemeIcon c='white'>
              <FontAwesomeIcon icon={faPeopleGroup} />
            </ThemeIcon>
          </Group>

          <Group align="flex-end" gap="xs" mt={10}>
            <Text>{toLocale(user?.citizens, user?.locale)}</Text>
          </Group>
        </Paper>
        <Paper withBorder p="sm" radius="md">
          <Group justify="space-between">
            <Text size="lg" fw={'bold'} c="dimmed">
              Gold In Hand
            </Text>
            <ThemeIcon c='white'>
              <BiCoinStack style={{ width: rem(15), height: rem(15) }} />
            </ThemeIcon>
          </Group>
          <Group align="flex-end" gap="xs" mt={10}>
            <Text>{parseInt(user?.gold?.toString() ?? "0").toLocaleString()}</Text>
          </Group>
        </Paper>
        <Paper withBorder p="sm" radius="md">
          <Group justify="space-between">
            <Text size="lg" fw={'bold'} c="dimmed">
              Banked Gold
            </Text>
            <ThemeIcon c='white'>
              <BiSolidBank style={{ width: rem(15), height: rem(15) }} />
            </ThemeIcon>
          </Group>
          <Group align="flex-end" gap="xs" mt={10}>
            <Text>{parseInt(user?.goldInBank?.toString() ?? "0").toLocaleString()}</Text>
          </Group>
        </Paper>
        <Paper withBorder p="sm" radius="md">
          <Group justify="space-between">
            <Text size="lg" fw={'bold'} c="dimmed">
              Armory Level
            </Text>
            <ThemeIcon c='white'>
              <i className='ra ra-trophy'/>
            </ThemeIcon>
          </Group>

          <Group align="flex-end" gap="xs" mt={10}>
            <Text>{user?.armoryLevel}</Text>
          </Group>
        </Paper>
      </SimpleGrid>
      <Space h="md" />

      <Paper>
      <Tabs variant="pills" defaultValue={currentPage} c='brand' className="mb-2 font-medieval">
        <Tabs.List grow justify="center">
          <Tabs.Tab value="offense" onClick={() => {
            router.push("/structures/armory/offense");
          }}
            color='brand'
          >
            <span className="text-xl">Offense</span>
          </Tabs.Tab>
          <Tabs.Tab value="defense" onClick={() => { router.push("/structures/armory/defense") }}
            color='brand'
          >
            <span className="text-xl">Defense</span>
          </Tabs.Tab>
          <Tabs.Tab value="spy" onClick={() => { router.push("/structures/armory/spy") }}
            color='brand'
          >
            <span className="text-xl">Spy</span>
          </Tabs.Tab>
          <Tabs.Tab value="sentry" onClick={() => { router.push("/structures/armory/sentry") }}
            color='brand'
          >
            <span className="text-xl">Sentry</span>
          </Tabs.Tab>
        </Tabs.List>
      </Tabs>

    </Paper>

      {['OFFENSE', 'DEFENSE', 'SPY', 'SENTRY'].map(
        (type) =>
          currentPage === type.toLowerCase() && (
            <>
              {['WEAPON', 'HELM', 'BRACERS', 'SHIELD', 'BOOTS', 'ARMOR'].map(
                (iType) => {
                  const categoryItems = items[type] ? items[type][iType] : [];
                  return (
                    categoryItems?.length > 0 && (
                      <NewItemSection
                        key={`${type}_${iType}`}
                        heading={`${type.charAt(0).toUpperCase() + type.slice(1)} ${iType}`}
                        items={items[type] ? items[type][iType] : []}
                        updateTotalCost={(section, type, cost) => updateTotalCost(section.toUpperCase(), type, cost)}
                        units={totalUnits[type]}
                        itemCosts={itemCosts}
                        setItemCosts={setItemCosts}
                      />


                    )
                  );
                },
              )}

              <div
                ref={stickyRef}
                className="flex justify-between mt-8 rounded bg-gray-800"
                style={{ position: 'sticky', bottom: '0', width:"69vw", padding: '.5rem', zIndex: 10 }}
              >
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
                  <p>Total Refund: {' '}
                    {toLocale(
                      type === 'OFFENSE'
                        ? totalOffenseCost * .75
                        : type === 'DEFENSE'
                          ? totalDefenseCost * .75
                          : type === 'SPY'
                            ? totalSpyCost * .75
                            : type === 'SENTRY'
                              ? totalSentryCost * .75
                              : 0,
                    )}
                  </p>
              </div>
                <Paper  withBorder radius="md" shadow='md' className="mt-4 flex justify-between">
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
                </Paper>
                </div>
            </>
          ),
        )}
    </div>
    </PageTemplate>
  );
};

export default ArmoryTab;
