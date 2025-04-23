// pages/home/levels.tsx
import { logError, logInfo } from '@/utils/logger';
import { useEffect, useState } from 'react';
import { DefaultLevelBonus } from '@/constants';
import { useUser } from '@/context/users';
import { Text, Space, Button, Center } from '@mantine/core';
import styles from './levels.module.css';
import LevelCard from '@/components/levelCard';
import { alertService } from '@/services';
import MainArea from '@/components/MainArea';

const Levels = (props) => {
  const { user, forceUpdate } = useUser();
  const [levels, setLevels] = useState(user?.bonus_points ?? DefaultLevelBonus);
  const [proficiencyPoints, setProficiencyPoints] = useState(user?.availableProficiencyPoints ?? 0);
  const [initialized, setInitialized] = useState(false);
  const defaultChangeQueue = {
    OFFENSE: { start: 0, change: 0 },
    DEFENSE: { start: 0, change: 0 },
    INCOME: { start: 0, change: 0 },
    INTEL: { start: 0, change: 0 },
    PRICES: { start: 0, change: 0 },
  };

  // Use defaultChangeQueue to initialize state
  const [changeQueue, setChangeQueue] = useState(defaultChangeQueue);

  useEffect(() => {
    if (!user) return;
    // Check if user.availableProficiencyPoints exists
    if (user.availableProficiencyPoints === undefined || user.availableProficiencyPoints === null) return;
    
    setLevels(user.bonus_points);
    if (!initialized) {
      setProficiencyPoints(user.availableProficiencyPoints); 
      setChangeQueue({
        OFFENSE: { start: 0, change: 0 },
        DEFENSE: { start: 0, change: 0 },
        INCOME: { start: 0, change: 0 },
        INTEL: { start: 0, change: 0 },
        PRICES: { start: 0, change: 0 },
      });
      setInitialized(true);
    }
  }, [user, initialized]);

  const handleAddBonus = (type) => {
    if (proficiencyPoints > 0 && (!changeQueue[type] || proficiencyPoints > 0)) {
      const updatedQueue = { ...changeQueue };
      updatedQueue[type].change++;
      setProficiencyPoints(proficiencyPoints - 1);
      setChangeQueue(updatedQueue);
    }
  };

  const handleReduceBonus = (type) => {
    if (changeQueue[type] && changeQueue[type].change > 0) {
      const updatedQueue = { ...changeQueue };
      updatedQueue[type].change--;
      setProficiencyPoints(proficiencyPoints + 1);
      setChangeQueue(updatedQueue);
    }
  };

  const getCurrentLevel = (type) => {
    const baseLevel = levels.find((level) => level.type === type)?.level ?? 0;
    const queuedChange = changeQueue[type]?.change ?? 0;
    return baseLevel + queuedChange;
  };

  const handleSubmitChanges = async () => {
    try {
      const response = await fetch('/api/account/bonusPoints', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ changeQueue }),
      });

      const data = await response.json();

      if (response.ok) {
        logInfo('Changes saved successfully:', data.updatedBonusPoints);
        // Optionally, update local state with the new bonus points
        setInitialized(false);
        forceUpdate(); // To trigger re-fetching user data
        getCurrentLevel('OFFENSE')
        getCurrentLevel('DEFENSE')
        getCurrentLevel('INCOME')
        getCurrentLevel('INTEL')
        getCurrentLevel('PRICES')
        alertService.success('Changes saved successfully');
      } else {
        alertService.error('Failed to save changes:', data.error);
        logError('Failed to save changes:', data.error);
      }
    } catch (error) {
      alertService.error('Error saving changes:', error);
      logError('Error saving changes:', error);
    }
  };


  return (
    <MainArea title="Levels">
      <Space h="md" />
      <Text size="lg">You currently have {proficiencyPoints} proficiency points available.</Text>
      <Text size="sm">Maximum % is 75</Text>
      <Space h="md" />
      <div className={styles.starLayout}>
        <div className={`${styles.starRow} ${styles.row1}`}>
          <LevelCard
            title="Strength (Offense)"
            type="OFFENSE"
            currentLevel={getCurrentLevel('OFFENSE')}
            onAdd={() => handleAddBonus('OFFENSE')}
            onReduce={() => handleReduceBonus('OFFENSE')}
            canAdd={proficiencyPoints > 0 && getCurrentLevel('OFFENSE') < 75 && (!changeQueue['OFFENSE'] || changeQueue['OFFENSE'].change < proficiencyPoints)}
            canReduce={changeQueue['OFFENSE']?.change > 0}
            changeQueue={changeQueue}
          />
        </div>
        <div className={`${styles.starRow} ${styles.row2}`}>
          <LevelCard
            title="Constitution (Defense)"
            type="DEFENSE"
            currentLevel={getCurrentLevel('DEFENSE')}
            onAdd={() => handleAddBonus('DEFENSE')}
            onReduce={() => handleReduceBonus('DEFENSE')}
            canAdd={proficiencyPoints > 0 && getCurrentLevel('DEFENSE') < 75 && (!changeQueue['DEFENSE'] || changeQueue['DEFENSE'].change < proficiencyPoints)}
            canReduce={changeQueue['DEFENSE']?.change > 0}
            changeQueue={changeQueue}
          />
          <LevelCard
            title="Wealth (Income)"
            type="INCOME"
            currentLevel={getCurrentLevel('INCOME')}
            onAdd={() => handleAddBonus('INCOME')}
            onReduce={() => handleReduceBonus('INCOME')}
            canAdd={proficiencyPoints > 0 && getCurrentLevel('INCOME') < 75 && (!changeQueue['INCOME'] || changeQueue['INCOME'].change < proficiencyPoints)}
            canReduce={changeQueue['INCOME']?.change > 0}
            changeQueue={changeQueue}
          />
        </div>
        <div className={`${styles.starRow} ${styles.row3}`}>
          <LevelCard
            title="Dexterity (Spy & Sentry)"
            type="INTEL"
            currentLevel={getCurrentLevel('INTEL')}
            onAdd={() => handleAddBonus('INTEL')}
            onReduce={() => handleReduceBonus('INTEL')}
            canAdd={proficiencyPoints > 0 && getCurrentLevel('INTEL') < 75 && (!changeQueue['INTEL'] || changeQueue['INTEL'].change < proficiencyPoints)}
            canReduce={changeQueue['INTEL']?.change > 0}
            changeQueue={changeQueue}
          />
          <LevelCard
            title="Charisma (Reduced Prices)"
            type="PRICES"
            currentLevel={getCurrentLevel('PRICES')}
            onAdd={() => handleAddBonus('PRICES')}
            onReduce={() => handleReduceBonus('PRICES')}
            canAdd={proficiencyPoints > 0 && getCurrentLevel('PRICES') < 75 && (!changeQueue['PRICES'] || changeQueue['PRICES'].change < proficiencyPoints)}
            canReduce={changeQueue['PRICES']?.change > 0}
            changeQueue={changeQueue}
          />
        </div>
      </div>
      {Object.values(changeQueue).some((change) => change.change > 0) && (
        <Center>
          <Button onClick={handleSubmitChanges} style={{ marginTop: '20px' }}>
            Save Changes
          </Button>
        </Center>
      )}
    </MainArea>
  );
};

export default Levels;
