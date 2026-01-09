import { useEffect, useState, useRef } from "react";
import { DefaultLevelBonus } from "@/constants";
import { useUser } from "@/context/users";
import { Text, Space, Button, Center, SimpleGrid, Group, Box } from "@mantine/core";
import { alertService } from "@/services/Alert.service";
import { GameCard } from "@/components/game/GameCard";
import { faPlus, faMinus, faStar } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import MainArea from "@/components/MainArea";

const StatCard = ({ title, currentLevel, onAdd, onReduce, canAdd, canReduce }) => (
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
      <Button onClick={onReduce} disabled={!canReduce} variant="outline" size="xs">
        <FontAwesomeIcon icon={faMinus} />
      </Button>
      <Button onClick={onAdd} disabled={!canAdd} size="xs" color="yellow">
        <FontAwesomeIcon icon={faPlus} />
      </Button>
    </Group>
  </GameCard>
);

const Levels = () => {
  const { user, forceUpdate } = useUser();
  const justSavedRef = useRef(false);
  const [levels, setLevels] = useState(user?.bonus_points ?? DefaultLevelBonus);
  const [proficiencyPoints, setProficiencyPoints] = useState(user?.availableProficiencyPoints ?? 0);
  const [initialized, setInitialized] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [changeQueue, setChangeQueue] = useState({
    OFFENSE: { change: 0 }, DEFENSE: { change: 0 }, INCOME: { change: 0 }, INTEL: { change: 0 }, PRICES: { change: 0 },
  });

  useEffect(() => {
    if (!user || justSavedRef.current) {
      justSavedRef.current = false;
      return;
    }
    setLevels(user.bonus_points);
    if (!isSaving) setProficiencyPoints(user.availableProficiencyPoints);
    if (!initialized) {
      setChangeQueue({ OFFENSE: { change: 0 }, DEFENSE: { change: 0 }, INCOME: { change: 0 }, INTEL: { change: 0 }, PRICES: { change: 0 } });
      setInitialized(true);
    }
  }, [user, initialized, isSaving]);

  const handleBonusChange = (type, amount) => {
    if ((amount > 0 && proficiencyPoints > 0) || (amount < 0 && changeQueue[type].change > 0)) {
      setChangeQueue(prev => ({ ...prev, [type]: { change: prev[type].change + amount } }));
      setProficiencyPoints(prev => prev - amount);
    }
  };

  const getCurrentLevel = (type) => (levels.find(l => l.type === type)?.level ?? 0) + (changeQueue[type]?.change ?? 0);

  const handleSubmitChanges = async () => {
    setIsSaving(true);
    try {
      const response = await fetch("/api/account/bonusPoints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ changeQueue }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to save changes");
      
      setLevels(data.updatedBonusPoints);
      setChangeQueue({ OFFENSE: { change: 0 }, DEFENSE: { change: 0 }, INCOME: { change: 0 }, INTEL: { change: 0 }, PRICES: { change: 0 } });
      justSavedRef.current = true;
      forceUpdate();
      alertService.success("Changes saved successfully");
    } catch (error) {
      alertService.error(error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const levelBonuses = [
    { title: "Strength (Offense)", type: "OFFENSE" },
    { title: "Constitution (Defense)", type: "DEFENSE" },
    { title: "Wealth (Income)", type: "INCOME" },
    { title: "Dexterity (Spy & Sentry)", type: "INTEL" },
    { title: "Charisma (Reduced Prices)", type: "PRICES" },
  ];

  return (
    <MainArea title="Levels">
      <GameCard title="Proficiency Points">
        <Text size="lg" ta="center">You have <Text span c="yellow" inherit>{proficiencyPoints}</Text> proficiency points available.</Text>
        <Text size="sm" ta="center" c="dimmed">Maximum bonus is 75%</Text>
      </GameCard>
      <Space h="md" />
      <SimpleGrid cols={{base: 1, sm: 2, md: 3}} spacing="md">
        {levelBonuses.map(bonus => (
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
      {Object.values(changeQueue).some(c => c.change > 0) && (
        <Center mt="md">
          <Button onClick={handleSubmitChanges} loading={isSaving} size="lg">Save Changes</Button>
        </Center>
      )}
    </MainArea>
  );
};

export default Levels;
