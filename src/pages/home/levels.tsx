import { faMinus, faPlus, faStar } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  Box,
  Button,
  Center,
  Group,
  SimpleGrid,
  Space,
  Text,
} from '@mantine/core';
import { useTranslation } from 'next-i18next';
import { useEffect, useRef, useState } from 'react';

import { GameCard } from '@/components/game/GameCard';
import MainArea from '@/components/MainArea';
import { DefaultLevelBonus } from '@/constants';
import { useUser } from '@/context/users';
import { alertService } from '@/services/Alert.service';

const StatCard = ({
  title,
  currentLevel,
  onAdd,
  onReduce,
  canAdd,
  canReduce,
}) => (
  <GameCard title={title} icon={faStar}>
    <Box
      style={{
        backgroundColor: '#0f141a',
        borderRadius: '6px',
        border: '1px solid #1f2b3b',
        boxShadow: 'inset 0 3px 6px rgba(0,0,0,0.6)',
        padding: '12px',
      }}
    >
      <Group justify="space-between">
        <Text size="xs" c="dimmed" fw={700} tt="uppercase">
          Current Bonus
        </Text>
        <Text size="lg" fw={800} style={{ fontFamily: 'monospace' }}>
          {currentLevel}%
        </Text>
      </Group>
    </Box>
    <Group justify="center" mt="md" gap="xs">
      <Button
        onClick={onReduce}
        disabled={!canReduce}
        variant="outline"
        size="xs"
      >
        <FontAwesomeIcon icon={faMinus} />
      </Button>
      <Button onClick={onAdd} disabled={!canAdd} size="xs" color="yellow">
        <FontAwesomeIcon icon={faPlus} />
      </Button>
    </Group>
  </GameCard>
);

const Levels = (props) => {
  const { t } = useTranslation('home');
  const { user, forceUpdate } = useUser();
  const justSavedRef = useRef(false);
  const [levels, setLevels] = useState(user?.bonus_points ?? DefaultLevelBonus);
  const [proficiencyPoints, setProficiencyPoints] = useState(
    user?.availableProficiencyPoints ?? 0,
  );
  const [initialized, setInitialized] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [changeQueue, setChangeQueue] = useState({
    OFFENSE: { change: 0 },
    DEFENSE: { change: 0 },
    INCOME: { change: 0 },
    INTEL: { change: 0 },
    PRICES: { change: 0 },
  });

  useEffect(() => {
    if (!user || justSavedRef.current) {
      justSavedRef.current = false;
      return;
    }
    setLevels(user.bonus_points);
    if (!isSaving) setProficiencyPoints(user.availableProficiencyPoints);
    if (!initialized) {
      setChangeQueue({
        OFFENSE: { change: 0 },
        DEFENSE: { change: 0 },
        INCOME: { change: 0 },
        INTEL: { change: 0 },
        PRICES: { change: 0 },
      });
      setInitialized(true);
    }
  }, [user, initialized, isSaving]);

  const handleBonusChange = (type, amount) => {
    if (
      (amount > 0 && proficiencyPoints > 0) ||
      (amount < 0 && changeQueue[type].change > 0)
    ) {
      setChangeQueue((prev) => ({
        ...prev,
        [type]: { change: prev[type].change + amount },
      }));
      setProficiencyPoints((prev) => prev - amount);
    }
  };

  const getCurrentLevel = (type) =>
    (levels.find((l) => l.type === type)?.level ?? 0) +
    (changeQueue[type]?.change ?? 0);

  const handleSubmitChanges = async () => {
    setIsSaving(true);
    try {
      const response = await fetch('/api/account/bonusPoints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ changeQueue }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to save changes');

      setLevels(data.updatedBonusPoints);
      setChangeQueue({
        OFFENSE: { change: 0 },
        DEFENSE: { change: 0 },
        INCOME: { change: 0 },
        INTEL: { change: 0 },
        PRICES: { change: 0 },
      });
      justSavedRef.current = true;
      forceUpdate();
      alertService.success(t('levels.changesSavedSuccessfully'));
    } catch (error) {
      alertService.error(error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const levelBonuses = [
    { title: t('levels.strength'), type: 'OFFENSE' },
    { title: t('levels.constitution'), type: 'DEFENSE' },
    { title: t('levels.wealth'), type: 'INCOME' },
    { title: t('levels.dexterity'), type: 'INTEL' },
    { title: t('levels.charisma'), type: 'PRICES' },
  ];

  return (
    <MainArea title={t('levels.title')}>
      <GameCard title={t('levels.proficiencyPoints')}>
        <Text size="lg" ta="center">
          {t('levels.proficiencyPointsAvailable', { count: proficiencyPoints })}
        </Text>
        <Text size="sm" ta="center" c="dimmed">
          {t('levels.maximumBonus')}
        </Text>
      </GameCard>
      <Space h="md" />
      <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
        {levelBonuses.map((bonus) => (
          <StatCard
            key={bonus.type}
            title={bonus.title}
            currentLevel={getCurrentLevel(bonus.type)}
            onAdd={() => handleBonusChange(bonus.type, 1)}
            onReduce={() => handleBonusChange(bonus.type, -1)}
            canAdd={proficiencyPoints > 0 && getCurrentLevel(bonus.type) < 75}
            canReduce={changeQueue[bonus.type]?.change > 0}
          />
        ))}
      </SimpleGrid>
      {Object.values(changeQueue).some((c) => c.change > 0) && (
        <Center mt="md">
          <Button onClick={handleSubmitChanges} loading={isSaving} size="lg">
            {t('levels.saveChanges')}
          </Button>
        </Center>
      )}
    </MainArea>
  );
};

export default Levels;
