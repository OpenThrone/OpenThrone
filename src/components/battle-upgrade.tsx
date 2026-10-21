import { faHammer } from '@fortawesome/free-solid-svg-icons';
import { Box, Button, Grid, Group, Text, useMantineTheme } from '@mantine/core';
import { useTranslation } from 'next-i18next';
import React, { useEffect, useState } from 'react';

import QuantityInput from '@/components/battle/QuantityInput';
import panelClasses from '@/components/game/Panels.module.css';
import { alertService } from '@/services/Alert.service';
import type { UnitProps, UnitSectionProps } from '@/types/typings';
import { getBattleUpgradeStructure } from '@/utils/battleUpgradeStructure';
import { logError } from '@/utils/logger';
import { toLocale } from '@/utils/numberFormatting';
import { structureName } from '@/utils/structureNames';
import { translateBattleUpgradeName } from '@/utils/translateGameNames';

import { useUser } from '../context/users';
import DiscountSummary from './DiscountSummary';
import { GameCard } from './game/GameCard';

type UpgradeSlotItem = UnitProps & {
  baseCost?: number;
  discountedCost?: number;
  SiegeUpgradeLevel?: number;
};

const UpgradeSlot = ({
  item,
  heading,
  itemsToEquip,
  handleInputChange,
  user,
}: {
  item: UpgradeSlotItem;
  heading: string;
  itemsToEquip: { [key: string]: number };
  handleInputChange: (unitId: string, value: number | undefined) => void;
  user: any;
}) => {
  const { t } = useTranslation('battle');
  const theme = useMantineTheme();
  const secondary = theme.colors.secondary ?? theme.colors.yellow;
  const accent = secondary[1] ?? '#e5c55a';
  const itemName = translateBattleUpgradeName(t, item.name);
  const showDiscountSummary =
    user &&
    item.baseCost !== item.discountedCost &&
    item.baseCost &&
    item.discountedCost;

  if (!item.enabled) {
    return (
      <Box className={panelClasses.insetRow} data-disabled ta="center">
        <Text c="dimmed">
          {t('upgrades.unlockedWith', {
            item: itemName,
            upgrade: structureName(
              t,
              getBattleUpgradeStructure(item.type) === 'SPY'
                ? 'spy'
                : 'offense',
              item.SiegeUpgradeLevel,
              item.SiegeUpgrade,
            ),
          })}
        </Text>
      </Box>
    );
  }

  return (
    <Group
      className={panelClasses.insetRow}
      justify="space-between"
      wrap="nowrap"
    >
      <Box style={{ flex: 1 }}>
        <Text
          fw={700}
          c="gray.3"
          style={{ textTransform: 'uppercase', letterSpacing: '0.5px' }}
        >
          {itemName}
          {Number(item.bonus) > 0 && (
            <span className="font-medieval text-xs">
              {' '}
              (+{toLocale(Number(item.bonus))} {heading})
            </span>
          )}
        </Text>
        <Group gap={6}>
          <Text size="xs" c="dimmed">
            {t('upgrades.cost')}{' '}
            <span style={{ color: accent }}>
              {t('upgrades.goldAmount', { amount: item.cost })}
            </span>
          </Text>
          {showDiscountSummary && (
            <DiscountSummary
              user={user}
              baseCost={item.baseCost}
              discountedCost={item.discountedCost}
            />
          )}
          <Text size="xs" c="dimmed">
            |
          </Text>
          <Text size="xs" c="dimmed">
            {t('upgrades.saleValue', {
              amount: toLocale(
                Number(String(item.cost).replace(/,/g, '')) * 0.75,
                user?.locale,
              ),
            })}
          </Text>
          <Text size="xs" c="dimmed">
            |
          </Text>
          <Text size="xs" c="dimmed">
            {t('upgrades.owned', {
              replace: { count: toLocale(item.ownedItems, user?.locale) },
            })}
          </Text>
        </Group>
      </Box>
      <QuantityInput
        label={t('upgrades.quantityFor', { item: itemName })}
        hideLabel
        name={`${item.type}_${item.level}`}
        value={itemsToEquip[`${item.type}_${item.level}`] || 0}
        onChange={(value) =>
          handleInputChange(`${item.type}_${item.level}`, value)
        }
      />
    </Group>
  );
};

const BattleUpgradesSection: React.FC<UnitSectionProps> = ({
  heading,
  items,
}) => {
  const { t } = useTranslation('battle');
  const { user, forceUpdate } = useUser();
  const [getItems, setItems] = useState<UpgradeSlotItem[]>(items || []);
  const [sectionEnabled, setSectionEnabled] = useState(false);
  const [itemsToEquip, setItemsToEquip] = useState<{ [key: string]: number }>(
    {},
  );
  const theme = useMantineTheme();
  const secondary = theme.colors.secondary ?? theme.colors.yellow;
  const accent = secondary[1] ?? '#e5c55a';

  useEffect(() => {
    if (items) {
      setItems((prevItems) => {
        return items.map((newItem) => {
          const oldItem = prevItems.find((o) => o.id === newItem.id);
          return oldItem
            ? {
                ...oldItem,
                ownedItems: newItem.ownedItems,
                enabled: newItem.enabled,
              }
            : newItem;
        });
      });

      setItemsToEquip((prev) => {
        const updated = { ...prev };
        for (const newItem of items) {
          if (!(newItem.id in updated)) {
            updated[newItem.id] = 0;
          }
        }
        return updated;
      });
      setSectionEnabled(items.some((item) => item.enabled));
    }
  }, [items]);

  const getSectionTotalCost = () => {
    return getItems.reduce((total, item) => {
      if (!item.enabled) return total;
      const qty = itemsToEquip[`${item.type}_${item.level}`] || 0;
      const cost = Number(String(item.cost).replace(/,/g, ''));
      return total + qty * cost;
    }, 0);
  };

  const handleInputChange = (unitId, value) => {
    const intValue = Number.parseInt(value, 10);
    if (!Number.isNaN(intValue) || typeof value === 'string') {
      setItemsToEquip((prev) => ({
        ...prev,
        [unitId]: !Number.isNaN(intValue) ? intValue : 0,
      }));
    } else {
      logError('Invalid input:', value, 'for', unitId);
    }
  };

  const handleEquip = async (operation: string) => {
    if (!getItems || getItems.length === 0) return;

    const itemsToEquipList = getItems
      .map((item) => {
        const qty = itemsToEquip[`${item.type}_${item.level}`] || 0;
        return {
          type: item.type,
          quantity: qty,
          usage: item.usage,
          level: item.level,
        };
      })
      .filter((item) => item.quantity > 0);

    if (!user) {
      alertService.error(t('training.userNotFound'));
      return;
    }
    if (itemsToEquipList.length === 0) {
      alertService.error(t('upgrades.selectItems'));
      return;
    }
    try {
      const response = await fetch('/api/battle/upgrades', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.id,
          items: itemsToEquipList,
          operation,
        }),
      });

      const data = await response.json();
      if (response.ok) {
        alertService.success(data.message);
        setItems((prevItems) => {
          return prevItems.map((item) => {
            const updatedItem = data.data.find(
              (i: UnitProps) => i.type === item.id.split('_')[0],
            );
            if (updatedItem) {
              return { ...item, ownedItems: updatedItem.quantity };
            }
            return item;
          });
        });
        setItemsToEquip((prev) => {
          const reset = { ...prev };
          getItems.forEach((item) => {
            if (item.enabled) {
              reset[`${item.type}_${item.level}`] = 0;
            }
          });
          return reset;
        });
        forceUpdate();
      } else {
        alertService.error(data.error);
      }
    } catch (error) {
      alertService.error(t('upgrades.equipFailed'));
      logError(error);
    }
  };

  return (
    <GameCard title={heading} icon={faHammer}>
      <Grid gutter="md">
        {getItems.map((item: UpgradeSlotItem) => (
          <Grid.Col span={{ base: 12 }} key={item.id}>
            <UpgradeSlot
              item={item}
              heading={heading}
              itemsToEquip={itemsToEquip}
              handleInputChange={handleInputChange}
              user={user}
            />
          </Grid.Col>
        ))}
      </Grid>
      <Box
        mt="lg"
        style={{ borderTop: '1px dashed var(--ot-line)', paddingTop: '16px' }}
      >
        <Group justify="space-between">
          <Text c="dimmed">
            {t('upgrades.totalCost')}{' '}
            <span style={{ color: accent }}>
              {t('upgrades.goldAmount', {
                amount: toLocale(getSectionTotalCost(), user?.locale),
              })}
            </span>
          </Text>
          <Group>
            <Button
              size="sm"
              disabled={!sectionEnabled}
              onClick={async () => handleEquip('buy')}
            >
              {t('labels.buy', { ns: 'common' })}
            </Button>
            <Button
              variant="default"
              size="sm"
              disabled={!sectionEnabled}
              onClick={async () => handleEquip('sell')}
            >
              {t('labels.sell', { ns: 'common' })}
            </Button>
          </Group>
        </Group>
      </Box>
    </GameCard>
  );
};

export default BattleUpgradesSection;
