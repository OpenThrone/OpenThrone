import {
  faBinoculars,
  faChartPie,
  faWarehouse,
} from '@fortawesome/free-solid-svg-icons';
import {
  Box,
  Button,
  Grid,
  Group,
  RingProgress,
  Space,
  Stack,
  Text,
  useMantineTheme,
} from '@mantine/core';
import Image from 'next/image';
import { useEffect, useState } from 'react';

import type { PlayerItem, PlayerUnit } from '@/types/typings';
import { getAssetPath, getLevelFromXP } from '@/utils/utilities';

import { GameCard } from './game/GameCard';
import Modal from './modal';
import SpyMissionsModal from './spyMissionsModal';

const IntelResult = ({ battle, viewerID, lastGenerated }) => {
  const [isSpyModalOpen, setIsSpyModalOpen] = useState(false);
  const [isAttackModalOpen, setIsAttackModalOpen] = useState(false);
  const { attackerPlayer, defenderPlayer, winner, stats } = battle;
  const isViewerAttacker = viewerID === attackerPlayer.id;
  const isAttackerWinner = winner === attackerPlayer.id;
  const [unitSegments, setUnitSegments] = useState([]);
  const [itemsByCategory, setItemsByCategory] = useState([]);
  const [totalPopulation, setTotalPopulation] = useState(0);
  const theme = useMantineTheme();

  const itemColors = {
    HELM: 'grey',
    ARMOR: 'yellow',
    BOOTS: 'red',
    BRACERS: 'blue',
    SHIELD: 'green',
    WEAPON: 'purple',
  };

  const toggleSpyModal = () => setIsSpyModalOpen(!isSpyModalOpen);
  const toggleAttackModal = () => setIsAttackModalOpen(!isAttackModalOpen);

  useEffect(() => {
    const units = stats.spyResults.intelligenceGathered?.units;
    const filteredUnits =
      Array.isArray(units) && units.length > 0
        ? units.filter((unit) => unit.quantity > 0)
        : [];
    const totalUnits = filteredUnits.reduce(
      (acc, unit) => Number(acc) + Number(unit.quantity),
      0,
    );
    const totalPop =
      Number(
        Object.values(stats.spyResults.defender.units).reduce(
          (acc: number, unit: PlayerUnit) => acc + unit.quantity,
          0,
        ),
      ) || 0;
    setTotalPopulation(totalPop);
    const unknownUnits = totalPop - totalUnits;
    const unitColors = {
      CITIZEN: 'grey',
      WORKER: 'yellow',
      OFFENSE: 'red',
      DEFENSE: 'blue',
      SPY: 'green',
      SENTRY: 'purple',
      UNKNOWN: 'white',
    };

    const newUnitSegments = [
      ...filteredUnits.map((unit) => ({
        label: `${unit.type}`,
        quantity: unit.quantity,
        part: Math.min(Math.max(unit.quantity / totalPopulation, 0), 1) * 100,
        color: unitColors[unit.type] || 'black',
      })),
      {
        label: 'UNKNOWN',
        quantity: unknownUnits,
        part: (unknownUnits / totalPopulation) * 100,
        color: unitColors.UNKNOWN,
      },
    ];
    setUnitSegments(newUnitSegments);

    if (stats.spyResults.intelligenceGathered?.items?.length === 0) {
      setItemsByCategory([]);
      return;
    }
    const itemCategories = ['OFFENSE', 'DEFENSE', 'SPY', 'SENTRY'];
    const itemTypes = ['HELM', 'ARMOR', 'BOOTS', 'BRACERS', 'SHIELD', 'WEAPON'];

    const itemsArray: PlayerItem[] = stats.spyResults.intelligenceGathered
      ?.items
      ? Object.values(stats.spyResults.intelligenceGathered.items)
      : [];
    const newItemsByCategory = itemCategories.map((category) => {
      const categoryUnits = filteredUnits
        .filter((unit) => unit.type === category)
        .reduce((acc, unit) => acc + unit.quantity, 0);
      const categoryItems = itemsArray.filter(
        (item) => item.usage === category,
      );
      const combinedItems = itemTypes
        .map((type) => {
          const totalQuantity = categoryItems
            .filter((item) => item.type === type)
            .reduce((acc, item) => Number(acc) + Number(item.quantity), 0);
          return {
            type,
            quantity: totalQuantity,
            percentage:
              categoryUnits > 0
                ? Math.min(
                    (Number(totalQuantity) / Number(categoryUnits)) * 100,
                    100,
                  )
                : null,
          };
        })
        .filter((item) => item.quantity > 0);

      return {
        name: category,
        total: categoryUnits,
        itemsBreakdown: combinedItems,
        color:
          category === 'OFFENSE'
            ? 'red'
            : category === 'DEFENSE'
              ? 'blue'
              : category === 'SPY'
                ? 'green'
                : 'purple',
      };
    });

    setItemsByCategory(newItemsByCategory);
  }, [stats, defenderPlayer, totalPopulation]);

  return (
    <GameCard title="Intelligence Report" icon={faBinoculars}>
      <Grid grow gutter="lg">
        <Grid.Col span={{ base: 12, md: 5 }} style={{ textAlign: 'center' }}>
          <Text size="xl" fw={700}>
            {attackerPlayer?.display_name}
          </Text>
          <Text c="dimmed">
            Level: {getLevelFromXP(stats.spyResults.attacker.experience)}
          </Text>
          <Image
            src={getAssetPath('shields', '150x150', attackerPlayer?.race)}
            alt="attacker avatar"
            width={150}
            height={150}
            style={{ margin: 'auto' }}
          />
        </Grid.Col>
        <Grid.Col
          span={{ base: 12, md: 2 }}
          style={{ textAlign: 'center', alignSelf: 'center' }}
        >
          <Text size="lg" fw="bold" color={isAttackerWinner ? 'green' : 'red'}>
            {isAttackerWinner ? 'Success' : 'Failure'}
          </Text>
          <Text size="xs" c="dimmed">
            Battle ID: {battle.id}
          </Text>
          <Space h="md" />
          {(isViewerAttacker || viewerID === 1) && (
            <Stack align="center" gap="xs">
              <Button size="xs" onClick={toggleSpyModal}>
                Send More Spies
              </Button>
              <Button size="xs" onClick={toggleAttackModal}>
                Attack
              </Button>
            </Stack>
          )}
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 5 }} style={{ textAlign: 'center' }}>
          <Text size="xl" fw={700}>
            {defenderPlayer?.display_name}
          </Text>
          <Text c="dimmed">
            Level: {getLevelFromXP(stats.spyResults.defender.experience)}
          </Text>
          <Image
            src={getAssetPath('shields', '150x150', defenderPlayer?.race)}
            alt="defender avatar"
            width={150}
            height={150}
            style={{ margin: 'auto' }}
          />
        </Grid.Col>
      </Grid>

      {isAttackerWinner && (
        <Grid grow gutter="md" mt="xl">
          <Grid.Col span={{ base: 12, md: 6 }}>
            <GameCard title="Population Estimate" icon={faChartPie}>
              <Group justify="center">
                <RingProgress
                  size={170}
                  thickness={16}
                  label={
                    <Text size="xs" ta="center">
                      Total Pop: {totalPopulation}
                    </Text>
                  }
                  sections={unitSegments.map((s) => ({
                    value: s.part,
                    color: s.color,
                    tooltip: `${s.quantity} ${s.label}`,
                  }))}
                />
              </Group>
              <Grid mt="md">
                {unitSegments.map((segment, index) => (
                  <Grid.Col span={4} key={index}>
                    <Box
                      style={{
                        backgroundColor: '#0f141a',
                        borderRadius: '6px',
                        border: '1px solid #1f2b3b',
                        boxShadow: 'inset 0 3px 6px rgba(0,0,0,0.6)',
                        padding: '8px',
                        textAlign: 'center',
                      }}
                    >
                      <Text tt="uppercase" fz="xs" c="dimmed">
                        {segment.label}
                      </Text>
                      <Text fw={700}>{segment.quantity}</Text>
                    </Box>
                  </Grid.Col>
                ))}
              </Grid>
            </GameCard>
          </Grid.Col>
          {itemsByCategory.map(
            (category, index) =>
              category.itemsBreakdown.length > 0 && (
                <Grid.Col span={{ base: 12, md: 6 }} key={index}>
                  <GameCard
                    title={`${category.name} Armory`}
                    icon={faWarehouse}
                  >
                    <Group justify="center">
                      <RingProgress
                        size={170}
                        thickness={16}
                        label={
                          <Text size="xs" ta="center">
                            Total {category.name} Units: {category.total}
                          </Text>
                        }
                        sections={category.itemsBreakdown.map((item) => ({
                          value: item.percentage || 0,
                          color: itemColors[item.type],
                          tooltip: `${item.quantity} ${item.type}`,
                        }))}
                      />
                    </Group>
                    <Grid mt="md">
                      {category.itemsBreakdown.map((item, idx) => (
                        <Grid.Col span={4} key={idx}>
                          <Box
                            style={{
                              backgroundColor: '#0f141a',
                              borderRadius: '6px',
                              border: '1px solid #1f2b3b',
                              boxShadow: 'inset 0 3px 6px rgba(0,0,0,0.6)',
                              padding: '8px',
                              textAlign: 'center',
                            }}
                          >
                            <Text tt="uppercase" fz="xs" c="dimmed">
                              {item.type}
                            </Text>
                            <Text fw={700}>
                              {item.quantity} ({item.percentage?.toFixed(1)}%)
                            </Text>
                          </Box>
                        </Grid.Col>
                      ))}
                    </Grid>
                  </GameCard>
                </Grid.Col>
              ),
          )}
        </Grid>
      )}
      <SpyMissionsModal
        isOpen={isSpyModalOpen}
        toggleModal={toggleSpyModal}
        defenderID={defenderPlayer?.id}
      />
      <Modal
        isOpen={isAttackModalOpen}
        toggleModal={toggleAttackModal}
        profileID={defenderPlayer.id}
      />
      <Text size="xs" c="dimmed" ta="center" mt="md">
        Report generated: {new Date(lastGenerated).toLocaleString()}
      </Text>
    </GameCard>
  );
};

export default IntelResult;
