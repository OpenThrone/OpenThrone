import React, { useEffect, useState } from 'react';
import type { UnitProps, UnitSectionProps } from '@/types/typings';
import toLocale from '@/utils/numberFormatting';
import { useUser } from '../context/users';
import { alertService } from '@/services/Alert.service';
import { Button, Flex, Group, NumberInput, Text, Box, useMantineTheme, Grid } from '@mantine/core';
import { logError } from '@/utils/logger';
import { GameCard } from './game/GameCard';
import { faHammer } from '@fortawesome/free-solid-svg-icons';

const UpgradeSlot = ({
  item,
  heading,
  itemsToEquip,
  handleInputChange,
  user,
}: {
  item: UnitProps;
  heading: string;
  itemsToEquip: { [key: string]: number };
  handleInputChange: (unitId: string, value: number | undefined) => void;
  user: any;
}) => {
  const theme = useMantineTheme();
  const secondary = theme.colors.secondary ?? theme.colors.yellow;
  const accent = secondary[4] ?? '#e5c55a';

  if (!item.enabled) {
    return (
      <Box
        style={{
          backgroundColor: '#0f141a',
          borderRadius: '6px',
          border: '1px solid #1f2b3b',
          boxShadow: 'inset 0 3px 6px rgba(0,0,0,0.6)',
          padding: '12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: 0.5,
        }}
      >
        <Text c="dimmed">
          {item.name} - Unlocked with {item.SiegeUpgrade}
        </Text>
      </Box>
    );
  }

  return (
    <Box
      style={{
        backgroundColor: '#0f141a',
        borderRadius: '6px',
        border: '1px solid #1f2b3b',
        boxShadow: 'inset 0 3px 6px rgba(0,0,0,0.6)',
        padding: '12px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <Box style={{ flex: 1 }}>
        <Text fw={700} c="gray.3" style={{ textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          {item.name}
          <span className='text-xs font-medieval'>
            {' '}(+{item.bonus} {heading})
          </span>
        </Text>
        <Group gap={6}>
          <Text size="xs" c="dimmed">Cost: <span style={{ color: accent }}>{toLocale(item.cost)} Gold</span></Text>
          <Text size="xs" c="dimmed">|</Text>
          <Text size="xs" c="dimmed">Sale Value: {toLocale(Number(String(item.cost).replace(/,/g, '')) * 0.75)} Gold</Text>
          <Text size="xs" c="dimmed">|</Text>
          <Text size="xs" c="dimmed">Owned: {toLocale(item.ownedItems)}</Text>
        </Group>
      </Box>
      <Group gap="xs">
        <NumberInput
          aria-labelledby={item.id}
          name={`${item.type}_${item.level}`}
          min={0}
          styles={{
            input: {
              backgroundColor: '#0b1016',
              border: '1px solid #2f3e52',
              color: accent,
              fontFamily: 'monospace',
              fontWeight: 700,
              width: '80px',
              textAlign: 'center',
              boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5)',
            },
          }}
          value={itemsToEquip[`${item.type}_${item.level}`] || 0}
          onChange={(value: number | undefined) => handleInputChange(`${item.type}_${item.level}`, value)}
          allowNegative={false}
        />
      </Group>
    </Box>
  );
};

const BattleUpgradesSection: React.FC<UnitSectionProps> = ({
  heading,
  items,
}) => {
  const { user, forceUpdate } = useUser();
  const [getItems, setItems] = useState<UnitProps[]>(items || []);
  const [sectionEnabled, setSectionEnabled] = useState(false);
  const [itemsToEquip, setItemsToEquip] = useState<{ [key: string]: number }>({});
  const theme = useMantineTheme();
  const secondary = theme.colors.secondary ?? theme.colors.yellow;
  const accent = secondary[4] ?? '#e5c55a';
  const accentDark = secondary[6] ?? accent;

  useEffect(() => {
    if (items) {
      setItems(prevItems => {
        return items.map(newItem => {
          const oldItem = prevItems.find(o => o.id === newItem.id);
          return oldItem
            ? { ...oldItem, ownedItems: newItem.ownedItems, enabled: newItem.enabled }
            : newItem;
        });
      });
  
      setItemsToEquip(prev => {
        const updated = { ...prev };
        for (const newItem of items) {
          if (!(newItem.id in updated)) {
            updated[newItem.id] = 0;
          }
        }
        return updated;
      });
      setSectionEnabled(items.some(item => item.enabled));
      
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
      setItemsToEquip(prev => ({
        ...prev,
        [unitId]: !Number.isNaN(intValue)? intValue : 0,
      }));
    } else {
      logError("Invalid input:", value, "for", unitId);
    }
  };

  const handleEquip = async (operation: string) => {
    if (!getItems || getItems.length === 0) return;

    const itemsToEquipList = getItems.map((item) => {
      const qty = itemsToEquip[`${item.type}_${item.level}`] || 0;
      return {
        type: item.type,
        quantity: qty,
        usage: item.usage,
        level: item.level,
      };
    }).filter((item) => item.quantity > 0);

    if (!user) {
      alertService.error('User not found');
      return;
    }
    if (itemsToEquipList.length === 0) {
      alertService.error('Please select items to equip');
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
          operation: operation,
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
      alertService.error('Failed to equip items. Please try again.');
      logError(error);
    }
  };

  return (
    <GameCard title={heading} icon={faHammer}>
      <Grid gutter="md">
        {getItems.map((item: UnitProps) => (
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
      <Box mt="lg" style={{ borderTop: '1px dashed #2f3e52', paddingTop: '16px' }}>
        <Group justify="space-between">
          <Text c="dimmed">Total Cost: <span style={{ color: accent }}>{toLocale(getSectionTotalCost(), user?.locale)} Gold</span></Text>
          <Group>
            <Button
              variant="filled"
              color="yellow"
              size="sm"
              style={{
                background: `linear-gradient(180deg, ${accent} 0%, ${accentDark} 100%)`,
                color: '#000',
                border: `1px solid ${accent}`,
                boxShadow: '0 4px 10px rgba(0,0,0,0.5)'
              }}
              disabled={!sectionEnabled}
              onClick={async () => await handleEquip('buy')}
            >
              Buy
            </Button>
            <Button
              variant="default"
              size="sm"
              style={{
                backgroundColor: '#1f2b3b',
                borderColor: '#2f3e52',
                color: '#9ca3af',
              }}
              disabled={!sectionEnabled}
              onClick={async () => await handleEquip('sell')}
            >
              Sell
            </Button>
          </Group>
        </Group>
      </Box>
    </GameCard>
  );
};

export default BattleUpgradesSection;
