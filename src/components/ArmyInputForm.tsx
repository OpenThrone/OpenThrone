import React, { useState, useMemo, useCallback, forwardRef, useImperativeHandle } from 'react';
import { Table, NumberInput, Select, Title, Paper, Stack, Tabs, Grid, Text, Tooltip, Group, Button } from '@mantine/core';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faInfoCircle } from '@fortawesome/free-solid-svg-icons';
import ArmyPresets from '@/components/ArmyPresets';
import ItemsInputForm from './ItemsInputForm';
import { stringifyObj } from '@/utils/numberFormatting';
import MockUserGenerator from '@/utils/MockUserGenerator';
import { User, PlayerUnit, PlayerItem, PlayerBattleUpgrade, UnitType, ItemType } from "@/types/typings";
import UserModel from '@/models/Users';

interface ArmyInputFormProps {
  title: string;
  armyData: User | any;
  onUpdate?: (data: User) => void;
  attacker: boolean;
}

// Convert User model to form-friendly format
const userToFormData = (user: User) => {
  const formData: any = {
    id: user.id,
    email: user.email,
    display_name: user.display_name,
    race: user.race,
    class: user.class,
    experience: user.experience,
    fortLevel: user.fort_level,
    fortHitpoints: user.fort_hitpoints,
  };

  // Process units
  user.units?.forEach((unit) => {
    formData[`${unit.type.toLowerCase()}${unit.level}`] = unit.quantity;
  });

  // Process items
  user.items?.forEach((item) => {
    formData[`item_${item.type.toLowerCase()}_${item.level}`] = item.quantity;
  });

  // Process battle upgrades
  user.battle_upgrades?.forEach((upgrade) => {
    if (upgrade.type === 'OFFENSE') {
      formData[`offenseUpgrade${upgrade.level}`] = upgrade.quantity;
    } else if (upgrade.type === 'DEFENSE') {
      formData[`defenseUpgrade${upgrade.level}`] = upgrade.quantity;
    } else if (upgrade.type === 'SENTRY') {
      formData[`sentryUpgrade${upgrade.level}`] = upgrade.quantity;
    }
  });

  // Process structure upgrades
  user.structure_upgrades?.forEach((upgrade) => {
    if (upgrade.type === 'SENTRY') {
      formData.sentryUpgrade = upgrade.level;
    }
  });

  return formData;
};

// Convert form data back to User model
const formDataToUser = (formData: any): User => {
  const generator = new MockUserGenerator();
  
  // Set basic info
  generator.setBasicInfo({
    email: formData.email || 'user@example.com',
    display_name: formData.display_name || 'User',
    race: formData.race || 'HUMAN',
    class: formData.class || 'FIGHTER'
  });

  // Add units
  const units: PlayerUnit[] = [];
  ['offense', 'defense', 'citizen', 'worker', 'spy', 'sentry'].forEach(type => {
    for (let level = 1; level <= 5; level++) {
      const key = `${type}${level}`;
      if (formData[key] && formData[key] > 0) {
        units.push({
          type: type.toUpperCase() as UnitType,
          level,
          quantity: formData[key]
        });
      }
    }
  });
  
  if (units.length > 0) {
    generator.addUnits(units);
  }

  // Add items
  const items: PlayerItem[] = [];
  Object.entries(formData).forEach(([key, value]) => {
    if (key.startsWith('item_') && value > 0) {
      const parts = key.split('_');
      const type = parts[1].toUpperCase() as ItemType;
      const level = parseInt(parts[2], 10);
      items.push({
        type,
        level,
        quantity: value as number,
        usage: getItemUsage(type)
      });
    }
  });
  
  if (items.length > 0) {
    generator.addItems(items);
  }

  // Add battle upgrades
  const battleUpgrades: PlayerBattleUpgrade[] = [];
  if (formData.offenseUpgrade1 > 0) battleUpgrades.push({ type: 'OFFENSE', level: 1, quantity: formData.offenseUpgrade1 });
  if (formData.offenseUpgrade2 > 0) battleUpgrades.push({ type: 'OFFENSE', level: 2, quantity: formData.offenseUpgrade2 });
  if (formData.defenseUpgrade1 > 0) battleUpgrades.push({ type: 'DEFENSE', level: 1, quantity: formData.defenseUpgrade1 });
  if (formData.sentryUpgrade1 > 0) battleUpgrades.push({ type: 'SENTRY', level: 1, quantity: formData.sentryUpgrade1 });
  
  if (battleUpgrades.length > 0) {
    generator.addBattleUpgrades(battleUpgrades);
  }

  // Set other properties
  if (formData.experience) generator.addExperience(formData.experience);
  if (formData.fortLevel) generator.setFortLevel(formData.fortLevel);
  if (formData.fortHitpoints) generator.setFortHitpoints(formData.fortHitpoints);
  if (formData.sentryUpgrade) generator.setSentryUpgrade(formData.sentryUpgrade);
  
  return generator.getUser();
};

// Helper function to determine item usage based on type
function getItemUsage(type: ItemType): UnitType {
  const itemTypeMap: Record<string, UnitType> = {
    'WEAPON': 'OFFENSE',
    'ARMOR': 'DEFENSE',
    'HELM': 'DEFENSE',
    'BOOTS': 'DEFENSE',
    'BRACERS': 'OFFENSE',
    'SHIELD': 'DEFENSE',
  };
  
  return itemTypeMap[type];
}

const parseItemsData = (data: any) => {
  const items: Record<string, Record<number, number>> = {};

  // Extract items from the armyData
  Object.entries(data).forEach(([key, value]) => {
    if (key.startsWith('item_') && typeof value === 'number' && value > 0) {
      const parts = key.split('_');
      const type = parts[1].toUpperCase();
      const level = parseInt(parts[2], 10);

      if (!items[type]) {
        items[type] = {};
      }

      items[type][level] = value as number;
    }
  });

  return items;
};

// Create memoized sub-components for each tab
const BasicInfoTab = React.memo(({ armyData, handleChange }: {
  armyData: any,
  handleChange: (field: string, value: any) => void
}) => (
  <Grid>
    <Grid.Col span={6}>
      <Stack>
        <Select
          label="Race"
          value={armyData.race || 'HUMAN'}
          onChange={(value) => handleChange('race', value)}
          data={[
            { value: 'HUMAN', label: 'Human' },
            { value: 'ELF', label: 'Elf' },
            { value: 'DWARF', label: 'Dwarf' },
            { value: 'ORC', label: 'Orc' },
          ]}
        />
        <Select
          label="Class"
          value={armyData.class || 'FIGHTER'}
          onChange={(value) => handleChange('class', value)}
          data={[
            { value: 'FIGHTER', label: 'Fighter' },
            { value: 'MAGE', label: 'Mage' },
            { value: 'CLERIC', label: 'Cleric' },
          ]}
        />
      </Stack>
    </Grid.Col>
    <Grid.Col span={6}>
      <Stack>
        <NumberInput
          label="Level"
          value={armyData.level || 1}
          onChange={(value) => handleChange('level', value)}
          min={1}
          max={100}
        />
        <NumberInput
          label="Experience"
          value={armyData.experience || 0}
          onChange={(value) => handleChange('experience', value)}
          min={0}
        />
      </Stack>
    </Grid.Col>
    <Grid.Col span={6}>
      <NumberInput
        label={
          <div className="flex items-center">
            Fort Level
            <Tooltip label="Affects maximum fort hitpoints and defense bonuses">
              <span className="ml-1">
                <FontAwesomeIcon icon={faInfoCircle} size="sm" />
              </span>
            </Tooltip>
          </div>
        }
        value={armyData.fortLevel || 1}
        onChange={(value) => handleChange('fortLevel', value)}
        min={1}
        max={24}
      />
    </Grid.Col>
    <Grid.Col span={6}>
      <NumberInput
        label={
          <div className="flex items-center">
            Fort Hitpoints (%)
            <Tooltip label="Current fort hitpoints as percentage of maximum">
              <span className="ml-1">
                <FontAwesomeIcon icon={faInfoCircle} size="sm" />
              </span>
            </Tooltip>
          </div>
        }
        value={armyData.fortHitpoints || 100}
        onChange={(value) => handleChange('fortHitpoints', value)}
        min={1}
        max={100}
      />
    </Grid.Col>
  </Grid>
));

BasicInfoTab.displayName = 'BasicInfoTab';

// Memoized row component for units tab
const UnitRow = React.memo(({
  unitType,
  armyData,
  handleUnitChange,
  isAttacker
}: {
  unitType: string;
  armyData: any;
  handleUnitChange: (unitType: string, level: number, value: number) => void;
  isAttacker: boolean;
}) => {
  // If isAttacker is true, only show offense units (hide other unit types)
  if (isAttacker && unitType !== 'OFFENSE') {
    return null;
  }
  
  // For WORKER and CITIZEN, only show level 1
  const maxLevel = unitType === 'WORKER' || unitType === 'CITIZEN' ? 1 : 3;
  
  return (
    <Table.Tr>
      <Table.Td>
        <Text fw={500}>{unitType.charAt(0) + unitType.slice(1).toLowerCase()}</Text>
      </Table.Td>
      
      {[1, 2, 3].map((level) => {
        // Skip rendering levels above maxLevel
        if (level > maxLevel) {
          return <Table.Td key={`${unitType}-${level}`} />;
        }
        
        return (
          <Table.Td key={`${unitType}-${level}`}>
            <NumberInput
              value={armyData[`${unitType.toLowerCase()}${level}`] || 0}
              onChange={(value) => handleUnitChange(unitType, level, value as number)}
              min={0}
              max={10000}
              step={100}
              thousandSeparator=","
            />
          </Table.Td>
        );
      })}
    </Table.Tr>
  );
});

UnitRow.displayName = 'UnitRow';

// Memoized Units tab component
const UnitsTab = React.memo(({ armyData, handleUnitChange, isAttacker }: {
  armyData: any,
  handleUnitChange: (unitType: string, level: number, value: number) => void,
  isAttacker: boolean
}) => {
  // Memoize unit types
  const unitTypes = useMemo(() => ['OFFENSE', 'DEFENSE', 'CITIZEN', 'WORKER'], []);
  
  return (
  <Table withTableBorder striped>
    <Table.Thead>
      <Table.Tr>
        <Table.Th>Unit Type</Table.Th>
        <Table.Th>Level 1</Table.Th>
        <Table.Th>Level 2</Table.Th>
        <Table.Th>Level 3</Table.Th>
      </Table.Tr>
    </Table.Thead>
    <Table.Tbody>
      {unitTypes.map((unitType) => (
        <UnitRow
          key={unitType}
          unitType={unitType}
          armyData={armyData}
          handleUnitChange={handleUnitChange}
          isAttacker={isAttacker}
        />
      ))}
    </Table.Tbody>
    </Table>
  );
});

UnitsTab.displayName = 'UnitsTab';

// Memoized Upgrades tab component
const UpgradesTab = React.memo(({ armyData, handleChange }: {
  armyData: any,
  handleChange: (field: string, value: any) => void
}) => (
  <Grid>
    <Grid.Col span={6}>
      <NumberInput
        label="Offense Upgrade Level 1"
        value={armyData.offenseUpgrade1 || 0}
        onChange={(value) => handleChange('offenseUpgrade1', value)}
        min={0}
        max={100}
      />
    </Grid.Col>
    <Grid.Col span={6}>
      <NumberInput
        label="Offense Upgrade Level 2"
        value={armyData.offenseUpgrade2 || 0}
        onChange={(value) => handleChange('offenseUpgrade2', value)}
        min={0}
        max={100}
      />
    </Grid.Col>
    <Grid.Col span={6}>
      <NumberInput
        label="Defense Upgrade Level 1"
        value={armyData.defenseUpgrade1 || 0}
        onChange={(value) => handleChange('defenseUpgrade1', value)}
        min={0}
        max={100}
      />
    </Grid.Col>
  </Grid>
));

UpgradesTab.displayName = 'UpgradesTab';

const ArmyInputForm = forwardRef<{ getFormData: () => User }, ArmyInputFormProps>(({ title, armyData, onUpdate, attacker = true }, ref) => {
    // Convert User to form-friendly format if needed
    const initialFormData = useMemo(() => {
      return 'units' in armyData ? userToFormData(armyData) : armyData;
    }, [armyData]);

    const [formData, setFormData] = useState(initialFormData);
    const [updating, setUpdating] = useState(false);
    const items = useMemo(() => parseItemsData(formData), [formData]);
  
    // Memoized handlers
    const handleChange = useCallback((field: string, value: any) => {
      setFormData(prev => {
        if (prev[field] === value) return prev;
        return { ...prev, [field]: value };
      });
    }, []);
  
    const handleUnitChange = useCallback((unitType: string, level: number, value: number) => {
      const fieldName = `${unitType.toLowerCase()}${level}`;
      setFormData(prev => {
        if (prev[fieldName] === value) return prev;
        return { ...prev, [fieldName]: value };
      });
    }, []);
  
    const handleItemsChange = useCallback((itemsData: Record<string, Record<number, number>>) => {
      setFormData(prevData => {
        // Create a new object with all non-item data
        const baseData = { ...prevData };
  
        // Remove all existing item fields
        Object.keys(baseData).forEach(key => {
          if (key.startsWith('item_')) {
            delete baseData[key];
          }
        });
  
        // Add new item fields
        Object.entries(itemsData).forEach(([type, levels]) => {
          Object.entries(levels).forEach(([level, quantity]) => {
            if (quantity > 0) {
              baseData[`item_${type.toLowerCase()}_${level}`] = quantity;
            }
          });
        });
  
        return baseData;
      });
    }, []);
  
    // Get the User model from form data
    const getUserModel = useCallback(() => {
      return formDataToUser(formData);
    }, [formData]);
  
    // Expose the getFormData method via ref
    useImperativeHandle(ref, () => ({
      getFormData: getUserModel
    }));
  
    const handleUpdate = useCallback(() => {
      if (onUpdate) {
        setUpdating(true);
        try {
          onUpdate(getUserModel());
        } finally {
          setUpdating(false);
        }
      }
    }, [getUserModel, onUpdate]);

    // Debug view of the converted User model
    const userModel = useMemo(() => getUserModel(), [getUserModel]);
  
    return (
      <Paper p="md" withBorder>
        <Group gap="apart" mb="md">
          <Title order={3}>{title}</Title>
          <Group>
            <ArmyPresets onSelect={setFormData} />
            {onUpdate && (
              <Button onClick={handleUpdate} loading={updating}>
                Update
              </Button>
            )}
          </Group>
        </Group>
        
        <Tabs defaultValue="units">
          <Tabs.List>
            <Tabs.Tab value="basic">Basic Info</Tabs.Tab>
            <Tabs.Tab value="units">Units</Tabs.Tab>
            <Tabs.Tab value="items">Items</Tabs.Tab>
            <Tabs.Tab value="upgrades">Upgrades</Tabs.Tab>
            <Tabs.Tab value="stats">Stats</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="basic" pt="xs">
            <BasicInfoTab armyData={formData} handleChange={handleChange} />
          </Tabs.Panel>

          <Tabs.Panel value="units" pt="xs">
            <UnitsTab armyData={formData}
              handleUnitChange={handleUnitChange}
              isAttacker={attacker} />
          </Tabs.Panel>

          <Tabs.Panel value="stats" pt="xs">
            <Stack>
              <Title order={5} mt="lg">Army Statistics</Title>
              {(() => {
                const userModelInstance = new UserModel(userModel);
                return (
                  <Grid>
                    <Grid.Col span={6}>
                      <Paper withBorder p="sm">
                        <Title order={6} mb="xs">Combat Strength</Title>
                        <Text><b>Offense:</b> {userModelInstance.offense.toLocaleString()}</Text>
                        <Text><b>Defense:</b> {userModelInstance.defense.toLocaleString()}</Text>
                        <Text><b>Sentry:</b> {userModelInstance.sentry.toLocaleString()}</Text>
                      </Paper>
                    </Grid.Col>
                    <Grid.Col span={6}>
                      <Paper withBorder p="sm">
                        <Title order={6} mb="xs">Army</Title>
                        <Text><b>Total Units:</b> {userModelInstance.armySize.toLocaleString()}</Text>
                      </Paper>
                    </Grid.Col>
                  </Grid>
                );
              })()}
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="upgrades" pt="xs">
            <UpgradesTab armyData={formData} handleChange={handleChange} />
          </Tabs.Panel>
        </Tabs>
      </Paper>
    );
});

ArmyInputForm.displayName = 'ArmyInputForm';
export default ArmyInputForm;