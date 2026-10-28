import {
  faCoins,
  faGavel,
  faPeopleGroup,
  faUniversity,
} from '@fortawesome/free-solid-svg-icons';
import { Badge, Box, Group, Space } from '@mantine/core';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { Fragment, useEffect, useMemo, useState } from 'react';

import { ArmoryLoadoutPlanner } from '@/components/game/ArmoryLoadoutPlanner';
import { OrderSummaryBar } from '@/components/game/OrderSummaryBar';
import { PageLoading } from '@/components/game/PageLoading';
import { StatGrid } from '@/components/game/StatGrid';
import { TabBar } from '@/components/game/TabBar';
import MainArea from '@/components/MainArea';
import NewItemSection from '@/components/newItemSection';
import { applyEventDiscount } from '@/constants/gameEvents';
import { UnitTypes } from '@/constants/Units';
import { useUser } from '@/context/users';
import { useActiveGameEvents } from '@/hooks/useActiveGameEvents';
import type UserModel from '@/models/Users';
import { alertService } from '@/services/Alert.service';
import type { Item } from '@/types/typings';
import type {
  ArmoryItem,
  ArmoryUpgradeConversion,
  ArmoryUpgradeHint,
} from '@/utils/armoryOrder';
import {
  armoryCategoryKeys,
  armorySlotReadiness,
  armoryUnitTiers,
  armoryUpgradeHint,
} from '@/utils/armoryOrder';
import { discountedItemCost, slotFloorCost } from '@/utils/armoryPricing';
import { logError } from '@/utils/logger';
import { toLocale } from '@/utils/numberFormatting';

/** Share of an item's discounted cost returned on sale (see ArmoryService.unequipItems). */
const ARMORY_SELL_REFUND_RATE = 0.75;

const useItems = (
  user: UserModel | null,
  armoryLevel: number,
  armoryDiscount: number,
) => {
  const [items, setItems] = useState<{
    [key: string]: { [key: string]: ArmoryItem[] };
  }>({ OFFENSE: {}, DEFENSE: {}, SPY: {}, SENTRY: {} });
  useEffect(() => {
    if (!user || !user.availableItemTypes) {
      setItems({ OFFENSE: {}, DEFENSE: {}, SPY: {}, SENTRY: {} });
      return;
    }
    const categories = [
      'WEAPON',
      'HELM',
      'BRACERS',
      'SHIELD',
      'BOOTS',
      'ARMOR',
    ];
    const types = ['OFFENSE', 'DEFENSE', 'SPY', 'SENTRY'];
    const newItemsState: { [key: string]: { [key: string]: ArmoryItem[] } } = {
      OFFENSE: {},
      DEFENSE: {},
      SPY: {},
      SENTRY: {},
    };
    types.forEach((type) => {
      categories.forEach((category) => {
        newItemsState[type][category] = user.availableItemTypes
          .filter(
            (unit: Item) =>
              unit.usage === type &&
              unit.type === category &&
              (unit.race === 'ALL' || unit.race === user.race),
          )
          .map((unit: Item) =>
            itemMapFunction(unit, type, user, armoryLevel, armoryDiscount),
          )
          .filter((item) => item !== undefined)
          .sort((a, b) => (a?.level ?? 0) - (b?.level ?? 0));
      });
    });
    setItems(newItemsState);
  }, [user, armoryLevel, armoryDiscount]);
  return items;
};

const itemMapFunction = (
  item: Item,
  itemType: string,
  user: UserModel,
  armoryLevel: number,
  armoryDiscount: number,
) => {
  if (
    !item ||
    !item.type ||
    !item.usage ||
    item.level === undefined ||
    item.cost === undefined ||
    item.armoryLevel === undefined
  )
    return undefined;
  const userItems = user?.items || [];
  return {
    ...item,
    id: `${itemType}_${item.id || item.name.replace(/\s+/g, '-')}`,
    name: item.name || 'Unknown',
    bonus: item.bonus || 0,
    ownedItems:
      userItems.find(
        (i) =>
          i.type === item.type &&
          i.level === item.level &&
          i.usage === item.usage,
      )?.quantity || 0,
    // A running armory discount event (#86) applies to purchases only.
    cost: applyEventDiscount(
      discountedItemCost(item.cost, user.priceBonus ?? 0),
      armoryDiscount,
    ),
    refundBaseCost: discountedItemCost(item.cost, user.priceBonus ?? 0),
    conversionValue: discountedItemCost(
      slotFloorCost(item),
      user.priceBonus ?? 0,
    ),
    enabled: item.armoryLevel <= armoryLevel,
  };
};

const ArmoryTab = () => {
  const { t } = useTranslation('structures');
  const router = useRouter();
  const tabParam = Array.isArray(router.query.tab)
    ? router.query.tab[0]
    : router.query.tab;
  const tab = tabParam || 'offense';
  const { user, forceUpdate } = useUser();
  const armoryLevel = user?.armoryLevel || 0;
  const {
    modifiers: { armoryCostDiscountPercent },
  } = useActiveGameEvents();
  const items = useItems(user, armoryLevel, armoryCostDiscountPercent);
  const [itemCosts, setItemCosts] = useState<{ [key: string]: number }>({});

  const [pendingAction, setPendingAction] = useState<
    'equip' | 'unequip' | 'upgrade' | null
  >(null);

  const itemsById = useMemo(() => {
    const lookup = new Map<string, ArmoryItem>();
    Object.values(items).forEach((categories) =>
      Object.values(categories).forEach((categoryItems) =>
        categoryItems.forEach((item) => {
          if (!lookup.has(item.id)) lookup.set(item.id, item);
        }),
      ),
    );
    return lookup;
  }, [items]);

  /** Pending buys and sells across every tab and section, priced like the API. */
  const { grandTotalCost, grandTotalRefund } = useMemo(() => {
    let cost = 0;
    let refund = 0;
    Object.entries(itemCosts).forEach(([itemId, quantity]) => {
      const item = itemsById.get(itemId);
      if (!item || quantity <= 0) return;
      const unitCost = Number(item.cost) || 0;
      cost += quantity * unitCost;
      const sellable = Math.min(quantity, item.ownedItems || 0);
      refund += Math.floor(
        (item.refundBaseCost ?? unitCost) * sellable * ARMORY_SELL_REFUND_RATE,
      );
    });
    return { grandTotalCost: cost, grandTotalRefund: refund };
  }, [itemsById, itemCosts]);

  const handleEquipUnequip = async (action: 'equip' | 'unequip') => {
    if (!user || pendingAction) return;
    const itemsToProcess = Object.entries(itemCosts)
      .map(([itemId, quantity]) => {
        const item = itemsById.get(itemId);
        if (!item || quantity <= 0) return null;
        if (action === 'equip') {
          return item.enabled ? { ...item, quantity } : null;
        }
        const sellable = Math.min(quantity, item.ownedItems || 0);
        return sellable > 0 ? { ...item, quantity: sellable } : null;
      })
      .filter(Boolean);

    if (itemsToProcess.length === 0) {
      alertService.info(
        t(action === 'equip' ? 'armory.noItemsToBuy' : 'armory.noItemsToSell'),
      );
      return;
    }

    setPendingAction(action);
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
      logError('Armory order failed', { action, error });
      alertService.error((error as Error).message);
    } finally {
      setPendingAction(null);
    }
  };

  const handleUpgrade = async (conversions: ArmoryUpgradeConversion[]) => {
    if (!user || pendingAction || conversions.length === 0) return;
    setPendingAction('upgrade');
    try {
      const response = await fetch('/api/armory/upgrade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          conversions: conversions.map(
            ({ fromItem, toItem, conversionAmount }) => ({
              fromItem,
              toItem,
              conversionAmount,
            }),
          ),
        }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          typeof data.error === 'string'
            ? data.error
            : t('armory.upgradeFailed'),
        );
      alertService.success(t('armory.upgradeSuccess'));
      forceUpdate();
    } catch (error) {
      logError('Armory upgrade failed', { error });
      alertService.error(
        error instanceof Error ? error.message : t('armory.upgradeFailed'),
      );
    } finally {
      setPendingAction(null);
    }
  };

  const hasOrder = Object.values(itemCosts).some((quantity) => quantity > 0);
  const hasBuyOrder = Object.entries(itemCosts).some(
    ([id, quantity]) => quantity > 0 && itemsById.get(id)?.enabled,
  );
  const hasSellOrder = Object.entries(itemCosts).some(
    ([id, quantity]) =>
      quantity > 0 && (itemsById.get(id)?.ownedItems ?? 0) > 0,
  );
  const allItems = useMemo(() => Array.from(itemsById.values()), [itemsById]);
  const categories = items[tab.toUpperCase()] || {};
  const units =
    user?.units.reduce(
      (total, unit) =>
        unit.type === tab.toUpperCase() ? total + unit.quantity : total,
      0,
    ) ?? 0;
  const unitTiers = armoryUnitTiers(user?.units ?? [], tab.toUpperCase());
  /** Units wear items at their own level or below; gear above the top unit level is out of reach. */
  const maxUnitLevel = Math.max(
    0,
    ...UnitTypes.filter((unit) => unit.type === tab.toUpperCase()).map(
      (unit) => unit.level,
    ),
  );
  const usableCategories = Object.fromEntries(
    Object.entries(categories).map(([category, categoryItems]) => [
      category,
      categoryItems.filter((item) => item.level <= maxUnitLevel),
    ]),
  );

  if (!user) {
    return (
      <MainArea title={t('armory.title')}>
        <PageLoading stats={4} lines={4} />
      </MainArea>
    );
  }

  const slotReadiness = Object.values(categories)
    .filter((categoryItems) => categoryItems.length > 0)
    .map((categoryItems) => armorySlotReadiness(categoryItems, unitTiers));
  const completeSlots = slotReadiness.filter((slot) => slot.complete).length;
  /** The highest tier any slot of this tab can still fit, shown once rather than per section. */
  const tabHint = Object.values(categories)
    .map((categoryItems) => armoryUpgradeHint(categoryItems, unitTiers))
    .reduce<ArmoryUpgradeHint | null>(
      (best, hint) =>
        hint &&
        (!best ||
          hint.tier > best.tier ||
          (hint.tier === best.tier && hint.fits > best.fits))
          ? hint
          : best,
      null,
    );

  const statItems = [
    {
      label: t('armory.citizens'),
      value: toLocale(user?.citizens, user?.locale),
      icon: faPeopleGroup,
    },
    {
      label: t('armory.goldInHand'),
      value: toLocale(user?.gold, user?.locale),
      icon: faCoins,
    },
    {
      label: t('armory.bankedGold'),
      value: toLocale(user?.goldInBank, user?.locale),
      icon: faUniversity,
    },
    { label: t('armory.armoryLevel'), value: user?.armoryLevel, icon: faGavel },
    {
      label: t('armory.unitsFor', { tab: t(`armory.${tab}`) }),
      value: toLocale(units, user?.locale),
      icon: faPeopleGroup,
    },
    {
      label: t('armory.fullyEquippedSlots'),
      value: t('armory.slotCount', {
        complete: completeSlots,
        total: slotReadiness.length,
      }),
      icon: faGavel,
    },
  ];

  return (
    <MainArea title={t('armory.title')}>
      <StatGrid title={t('armory.status')} stats={statItems} />
      {tabHint && (
        <Group mt="sm" justify="flex-end">
          <Badge variant="light" color="yellow" radius="sm">
            {t('armory.tierUpgradeHint', {
              tier: tabHint.tier,
              units: toLocale(tabHint.fits, user?.locale),
            })}
          </Badge>
        </Group>
      )}
      <Space h="md" />
      <TabBar
        value={tab}
        tabs={[
          { value: 'offense', label: t('armory.offense') },
          { value: 'defense', label: t('armory.defense') },
          { value: 'spy', label: t('armory.spy') },
          { value: 'sentry', label: t('armory.sentry') },
        ]}
        onChange={(value) =>
          router.push(`/structures/armory/${value}`, undefined, {
            locale: router.locale,
          })
        }
      />
      <Space h="md" />
      <ArmoryLoadoutPlanner
        key={tab}
        categories={usableCategories}
        allItems={allItems}
        quantities={itemCosts}
        setQuantities={setItemCosts}
        onUpgrade={handleUpgrade}
        upgrading={pendingAction === 'upgrade'}
        units={units}
        unitTiers={unitTiers}
        gold={user?.gold ?? 0n}
        locale={user?.locale}
        disabled={Boolean(pendingAction)}
      />
      <Space h="md" />
      <Box data-tour-id="armory-panel">
        {Object.entries(items[tab.toUpperCase()] || {}).map(
          ([category, categoryItems]) =>
            categoryItems.length > 0 && (
              <Fragment key={category}>
                <NewItemSection
                  heading={`${t(`armory.${tab}`)} ${t(`armory.${armoryCategoryKeys[category] ?? 'weapons'}`)}`}
                  items={categoryItems}
                  itemCosts={itemCosts}
                  setItemCosts={setItemCosts}
                  unitTiers={unitTiers}
                  maxUnitLevel={maxUnitLevel}
                  allItems={allItems}
                  disabled={Boolean(pendingAction)}
                />
                <Space h="md" />
              </Fragment>
            ),
        )}
      </Box>
      <OrderSummaryBar
        visible={hasOrder}
        title={t('armory.orderSummary')}
        totalCostLabel={t('armory.totalCost')}
        totalCost={grandTotalCost}
        refundLabel={t('armory.refund')}
        refund={grandTotalRefund}
        primaryAction={{
          label: t('armory.buy'),
          onClick: () => handleEquipUnequip('equip'),
          disabled:
            Boolean(pendingAction) ||
            !hasBuyOrder ||
            BigInt(Math.ceil(grandTotalCost)) > BigInt(user?.gold ?? 0),
          loading: pendingAction === 'equip',
          testId: 'armory-buy-button',
        }}
        secondaryAction={{
          label: t('armory.sell'),
          onClick: () => handleEquipUnequip('unequip'),
          disabled: Boolean(pendingAction) || !hasSellOrder,
          loading: pendingAction === 'unequip',
          testId: 'armory-sell-button',
        }}
        hint={t('armory.sellWarning')}
        locale={user?.locale}
      />
    </MainArea>
  );
};

export default ArmoryTab;
