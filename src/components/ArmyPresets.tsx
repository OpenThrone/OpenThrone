import React from 'react';
import { Button, Group, Menu, Text } from '@mantine/core';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faList, faBookmark } from '@fortawesome/free-solid-svg-icons';

// Predefined army presets
export const presets = {
  basic: {
    name: 'Basic Army',
    data: {
      race: 'HUMAN',
      class: 'FIGHTER',
      level: 1,
      experience: 0,
      fortLevel: 1,
      fortHitpoints: 100,
      offense1: 1000,
      defense1: 1000,
      sentry1: 100,
      citizen1: 500,
    },
  },
  balanced: {
    name: 'Balanced Army',
    data: {
      race: 'HUMAN',
      class: 'FIGHTER',
      level: 10,
      experience: 5000,
      fortLevel: 6,
      fortHitpoints: 100,
      offense1: 2000,
      offense2: 500,
      defense1: 1500,
      defense2: 300,
      sentry1: 800,
      sentry2: 200,
      citizen1: 1000,
      worker1: 500,
      offenseUpgrade1: 5,
      defenseUpgrade1: 5,
    },
  },
  offensive: {
    name: 'Offensive Army',
    data: {
      race: 'ORC',
      class: 'FIGHTER',
      level: 20,
      experience: 15000,
      fortLevel: 8,
      fortHitpoints: 80,
      offense1: 5000,
      offense2: 2000,
      offense3: 1000,
      defense1: 500,
      sentry1: 300,
      citizen1: 800,
      offenseUpgrade1: 15,
      offenseUpgrade2: 5,
    },
  },
  defensive: {
    name: 'Defensive Army',
    data: {
      race: 'DWARF',
      class: 'CLERIC',
      level: 20,
      experience: 15000,
      fortLevel: 10,
      fortHitpoints: 100,
      offense1: 1000,
      defense1: 3000,
      defense2: 1500,
      defense3: 800,
      sentry1: 1000,
      sentry2: 500,
      citizen1: 2000,
      defenseUpgrade1: 20,
      sentryUpgrade1: 10,
      sentryUpgrade: 5,
    },
  },
};

interface ArmyPresetsProps {
  onSelect: (data: any) => void;
}

const ArmyPresets: React.FC<ArmyPresetsProps> = ({ onSelect }) => {
  return (
    <Menu shadow="md" width={200}>
      <Menu.Target>
        <Button variant="outline" leftSection={<FontAwesomeIcon icon={faList} />}>
          Load Preset
        </Button>
      </Menu.Target>

      <Menu.Dropdown>
        <Menu.Label>Army Presets</Menu.Label>
        {Object.entries(presets).map(([key, preset]) => (
          <Menu.Item
            key={key}
            leftSection={<FontAwesomeIcon icon={faBookmark} />}
            onClick={() => onSelect(preset.data)}
          >
            {preset.name}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
};

export default ArmyPresets;