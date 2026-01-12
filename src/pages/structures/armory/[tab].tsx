import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import NewItemSection from '@/components/newItemSection';
import { ArmoryUpgrades, ItemTypes } from '@/constants';
import { useUser } from '@/context/users';
import { alertService } from '@/services/Alert.service';
import toLocale from '@/utils/numberFormatting';
import { Group, SimpleGrid, Tabs, Text, Space, Button, Box } from '@mantine/core';
import UserModel from '@/models/Users';
import { faPeopleGroup, faCoins, faUniversity, faGavel } from '@fortawesome/free-solid-svg-icons';
import { GameCard } from '@/components/game/GameCard';
import { StatGrid } from '@/components/game/StatGrid';
import MainArea from '@/components/MainArea';

const useItems = (user: UserModel | null, armoryLevel: number) => {
  const [items, setItems] = useState<{ [key: string]: { [key: string]: any[] } }>({ OFFENSE: {}, DEFENSE: {}, SPY: {}, SENTRY: {} });
  useEffect(() => {
    if (!user || !user.availableItemTypes) {
      setItems({ OFFENSE: {}, DEFENSE: {}, SPY: {}, SENTRY: {} });
      return;
    }
    const categories = ['WEAPON', 'HELM', 'BRACERS', 'SHIELD', 'BOOTS', 'ARMOR'];
    const types = ['OFFENSE', 'DEFENSE', 'SPY', 'SENTRY'];
    const newItemsState: { [key: string]: { [key: string]: any[] } } = { OFFENSE: {}, DEFENSE: {}, SPY: {}, SENTRY: {} };
    types.forEach((type) => {
      categories.forEach((category) => {
        newItemsState[type][category] = user.availableItemTypes
          .filter((unit: any) => unit.usage === type && unit.type === category && (unit.race === 'ALL' || unit.race === user.race))
          .map((unit: any) => itemMapFunction(unit, type, user, armoryLevel))
          .filter(item => item !== undefined)
          .sort((a, b) => (a?.level ?? 0) - (b?.level ?? 0));
      });
    });
    setItems(newItemsState);
  }, [user, armoryLevel]);
  return items;
};

const itemMapFunction = (item: any, itemType: string, user: UserModel, armoryLevel: number) => {
  if (!item || !item.type || !item.usage || item.level === undefined || item.cost === undefined || item.armoryLevel === undefined) return undefined;
  const userItems = user?.items || [];
  return {
    id: `${itemType}_${item.id || item.name.replace(/\s+/g, '-')}`,
    name: item.name || 'Unknown',
    bonus: item.bonus || 0,
    ownedItems: userItems.find(i => i.type === item.type && i.level === item.level && i.usage === item.usage)?.quantity || 0,
    cost: (item.cost || 0) - ((user?.priceBonus || 0) / 100) * (item.cost || 0),
    enabled: item.armoryLevel <= armoryLevel,
    ...item
  };
};

const ArmoryTab = () => {
  const router = useRouter();
  const tab = usePathname()?.split('/armory/')[1] || 'offense';
  const { user, forceUpdate } = useUser();
  const armoryLevel = user?.armoryLevel || 0;
  const items = useItems(user, armoryLevel);
  const [itemCosts, setItemCosts] = useState<{ [key: string]: number }>({});

  const grandTotalCost = useMemo(() => {
    return Object.entries(itemCosts).reduce((total, [itemId, quantity]) => {
      if (quantity > 0) {
        for (const type in items) {
          for (const category in items[type]) {
            const item = items[type][category].find(i => i.id === itemId);
            if (item) return total + quantity * item.cost;
          }
        }
      }
      return total;
    }, 0);
  }, [items, itemCosts]);

  const handleEquipUnequip = async (action: 'equip' | 'unequip') => {
    if (!user) return;
    const itemsToProcess = Object.entries(itemCosts)
      .map(([itemId, quantity]) => {
        if (quantity <= 0) return null;
        for (const type in items) {
          for (const category in items[type]) {
            const item = items[type][category].find(i => i.id === itemId);
            if (item) return { ...item, quantity };
          }
        }
        return null;
      })
      .filter(Boolean);

    if (itemsToProcess.length === 0) return;

    try {
      const response = await fetch(`/api/armory/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, items: itemsToProcess }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      alertService.success(data.message);
      setItemCosts({});
      forceUpdate();
    } catch (error) {
      alertService.error((error as Error).message);
    }
  };
  
  const statItems = [
    { label: "Citizens", value: toLocale(user?.citizens, user?.locale), icon: faPeopleGroup },
    { label: "Gold In Hand", value: toLocale(user?.gold, user?.locale), icon: faCoins },
    { label: "Banked Gold", value: toLocale(user?.goldInBank, user?.locale), icon: faUniversity },
    { label: "Armory Level", value: user?.armoryLevel, icon: faGavel },
  ];

  return (
    <MainArea title="Armory">
      <StatGrid title="Armory Status" stats={statItems} />
      <Space h="md" />
      <Box className="rpg-inset" p="xs" style={{ borderRadius: '6px' }}>
        <Tabs value={tab} onChange={(value) => router.push(`/structures/armory/${value}`)} variant="pills" color="yellow">
          <Tabs.List grow justify="center">
            <Tabs.Tab value="offense">Offense</Tabs.Tab>
            <Tabs.Tab value="defense">Defense</Tabs.Tab>
            <Tabs.Tab value="spy">Spy</Tabs.Tab>
            <Tabs.Tab value="sentry">Sentry</Tabs.Tab>
          </Tabs.List>
        </Tabs>
      </Box>
      <Space h="md" />
      <Box style={{ paddingBottom: '100px' }}>
        {Object.entries(items[tab.toUpperCase()] || {}).map(([category, categoryItems]) => (
          categoryItems.length > 0 && <><NewItemSection key={category} heading={`${tab} ${category}`} items={categoryItems} itemCosts={itemCosts} setItemCosts={setItemCosts} units={user?.units.reduce((acc, unit) => unit.type === tab.toUpperCase() ? acc + unit.quantity : acc, 0)} /><Space h="md" /></>
        ))}
      </Box>
      <Box style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 100 }}>
        <GameCard title="Order Summary">
          <Group justify="space-between">
            <Text>Total Cost: {toLocale(grandTotalCost, user?.locale)}</Text>
            <Group>
              <Button onClick={() => handleEquipUnequip('equip')} disabled={grandTotalCost <= 0 || grandTotalCost > Number(user?.gold)}>Buy</Button>
              <Button onClick={() => handleEquipUnequip('unequip')} disabled={grandTotalCost <= 0} color="red">Sell</Button>
            </Group>
          </Group>
        </GameCard>
      </Box>
    </MainArea>
  );
};

export default ArmoryTab;
