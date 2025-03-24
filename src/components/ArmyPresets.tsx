import React, { useEffect } from 'react';
import { Button, Group, Menu, Text } from '@mantine/core';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faList, faBookmark, faUser } from '@fortawesome/free-solid-svg-icons';
import { useUser } from '@/context/users';
import { User, PlayerUnit, PlayerItem, UnitType, ItemType, PlayerBattleUpgrade } from "@/types/typings";
import UserModel from '@/models/Users';
import { userModelToUser } from '@/utils/utilities';

// Conversion function: Form Fields -> User
const formFieldsToUser = (formData: any): Partial<User> => {
  if (!formData) return {};
  
  const user: Partial<User> = {
    race: formData.race || 'HUMAN',
    class: formData.class || 'FIGHTER',
    level: formData.level || 1,
    experience: formData.experience || 0,
    fort_level: formData.fortLevel || 1,
    fort_hitpoints: formData.fortHitpoints || 100,
    units: [] as PlayerUnit[],
    battle_upgrades: [] as PlayerBattleUpgrade[],
    structure_upgrades: [],
    items: [] as PlayerItem[]
  };

  // Process units from form fields
  const unitTypes = ['offense', 'defense', 'sentry', 'spy', 'citizen', 'worker'];
  unitTypes.forEach(type => {
    for (let level = 1; level <= 3; level++) {
      const fieldName = `${type}${level}`;
      if (formData[fieldName] && formData[fieldName] > 0) {
        user.units!.push({
          type: type.toUpperCase() as UnitType,
          level,
          quantity: formData[fieldName]
        });
      }
    }
  });

  // Process battle upgrades from form fields
  for (let level = 1; level <= 3; level++) {
    if (formData[`offenseUpgrade${level}`] && formData[`offenseUpgrade${level}`] > 0) {
      user.battle_upgrades!.push({
        type: 'OFFENSE',
        level,
        quantity: formData[`offenseUpgrade${level}`]
      });
    }
    if (formData[`defenseUpgrade${level}`] && formData[`defenseUpgrade${level}`] > 0) {
      user.battle_upgrades!.push({
        type: 'DEFENSE',
        level,
        quantity: formData[`defenseUpgrade${level}`]
      });
    }
    if (formData[`sentryUpgrade${level}`] && formData[`sentryUpgrade${level}`] > 0) {
      user.battle_upgrades!.push({
        type: 'SENTRY',
        level,
        quantity: formData[`sentryUpgrade${level}`]
      });
    }
  }

  // Process structure upgrades from form fields
  if (formData.sentryUpgrade && formData.sentryUpgrade > 0) {
    user.structure_upgrades!.push({
      type: 'SENTRY',
      level: formData.sentryUpgrade
    });
  }

  return user;
};

// Conversion function: User -> Form Fields
const userToFormFields = (user: User | Partial<User>): any => {
  if (!user) return {};
  
  // Start building the form data
  const formData: any = {
    race: user.race || 'HUMAN',
    class: user.class || 'FIGHTER',
    level: user.level || 1,
    experience: user.experience || 0,
    fortLevel: user.fort_level || 1,
    fortHitpoints: user.fort_hitpoints || 100,
  };

  // Process units
  user.units?.forEach((unit) => {
    const fieldName = `${unit.type.toLowerCase()}${unit.level}`;
    formData[fieldName] = unit.quantity;
  });

  // Process items - create a standalone items map
  const itemsMap: Record<string, Record<number, number>> = {};

  if (user.items && user.items.length > 0) {
    user.items.forEach((item) => {
      // Initialize type container if needed
      if (!itemsMap[item.type]) {
        itemsMap[item.type] = {};
      }
      
      // Add quantities, summing if same type/level
      const existingQuantity = itemsMap[item.type][item.level] || 0;
      itemsMap[item.type][item.level] = existingQuantity + item.quantity;
    });
    
    console.log('Original items:', user.items);
    console.log('Transformed items map:', itemsMap);
  }

  // Set the items in formData - THIS IS THE KEY LINE
  formData.items = itemsMap;

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

// Predefined army presets using proper User structure
export const presets = {
  basic: {
    name: 'Basic Army',
    data: {
      race: 'HUMAN',
      class: 'FIGHTER',
      level: 1,
      experience: 0,
      fort_level: 1,
      fort_hitpoints: 100,
      units: [
        { type: 'OFFENSE' as UnitType, level: 1, quantity: 1000 },
        { type: 'DEFENSE' as UnitType, level: 1, quantity: 1000 },
        { type: 'SENTRY' as UnitType, level: 1, quantity: 100 },
        { type: 'CITIZEN' as UnitType, level: 1, quantity: 500 }
      ] as PlayerUnit[],
      items: [{
        type: 'WEAPON' as ItemType,
        level: 1,
        quantity: 1000,
        usage: 'OFFENSE'
      }, {
        type: 'WEAPON' as ItemType,
        level: 1,
        quantity: 1000,
        usage: 'DEFENSE'
      }] as PlayerItem[],
      battle_upgrades: []
    } as Partial<User>,
  },
  balanced: {
    name: 'Balanced Army',
    data: {
      race: 'HUMAN',
      class: 'FIGHTER',
      level: 10,
      experience: 5000,
      fort_level: 6,
      fort_hitpoints: 100,
      units: [
        { type: 'OFFENSE' as UnitType, level: 1, quantity: 2000 },
        { type: 'OFFENSE' as UnitType, level: 2, quantity: 500 },
        { type: 'DEFENSE' as UnitType, level: 1, quantity: 1500 },
        { type: 'DEFENSE' as UnitType, level: 2, quantity: 300 },
        { type: 'SENTRY' as UnitType, level: 1, quantity: 800 },
        { type: 'SENTRY' as UnitType, level: 2, quantity: 200 },
        { type: 'CITIZEN' as UnitType, level: 1, quantity: 1000 },
        { type: 'WORKER' as UnitType, level: 1, quantity: 500 }
      ] as PlayerUnit[],
      items: [
        { type: 'HELM' as ItemType, level: 1, quantity: 1000, usage: 'DEFENSE' },
        { type: 'ARMOR' as ItemType, level: 1, quantity: 1000, usage: 'DEFENSE' },
        { type: 'BOOTS' as ItemType, level: 1, quantity: 1000, usage: 'DEFENSE' },
        { type: 'BRACERS' as ItemType, level: 1, quantity: 1000, usage: 'DEFENSE' },
        { type: 'SHIELD' as ItemType, level: 1, quantity: 1000, usage: 'DEFENSE' },
        { type: 'WEAPON' as ItemType, level: 1, quantity: 1000, usage: 'OFFENSE' },
        { type: 'HELM' as ItemType, level: 1, quantity: 1000, usage: 'OFFENSE' },
        { type: 'ARMOR' as ItemType, level: 1, quantity: 1000, usage: 'OFFENSE' },
        { type: 'BOOTS' as ItemType, level: 1, quantity: 1000, usage: 'OFFENSE' },
        { type: 'BRACERS' as ItemType, level: 1, quantity: 1000, usage: 'OFFENSE' }
      ] as PlayerItem[],
      battle_upgrades: [
        { type: 'OFFENSE', level: 1, quantity: 5 },
        { type: 'DEFENSE', level: 1, quantity: 5 }
      ]
    } as Partial<User>,
  },
  offensive: {
    name: 'Offensive Army',
    data: {
      race: 'GOBLIN',
      class: 'FIGHTER',
      level: 20,
      experience: 15000,
      fort_level: 8,
      fort_hitpoints: 80,
      units: [
        { type: 'OFFENSE' as UnitType, level: 1, quantity: 5000 },
        { type: 'OFFENSE' as UnitType, level: 2, quantity: 2000 },
        { type: 'DEFENSE' as UnitType, level: 1, quantity: 500 },
        { type: 'SENTRY' as UnitType, level: 1, quantity: 300 },
        { type: 'CITIZEN' as UnitType, level: 1, quantity: 800 }
      ] as PlayerUnit[],
      items: [
        { type: 'HELM' as ItemType, level: 1, quantity: 1000, usage: 'DEFENSE' },
        { type: 'ARMOR' as ItemType, level: 1, quantity: 1000, usage: 'DEFENSE' },
        { type: 'BOOTS' as ItemType, level: 1, quantity: 1000, usage: 'DEFENSE' },
        { type: 'BRACERS' as ItemType, level: 1, quantity: 1000, usage: 'DEFENSE' },
        { type: 'SHIELD' as ItemType, level: 1, quantity: 1000, usage: 'DEFENSE' },
        { type: 'WEAPON' as ItemType, level: 1, quantity: 5000, usage: 'OFFENSE' },
        { type: 'HELM' as ItemType, level: 1, quantity: 5000, usage: 'OFFENSE' },
        { type: 'ARMOR' as ItemType, level: 1, quantity: 5000, usage: 'OFFENSE' },
        { type: 'BOOTS' as ItemType, level: 1, quantity: 5000, usage: 'OFFENSE' },
        { type: 'BRACERS' as ItemType, level: 2, quantity: 5000, usage: 'OFFENSE' },
        { type: 'WEAPON' as ItemType, level: 2, quantity: 5000, usage: 'OFFENSE' },
        { type: 'HELM' as ItemType, level: 2, quantity: 5000, usage: 'OFFENSE' },
        { type: 'ARMOR' as ItemType, level: 2, quantity: 5000, usage: 'OFFENSE' },
        { type: 'BOOTS' as ItemType, level: 2, quantity: 5000, usage: 'OFFENSE' },
        { type: 'BRACERS' as ItemType, level: 2, quantity: 5000, usage: 'OFFENSE' }


      ] as PlayerItem[],
      battle_upgrades: [
        { type: 'OFFENSE', level: 1, quantity: 15 },
        { type: 'OFFENSE', level: 2, quantity: 5 }
      ]
    } as Partial<User>,
  },
  defensive: {
    name: 'Defensive Army',
    data: {
      race: 'UNDEAD',
      class: 'CLERIC',
      level: 20,
      experience: 15000,
      fort_level: 10,
      fort_hitpoints: 100,
      units: [
        { type: 'OFFENSE' as UnitType, level: 1, quantity: 1000 },
        { type: 'DEFENSE' as UnitType, level: 1, quantity: 3000 },
        { type: 'DEFENSE' as UnitType, level: 2, quantity: 1500 },
        { type: 'DEFENSE' as UnitType, level: 3, quantity: 800 },
        { type: 'SENTRY' as UnitType, level: 1, quantity: 1000 },
        { type: 'SENTRY' as UnitType, level: 2, quantity: 500 },
        { type: 'CITIZEN' as UnitType, level: 1, quantity: 2000 }
      ] as PlayerUnit[],
      items: [] as PlayerItem[],
      battle_upgrades: [
        { type: 'DEFENSE', level: 1, quantity: 20 },
        { type: 'SENTRY', level: 1, quantity: 10 }
      ],
      structure_upgrades: [
        { type: 'SENTRY', level: 5 }
      ]
    } as Partial<User>,
  },
};

interface ArmyPresetsProps {
  onSelect: (data: any) => void;
}

const ArmyPresets: React.FC<ArmyPresetsProps> = ({ onSelect }) => {
  const { user } = useUser(); 
  
  // Debug function to check what's being passed to onSelect
  const handlePresetSelect = (presetData: any) => {
    const formFields = userToFormFields(presetData);
    console.log('Selected preset data:', presetData);
    console.log('Converted form fields:', formFields);
    console.log('Items in form fields:', formFields.items);
    onSelect(formFields);
  };
  
  return (
    <Menu shadow="md" width={200}>
      <Menu.Target>
        <Button variant="outline" leftSection={<FontAwesomeIcon icon={faList} />}>
          Load Preset
        </Button>
      </Menu.Target>

      <Menu.Dropdown>
        <Menu.Label>Army Presets</Menu.Label>
        <Menu.Item
          key="current-user"
          leftSection={<FontAwesomeIcon icon={faUser} />}
          onClick={() => handlePresetSelect(user ? userModelToUser(user) : {})}
        >
          Current User
        </Menu.Item>
        {Object.entries(presets).map(([key, preset]) => (
          <Menu.Item
            key={key}
            leftSection={<FontAwesomeIcon icon={faBookmark} />}
            onClick={() => handlePresetSelect(preset.data)}
          >
            {preset.name}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
};

export default ArmyPresets;