// components/Levels.js
import { useEffect, useState } from 'react';
import { DefaultLevelBonus } from '@/constants';
import { useUser } from '@/context/users';
import { Text, Card, Group, Button, Space, Center } from '@mantine/core';
import styles from './levels.module.css'; // Import the CSS module

const Levels = (props) => {
  const { user, forceUpdate } = useUser();
  const [levels, setLevels] = useState(user?.bonus_points ?? DefaultLevelBonus);
  const [proficiencyPoints, setProficiencyPoints] = useState(user?.availableProficiencyPoints ?? 0);

  const incrementLevel = (typeToUpdate) => {
    const updatedLevels = levels.map((level) => {
      if (level.type === typeToUpdate) {
        return { ...level, level: level.level + 1 };
      }
      return level;
    });
    setLevels(updatedLevels);
  };

  useEffect(() => {
    setLevels(user?.bonus_points ?? DefaultLevelBonus);
    setProficiencyPoints(user?.availableProficiencyPoints ?? 0);
  }, [user?.bonus_points, user?.availableProficiencyPoints]);

  const handleAddBonus = async (type) => {
    const previousLevels = [...levels];
    const previousPoints = proficiencyPoints;
    incrementLevel(type);

    const requestData = { typeToUpdate: type };

    try {
      const response = await fetch('/api/account/bonusPoints', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestData),
      });

      if (!response.ok) {
        throw new Error(`Error: ${response.statusText}`);
      }

      const data = await response.json();
      setProficiencyPoints(user?.availableProficiencyPoints ?? proficiencyPoints - 1);
      forceUpdate();
    } catch (error) {
      console.error('Failed to update bonus points:', error);
      setLevels(previousLevels);
      setProficiencyPoints(previousPoints);
    }
  };

  return (
    <div className="mainArea pb-10">
      <Text
        style={{
          background: 'linear-gradient(360deg, orange, darkorange)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          fontSize: '1.5rem',
          fontWeight: 'bold',
        }}
      >
        Levels
      </Text>
      <Space h="md" />
      <Text size="lg">
        You currently have {proficiencyPoints} proficiency points available.
      </Text>
      <Text size="sm">Maximum % is 75</Text>
      <Space h="md" />
      <div className={styles.starLayout}>
        <div className={`${styles.starRow} ${styles.row1}`}>
          <Card className={styles.starPoint}>
            <Text size="lg" fw={700} align="center" style={{ borderBottom: '2px solid #FFD700', paddingBottom: '0.5rem' }}>
              Strength (Offense)
            </Text>
            <Space h="md" />
            <Text align="center">Current Bonus {levels.find((level) => level.type === 'OFFENSE')?.level ?? 0}%</Text>
            <Space h="md" />
            <Center>
              <Button
                w='75%'
                onClick={() => handleAddBonus('OFFENSE')}
                disabled={!user?.availableProficiencyPoints || levels.find((level) => level.type === 'OFFENSE')?.level >= 75}
              >
                Add
              </Button>
            </Center>
          </Card>
        </div>
        <div className={`${styles.starRow} ${styles.row2}`}>
          <Card className={styles.starPoint}>
            <Text size="lg" fw={700} align="center" style={{ borderBottom: '2px solid #FFD700', paddingBottom: '0.5rem' }}>
              Constitution (Defense)
            </Text>
            <Space h="md" />
            <Text align="center">Current Bonus {levels.find((level) => level.type === 'DEFENSE')?.level ?? 0}%</Text>
            <Space h="md" />
            <Center>
              <Button
                w='75%'
                onClick={() => handleAddBonus('DEFENSE')}
                disabled={!user?.availableProficiencyPoints || levels.find((level) => level.type === 'DEFENSE')?.level >= 75}
              >
                Add
              </Button>
            </Center>
          </Card>
          <Card className={styles.starPoint}>
            <Text size="lg" fw={700} align="center" style={{ borderBottom: '2px solid #FFD700', paddingBottom: '0.5rem' }}>
              Wealth (Income)
            </Text>
            <Space h="md" />
            <Text align="center">Current Bonus {levels.find((level) => level.type === 'INCOME')?.level ?? 0}%</Text>
            <Space h="md" />
            <Center>
              <Button
                w='75%'
                onClick={() => handleAddBonus('INCOME')}
                disabled={!user?.availableProficiencyPoints || levels.find((level) => level.type === 'INCOME')?.level >= 75}
              >
                Add
              </Button>
            </Center>
          </Card>
        </div>
        <div className={`${styles.starRow} ${styles.row3}`}>
          <Card className={styles.starPoint}>
            <Text size="lg" fw={700} align="center" style={{ borderBottom: '2px solid #FFD700', paddingBottom: '0.5rem' }}>
              Dexterity (Spy & Sentry)
            </Text>
            <Space h="md" />
            <Text align="center">Current Bonus {levels.find((level) => level.type === 'INTEL')?.level ?? 0}%</Text>
            <Space h="md" />
            <Center>
              <Button
                w='75%'
                onClick={() => handleAddBonus('INTEL')}
                disabled={!user?.availableProficiencyPoints || levels.find((level) => level.type === 'INTEL')?.level >= 75}
              >
                Add
              </Button>
            </Center>
          </Card>
          <Card className={styles.starPoint}>
            <Text size="lg" fw={700} align="center" style={{ borderBottom: '2px solid #FFD700', paddingBottom: '0.5rem' }}>
              Charisma (Reduced Prices)
            </Text>
            <Space h="md" />
            <Text align="center">Current Bonus {levels.find((level) => level.type === 'PRICES')?.level ?? 0}%</Text>
            <Space h="md" />
            <Center>
              <Button
                w='75%'
                onClick={() => handleAddBonus('PRICES')}
                disabled={!user?.availableProficiencyPoints || levels.find((level) => level.type === 'PRICES')?.level >= 75}
              >
                Add
              </Button>
            </Center>
          </Card>
        </div>
      </div>
    </div>


  );
};

export default Levels;
