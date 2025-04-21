// --- File: src/pages/structures/armory/[tab].tsx ---

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, useMemo } from 'react';

import NewItemSection from '@/components/newItemSection';
import { ArmoryUpgrades, ItemTypes } from '@/constants';
import { useUser } from '@/context/users';
import { alertService } from '@/services';
import toLocale, { stringifyObj } from '@/utils/numberFormatting';
import { Group, Paper, rem, SimpleGrid, Tabs, ThemeIcon, Text, Space, Button, Box } from '@mantine/core'; // Keep Box
import UserModel from '@/models/Users';
import { BiCoinStack, BiSolidBank, BiMoney } from 'react-icons/bi';
import { faPeopleGroup } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import MainArea from '@/components/MainArea';
import RpgAwesomeIcon from '@/components/RpgAwesomeIcon';
import { logError } from '@/utils/logger';
import StatCard from '@/components/StatCard';
import ContentCard from '@/components/ContentCard';

// --- useItems Hook ---
// ... (useItems hook code remains the same) ...
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
        const filteredAndMapped = user.availableItemTypes
          .filter((unit: { usage: string; type: string; race: string; }) => unit.usage === type && unit.type === category && (unit.race === 'ALL' || unit.race === user.race))
          .map((unit: any) => itemMapFunction(unit, type, category, user, armoryLevel))
          .filter(item => item !== undefined)
          .sort((a, b) => (a?.level ?? 0) - (b?.level ?? 0));

        newItemsState[type][category] = filteredAndMapped;
      });
    });
    setItems(newItemsState);

  }, [user, armoryLevel]);

  return items;
};


// --- itemMapFunction ---
// ... (itemMapFunction code remains the same) ...
const itemMapFunction = (item: { id?: string; name?: string; level?: number; bonus?: number; type?: string; usage?: string; cost?: number; armoryLevel?: number; race?: string }, itemType: string, idPrefix: string, user: UserModel, armoryLevel: number) => {
  if (!item || !item.type || !item.usage || item.level === undefined || item.cost === undefined || item.armoryLevel === undefined) {
    return undefined;
  }

  const userItems = Array.isArray(user?.items) ? user.items : [];
  const itemId = item.id || item.name?.replace(/\s+/g, '-') || `${itemType}-${item.level}`;

  return {
    id: `${itemType}_${itemId}`,
    name: item.name || 'Unknown Item',
    bonus: item.bonus || 0,
    ownedItems: userItems.find(
      (i: { type: any; level: any; usage: any; }) =>
        i.type === item.type &&
        i.level === item.level &&
        i.usage === item.usage,
    )?.quantity || 0,
    cost: (item.cost || 0) - ((user?.priceBonus || 0) / 100) * (item.cost || 0),
    enabled: item.armoryLevel <= (armoryLevel || 0),
    level: item.level,
    type: item.type,
    usage: item.usage,
    armoryLevel: item.armoryLevel,
    fortName: ArmoryUpgrades.find((f) => f.level === item.armoryLevel)?.name,
  };
};


const ArmoryTab = (props) => {
  const router = useRouter();
  const tab = usePathname()?.split('/armory/')[1];
  const [currentPage, setCurrentPage] = useState('offense');
  const { user, forceUpdate } = useUser();
  const armoryLevel = user?.armoryLevel || 0;
  const items = useItems(user, armoryLevel);

  const [totalUnits, setTotalUnits] = useState({
    OFFENSE: 0,
    DEFENSE: 0,
    SPY: 0,
    SENTRY: 0,
  });

  const [itemCosts, setItemCosts] = useState<{ [key: string]: number }>({});

  const grandTotalCost = useMemo(() => {
    let total = 0;
    const types = ['OFFENSE', 'DEFENSE', 'SPY', 'SENTRY'];
    types.forEach(type => {
      const typeItems = items[type] || {};
      Object.values(typeItems).forEach((categoryItems: any[]) => {
        if (Array.isArray(categoryItems)) {
          categoryItems.forEach((item: any) => {
            if (item && item.id && item.cost !== undefined) {
              const quantity = itemCosts[item.id] || 0;
              const itemCostValue = Number(String(item.cost).replace(/,/g, '')) || 0;
              total += quantity * itemCostValue;
            }
          });
        }
      });
    });
    return total;
  }, [items, itemCosts]);

  useEffect(() => {
    setCurrentPage(tab || 'offense');
  }, [tab]);

  useEffect(() => {
    if (user) {
      setTotalUnits({
        OFFENSE: user.units?.reduce((acc, unit) => unit.type === 'OFFENSE' ? acc + unit.quantity : acc, 0) || 0,
        DEFENSE: user.units?.reduce((acc, unit) => unit.type === 'DEFENSE' ? acc + unit.quantity : acc, 0) || 0,
        SPY: user.units?.reduce((acc, unit) => unit.type === 'SPY' ? acc + unit.quantity : acc, 0) || 0,
        SENTRY: user.units?.reduce((acc, unit) => unit.type === 'SENTRY' ? acc + unit.quantity : acc, 0) || 0,
      });
    } else {
      setTotalUnits({ OFFENSE: 0, DEFENSE: 0, SPY: 0, SENTRY: 0 });
    }
  }, [user]);

  const resetItemCosts = useCallback(() => {
    setItemCosts({});
  }, []);

  const handleEquipAll = async () => {
    // ... (logic unchanged) ...
    if (!user) {
      alertService.error('User not found. Please try again.');
      return;
    }

    const itemsToEquipList = Object.entries(itemCosts)
      .map(([itemId, quantity]) => {
        if (quantity <= 0) return null;
        let itemDetails = null;
        const types = ['OFFENSE', 'DEFENSE', 'SPY', 'SENTRY'];
        const categories = ['WEAPON', 'HELM', 'BRACERS', 'SHIELD', 'BOOTS', 'ARMOR'];
        for (const type of types) {
          for (const category of categories) {
            const found = items[type]?.[category]?.find(i => i.id === itemId);
            if (found) { itemDetails = found; break; }
          }
          if (itemDetails) break;
        }
        if (!itemDetails || !itemDetails.enabled) return null;
        return { type: itemDetails.type, quantity, usage: itemDetails.usage, level: itemDetails.level };
      })
      .filter((item): item is { type: string; quantity: number; usage: string; level: number } => item !== null);

    if (itemsToEquipList.length === 0) {
      alertService.warn('No items selected to buy.');
      return;
    }

    try {
      const response = await fetch('/api/armory/equip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, items: itemsToEquipList }),
      });
      const data = await response.json();
      if (response.ok) {
        resetItemCosts();
        alertService.success(data.message || "Items bought successfully!");
        forceUpdate();
      } else {
        alertService.error(data.error || "Failed to buy items.");
      }
    } catch (error) {
      alertService.error('Failed to buy items. Please try again.');
      logError('Error while buying from Armory', error);
    }
  };

  const handleUnequipAll = async () => {
    // ... (logic unchanged) ...
    if (!user) {
      alertService.error('User not found. Please try again.');
      return;
    }

    const itemsToSellList = Object.entries(itemCosts)
      .map(([itemId, quantity]) => {
        if (quantity <= 0) return null;
        let itemDetails = null;
        const types = ['OFFENSE', 'DEFENSE', 'SPY', 'SENTRY'];
        const categories = ['WEAPON', 'HELM', 'BRACERS', 'SHIELD', 'BOOTS', 'ARMOR'];
        for (const type of types) {
          for (const category of categories) {
            const found = items[type]?.[category]?.find(i => i.id === itemId);
            if (found) { itemDetails = found; break; }
          }
          if (itemDetails) break;
        }
        if (!itemDetails || !itemDetails.enabled) return null;
        const sellQuantity = Math.min(quantity, itemDetails.ownedItems || 0);
        if (sellQuantity <= 0) return null;
        return { type: itemDetails.type, quantity: sellQuantity, usage: itemDetails.usage, level: itemDetails.level };
      })
      .filter((item): item is { type: string; quantity: number; usage: string; level: number } => item !== null);


    if (itemsToSellList.length === 0) {
      alertService.info('No items selected or available to sell.');
      return;
    }

    try {
      const response = await fetch('/api/armory/unequip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, items: itemsToSellList }),
      });
      const data = await response.json();
      if (response.ok) {
        resetItemCosts();
        alertService.success(data.message || "Items sold successfully!");
        forceUpdate();
      } else {
        alertService.error(data.error || "Failed to sell items.");
      }
    } catch (error) {
      alertService.error('Failed to sell items. Please try again.');
      logError('Error while selling from Armory', error);
    }
  };


  const parentRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const footerElement = footerRef.current;
    const scrollContainer = parentRef.current;

    if (!footerElement || !scrollContainer) {
      // logDebug("Footer or Scroll Container ref not found for sticky logic.");
      return;
    };

    let lastKnownScrollPosition = 0;
    let ticking = false;
    let lastWidth = ''; // Store last calculated width

    const handleScroll = () => {
      // Prioritize scrollContainer's scroll, fallback to window
      const currentScrollTop = scrollContainer.scrollTop > 0 ? scrollContainer.scrollTop : window.scrollY;
      lastKnownScrollPosition = currentScrollTop;

      if (!ticking) {
        window.requestAnimationFrame(() => {
          // Calculate scrollable height based on the container that actually scrolls
          const scrollHeight = scrollContainer.scrollTop > 0 ? scrollContainer.scrollHeight : document.documentElement.scrollHeight;
          const clientHeight = scrollContainer.scrollTop > 0 ? scrollContainer.clientHeight : window.innerHeight;
          const scrollableHeight = scrollHeight - clientHeight;
          const footerHeight = footerElement.offsetHeight;

          const isNearBottom = lastKnownScrollPosition >= scrollableHeight - (footerHeight + 10); // Added 10px buffer

          if (isNearBottom) {
            // Use relative positioning when at the bottom
            if (footerElement.style.position !== 'relative') {
              footerElement.style.position = 'relative'; // Relative to its normal position
              footerElement.style.bottom = 'auto'; // Reset bottom
              footerElement.style.left = 'auto'; // Reset left
              footerElement.style.width = 'auto'; // Reset width
              // logDebug("Footer -> Relative");
            }
          } else {
            // Use fixed positioning when scrolling
            if (footerElement.style.position !== 'fixed') {
              footerElement.style.position = 'fixed';
              footerElement.style.bottom = '0'; // Stick to viewport bottom
              // logDebug("Footer -> Fixed");
            }
            // Calculate width based on the scroll container's current dimensions and position
            const parentRect = scrollContainer.getBoundingClientRect();
            const newWidth = `${parentRect.width}px`;
            if (lastWidth !== newWidth) { // Only update width if it changes
              footerElement.style.left = `${parentRect.left}px`;
              footerElement.style.width = newWidth;
              lastWidth = newWidth;
              // logDebug("Footer -> Fixed Width/Left Updated:", newWidth, parentRect.left);
            }
          }
          ticking = false;
        });
        ticking = true;
      }
    };

    
    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll(); // Initial check on mount

    // Optional: ResizeObserver to handle width changes when window resizes
    const resizeObserver = new ResizeObserver(() => {
      lastWidth = ''; // Force width recalculation on resize
      handleScroll();
    });
    resizeObserver.observe(scrollContainer);


    return () => {
      window.removeEventListener('scroll', handleScroll);
      resizeObserver.unobserve(scrollContainer); // Clean up observer
    };
  }, []);


  return (
    <MainArea title='Armory' ref={parentRef}>
      <SimpleGrid cols={{ base: 1, xs: 2, md: 4 }} gap="lg" verticalgap="xl">
        {/* Stat Cards */}
        <StatCard
          title="Citizens"
          value={toLocale(user?.citizens ?? 0, user?.locale)}
          icon={<FontAwesomeIcon icon={faPeopleGroup} style={{ width: rem(15), height: rem(15) }} />}
          iconPosition="right"
        />
        <StatCard
          title="Gold In Hand"
          value={toLocale(user?.gold ?? 0)}
          icon={<BiCoinStack style={{ width: rem(15), height: rem(15) }} />}
          iconPosition="right"
        />
        <StatCard
          title="Banked Gold"
          value={toLocale(user?.goldInBank ?? 0)}
          icon={<BiSolidBank style={{ width: rem(15), height: rem(15) }} />}
        />
        <StatCard
          title="Armory Level"
          value={user?.armoryLevel ?? 0}
          icon={<RpgAwesomeIcon icon="trophy" fw />}
          variant="highlight"
        />
      </SimpleGrid>

      <Space h="md" />

      <ContentCard title="Armory Options" icon={<RpgAwesomeIcon icon={'gears'} />} iconPosition="title-left">
        {/* Tabs */}
        <Tabs variant="pills" value={currentPage} onChange={(value) => {
          if (value) {
            setCurrentPage(value);
            router.push(`/structures/armory/${value}`);
          }
        }} c='brand' className="mb-2 font-medieval">
          <Tabs.List grow justify="center">
            <Tabs.Tab value="offense" color='brand'><span className="text-xl">Offense</span></Tabs.Tab>
            <Tabs.Tab value="defense" color='brand'><span className="text-xl">Defense</span></Tabs.Tab>
            <Tabs.Tab value="spy" color='brand'><span className="text-xl">Spy</span></Tabs.Tab>
            <Tabs.Tab value="sentry" color='brand'><span className="text-xl">Sentry</span></Tabs.Tab>
          </Tabs.List>
        </Tabs>
      </ContentCard>

      {/* Item Sections */}
      <Box style={{ paddingBottom: '100px' /* Add padding at the bottom of the content area */ }}>
        {['OFFENSE', 'DEFENSE', 'SPY', 'SENTRY'].map(
          (type) =>
            currentPage === type.toLowerCase() && (
              <div key={type}>
                {['WEAPON', 'HELM', 'BRACERS', 'SHIELD', 'BOOTS', 'ARMOR'].map(
                  (iType) => {
                    const categoryItems = items[type]?.[iType] || [];
                    return (
                      categoryItems.length > 0 && (
                        <NewItemSection
                          key={`${type}_${iType}`}
                          heading={`${type.charAt(0).toUpperCase() + type.slice(1).toLowerCase()} ${iType.charAt(0).toUpperCase() + iType.slice(1).toLowerCase()}`}
                          items={categoryItems}
                          units={totalUnits[type]}
                          itemCosts={itemCosts}
                          setItemCosts={setItemCosts}
                        />
                      )
                    );
                  },
                )}
              </div>
            ),
        )}
      </Box>

      {/* Footer Wrapper - Apply ref here */}
      {/* Start with relative positioning */}
      <div ref={footerRef} className="bottom-0 z-10 w-full" style={{ position: 'relative' }}>
        <ContentCard
          title="Order Summary"
          variant="highlight"
          className="border-t-2 border-yellow-600"
        >
          <div className="flex justify-between items-center">
            <div>
              <Text fw={500}>Total Cost: {toLocale(grandTotalCost)}</Text>
              <Text size="sm" c="dimmed">Total Refund: {toLocale(grandTotalCost * 0.75)}</Text>
            </div>
            <Group>
              <Button
                color="blue"
                onClick={handleEquipAll}
                disabled={grandTotalCost <= 0 || grandTotalCost > Number(user?.gold ?? 0)}
              >
                Buy All
              </Button>
              <Button
                color="red"
                onClick={handleUnequipAll}
                disabled={grandTotalCost <= 0}
              >
                Sell All
              </Button>
            </Group>
          </div>
        </ContentCard>
      </div>
    </MainArea>
  );
};

export default ArmoryTab;