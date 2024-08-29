// components/levelCard.js
import React from 'react';
import { Text, Card, Button, Center, Space, Tooltip } from '@mantine/core';

const levelCard = ({ title, type, currentLevel, onAdd, onReduce, canAdd, canReduce, changeQueue }) => {
  const tooltipText = {
    OFFENSE: 'Strength: Increases your Offense by x%',
    DEFENSE: 'Constitution: Increases your Defense by x%',
    INCOME: 'Wealth: Increases your Daily Income by x%',
    INTEL: 'Dexterity: Increases both Spy and Sentry by x%',
    PRICES: 'Charisma: Reduces the price of Units, Items, and Upgrades by x%',
  }[type];

  console.log('changeQueueInLevelCard', changeQueue);
  console.log('type', type);

  return (
    <Card>
      <Tooltip label={tooltipText} withArrow>
        <Text size="lg" fw={700} align="center" style={{ borderBottom: '2px solid #FFD700', paddingBottom: '0.5rem' }}>
          {title}
        </Text>
      </Tooltip>
      <Space h="md" />
      <Text align="center" c='yellow'>Current Bonus: {currentLevel - (changeQueue[type]?.change ?? 0)}%</Text>
      <Text align="center">New Pending: {currentLevel}%</Text>
      <Space h="md" />
      <Center>
        {currentLevel === 0 ? (
          <Button onClick={onAdd} style={{ cursor: 'pointer' }}>
            Add
          </Button>
        ) : (
          <>
              <Button onClick={onReduce} style={{ cursor: 'pointer', marginRight: '5px' }} size='xs'>
              -
            </Button>
              <Text size='md'>{changeQueue[type]?.change}</Text>
            <Button onClick={onAdd} style={{ cursor: 'pointer', marginLeft: '5px' }} size='xs'>
              +
            </Button>
          </>
        )}
      </Center>
    </Card>
  );
};

export default levelCard;
