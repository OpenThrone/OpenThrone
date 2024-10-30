import { getLevelFromXP, getAssetPath } from '@/utils/utilities';
import { Box, Text, Group, Paper, Grid, RingProgress, Button, Space, Container } from '@mantine/core';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import SpyMissionsModal from './spyMissionsModal';
import Modal from './modal';

const InfiltrationResult = ({ battle, viewerID, lastGenerated }) => {
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
              Infiltration Report
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
        <Text>You sent {stats.spyResults.spiesSent} {stats.spyResults.spiesSent > 1 ? 'Infiltrators' : 'Infiltrator'} to attack {defenderPlayer.display_name} Fort</Text>
        <Text>You were {isAttackerWinner ? 'successful' : 'unsuccessful'} in your mission {
          isAttackerWinner ? `and managed to cause ${stats.spyResults.fortDmg} damage to the fort` : ''
        }.</Text>
       
      </div>
      <Text size='lg' fw='bold' className="text-2xl">
        Report last generated: {new Date(lastGenerated).toLocaleString()}
        </Text>
    </Container>
  );
};

export default InfiltrationResult;
