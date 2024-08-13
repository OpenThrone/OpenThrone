import { getLevelFromXP, getAssetPath } from '@/utils/utilities';
import { Box, Text, Group, Paper, Grid, RingProgress, Button, Space, Container } from '@mantine/core';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import SpyMissionsModal from './spyMissionsModal';
import Modal from './modal';

const IntelResult = ({ battle, viewerID, lastGenerated }) => {
  const [isSpyModalOpen, setIsSpyModalOpen] = useState(false);
  const [isAttackModalOpen, setIsAttackModalOpen] = useState(false);
  const { attackerPlayer, defenderPlayer, winner, stats } = battle;
  const isViewerAttacker = viewerID === attackerPlayer.id;
  const isAttackerWinner = winner === attackerPlayer.id;
  const [unitSegments, setUnitSegments] = useState([]);
  const [itemsByCategory, setItemsByCategory] = useState([]);
  const itemColors = {
    HELM: 'grey',
    ARMOR: 'yellow',
    BOOTS: 'red',
    BRACERS: 'blue',
    SHIELD: 'green',
    WEAPON: 'purple',
  };

  const toggleSpyModal = () => {
    setIsSpyModalOpen(!isSpyModalOpen);
  };

  const toggleAttackModal = () => {
    setIsAttackModalOpen(!isAttackModalOpen);
  }
  
  useEffect(() => {
    const fetchData = async () => {
      const filteredUnits = stats.spyResults.intelligenceGathered?.units?.filter((unit) => unit.quantity > 0) || [];
      const totalUnits = filteredUnits.reduce((acc, unit) => Number(acc) + Number(unit.quantity), 0);
      const totalPopulation = stats.spyResults.defender.units.reduce((acc, unit) => acc + unit.quantity, 0);
      const unknownUnits = totalPopulation - totalUnits;
      const unitColors = {
        CITIZEN: 'grey',
        WORKER: 'yellow',
        OFFENSE: 'red',
        DEFENSE: 'blue',
        SPY: 'green',
        SENTRY: 'purple',
        UNKNOWN: 'black',
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
        }
      ];
      setUnitSegments(newUnitSegments);

      const itemCategories = ['OFFENSE', 'DEFENSE', 'SPY', 'SENTRY'];
      const itemTypes = ['HELM', 'ARMOR', 'BOOTS', 'BRACERS', 'SHIELD', 'WEAPON'];

      const newItemsByCategory = itemCategories.map((category) => {
        const categoryUnits = filteredUnits.filter((unit) => unit.type === category).reduce((acc, unit) => acc + unit.quantity, 0);
        const categoryItems = stats.spyResults.intelligenceGathered?.items?.filter((item) => item.usage === category) || [];

        const combinedItems = itemTypes.map((type) => {
          const totalQuantity = categoryItems
            .filter((item) => item.type === type)
            .reduce((acc, item) => Number(acc) + Number(item.quantity), 0);
          return {
            type,
            quantity: totalQuantity,
            percentage: categoryUnits > 0 ? Math.min((Number(totalQuantity) / Number(categoryUnits)) * 100, 100) : null, // Ensure valid percentage
          };
        }).filter((item) => item.quantity > 0); // Filter out items with zero quantity

        return {
          name: category,
          total: categoryUnits,
          itemsBreakdown: combinedItems,
          color: category === 'OFFENSE' ? 'red' : category === 'DEFENSE' ? 'blue' : category === 'SPY' ? 'green' : 'purple',
        };
      });

      setItemsByCategory(newItemsByCategory);
    };

    fetchData();

  }, [stats, defenderPlayer]);

  return (
    <Container size='xl' p={'md'} style={{ backgroundColor: 'black', color: 'white' }} >
      <Grid grow className="gap-5">
        <Grid.Col span={3} md={4} className="text-center">
          <h2 className="text-center mt-2">{attackerPlayer?.display_name}</h2>
          <h4>Level: {getLevelFromXP(stats.spyResults.attacker.experience)}</h4>
          <center>
            <Image
              src={getAssetPath('shields', '150x150', attackerPlayer?.race)}
              className="ml-2"
              alt="attacker avatar"
              width={150}
              height={150}
            />
          </center>
        </Grid.Col>
        <Grid.Col span={6} md={4} className="text-center">
          <Space h='10' />
          <div className="text-container inline-block align-middle">
            <Text color="white" fw="bolder" size='xl' className="font-medieval">
              Intelligence Report
            </Text>
            {isViewerAttacker && (
              <Text className="text-lg text-white font-semibold">
                You sent {stats.spyResults.spiesSent} {stats.spyResults.spiesSent > 1 ? 'spies' : 'spy'} to {defenderPlayer.display_name}
              </Text>
            )}
            <Text size='lg' fw='bold' className={`text-2xl ${isAttackerWinner ? 'text-green-400' : 'text-red-400'}`}>
              {isViewerAttacker ? 'You were' : attackerPlayer.display_name + ' was'} {isAttackerWinner ? 'successful' : 'unsuccessful.'}
            </Text>
            <Text size='md' fw='normal' className="text-2xl">
              Battle ID: {battle.id}
            </Text>
            {(isViewerAttacker || viewerID === 1) && (
              <>
              <Text size="lg" fw='bold'>Another Mission?</Text>
              <Space h='10' />
              <Group justify='center'>
                
                  <Button onClick={toggleSpyModal}>
                  Send More Spies
                  </Button>
                  <SpyMissionsModal
                    isOpen={isSpyModalOpen}
                    toggleModal={toggleSpyModal}
                    defenderID={defenderPlayer?.id}
                  />
                <Button onClick={toggleSpyModal}>
                  Infiltrate
                </Button>
                  <Button onClick={toggleSpyModal}>
                  Assassinate
                  </Button>
                  <Button onClick={toggleAttackModal}>
                    Attack
                  </Button>
                  <Modal
                    isOpen={isAttackModalOpen}
                    toggleModal={toggleAttackModal}
                    profileID={defenderPlayer.id}
                  />
                </Group> 
              </>
            )}
          </div>
        </Grid.Col>
        <Grid.Col span={3} md={4} className="text-center">
          <h2 className="text-center mt-2">{defenderPlayer?.display_name}</h2>
          <h4>Level: {getLevelFromXP(stats.spyResults.defender.experience)}</h4>
          <center>
            <Image
              src={getAssetPath('shields', '150x150', defenderPlayer?.race)}
              className="ml-2"
              alt="defender avatar"
              width={150}
              height={150}
            />
          </center>
        </Grid.Col>
      </Grid>
      <div className="intel-report mt-10">
        
        <Grid grow gutter={'xs'}>
          <Grid.Col span={4} md={6} className="text-center">
            {isAttackerWinner && unitSegments.length > 0 && (
              <Paper withBorder p="md" radius="md" mt="xl">
                <Text fz="xl" fw={700} mb="md">
                  TOTAL POPULATION
                </Text>
                <center>
                  <RingProgress
                    size={170}
                    thickness={16}
                    label={
                      <Text size="xs" ta="center" px="xs" style={{ pointerEvents: 'none' }}>
                        Hover sections to see tooltips <br />Total Pop: {battle.stats.spyResults.defender.units.reduce((acc, unit) => acc + unit.quantity, 0)}
                      </Text>
                    }
                    sections={unitSegments.map(segment => ({
                      value: Math.min(Math.max(segment.part, 0), 100), // Ensure value is between 0 and 100
                      color: segment.color,
                      tooltip: `${segment.quantity} ${segment.label}`,
                    }))}
                  />
                </center>
                <Box mt="md" className="unit-segments-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {unitSegments.map((segment, index) => (
                    <Box key={index} className="unit-segment p-2" bg={'gray'}>
                      <Text tt="uppercase" fz="xs" c="dimmed" fw={700}>
                        {segment.label}
                      </Text>
                      <Group justify="space-between" align="flex-end" gap={0}>
                        <Text fw={700}>{Math.max(segment.quantity, 0)} Units found</Text>
                      </Group>
                    </Box>
                  ))}
                </Box>
              </Paper>
            )}
          </Grid.Col>
          {isAttackerWinner &&
            itemsByCategory.length > 0 &&
            itemsByCategory.map((category, index) => (
              <Grid.Col span={4} md={6} className="text-center" key={index}>
                <Paper withBorder p="md" radius="md" mt="xl">
                  <Text fz="xl" fw={700} mb="md">
                    {category.name} ARMORY
                  </Text>
                  <center>
                    <RingProgress
                      size={170}
                      thickness={16}
                      label={
                        <Text size="xs" ta="center" px="xs" style={{ pointerEvents: 'none' }}>
                          {category.name} <br />Units Found: {category.total}
                        </Text>
                      }
                      sections={category.itemsBreakdown.map(item => ({
                        value: (item.percentage / 100) * (100 / category.itemsBreakdown.length), // Scale the percentage relative to the number of items
                        color: itemColors[item.type], // Use itemColors for each item type
                        tooltip: `${item.quantity} ${item.type}`,
                      }))}
                    />

                  </center>
                  <Box mt="md" className="unit-segments-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {category.itemsBreakdown.map((item, idx) => (
                      <Box key={idx} className="unit-segment p-2" mb="xs" bg='gray'>
                        <Text tt="uppercase" fz="xs" c="dimmed" fw={700}>
                          {item.type}
                        </Text>
                        <Group justify="space-between" align="flex-end" gap={0}>
                          <Text fw={700}>
                            {item.quantity} {item.percentage !== null && `(${item.percentage.toFixed(2)}%)`}
                          </Text>
                        </Group>
                      </Box>
                    ))}
                  </Box>
                </Paper>
              </Grid.Col>
            ))
          }
        </Grid>
      </div>
      <Text size='lg' fw='bold' className="text-2xl">
        Report last generated: {new Date(lastGenerated).toLocaleString()}
        </Text>
    </Container>
  );
};

export default IntelResult;
