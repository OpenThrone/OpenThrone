import { useEffect, useState } from 'react';
import { Fortifications } from '@/constants';
import { useUser } from '@/context/users';
import toLocale from '@/utils/numberFormatting';
import { Badge, Button, Center, Group, NumberInput, rem, RingProgress, SimpleGrid, Space, Stack, Table, Text } from '@mantine/core';
import { BiCoinStack, BiSolidBank, BiWrench, BiHistory } from 'react-icons/bi';
import MainArea from '@/components/MainArea';
import { faArrowRight } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { alertService } from '@/services';
import { logError } from '@/utils/logger';
import ContentCard from '@/components/ContentCard';
import StatCard from '@/components/StatCard';

const Repair = (props) => {
  const { user, forceUpdate } = useUser();
  const [fortification, setFortification] = useState(Fortifications[0]);
  const [repairPoints, setRepairPoints] = useState(0);
  const [history, setHistory] = useState([]);
  const [isRepairing, setIsRepairing] = useState(false);

  useEffect(() => {
    if (user?.fortLevel) {
      setFortification(Fortifications.find((fort) => fort.level === user.fortLevel));
    }
  }, [user?.fortLevel]);

  useEffect(() => {
    if (user) {
      fetch(`/api/bank/history?fortification=true`)
        .then((res) => res.json())
        .then((data) => {
          setHistory(data.rows);
        })
        .catch((error) => {
          logError('Error fetching bank history:', error);
        });
    }
  }, [user]);

  const handleRepair = async (e) => {
    e.preventDefault();
    if (isRepairing) return;
    setIsRepairing(true);
    
    try {
      const response = await fetch('/api/account/repair', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ repairPoints }),
      });

      const data = await response.json();
      if (!response.ok || !data?.success) {
        const errorMessage = data.error || `Repair failed: ${response.statusText}`;
        logError('Error repairing:', errorMessage, data);
        alertService.error(errorMessage, false, false, null, 3000);
        return;
      }

      alertService.success(data.message || 'Repair successful!', false, 3000);
      forceUpdate(); 
      setRepairPoints(0);
    } catch (error) {
      logError('Fetch error:', error);
    } finally {
      setIsRepairing(false);
    }
  };

  const handleRepairAll = async () => {
    const maxRepairPoints = (fortification?.hitpoints ?? 0) - (user?.fortHitpoints ?? 0);
    if (maxRepairPoints <= 0 || isRepairing) return;
    
    setIsRepairing(true);
    try {
      const response = await fetch('/api/account/repair', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ repairPoints: maxRepairPoints }),
      });

      const data = await response.json();
      if (!response.ok || !data?.success) {
        const errorMessage = data.error || `All repairs failed: ${response.statusText}`;
        logError('Error repairing all:', errorMessage, data);
        alertService.error(errorMessage, false, false, null, 3000);
        return;
      }

      alertService.success(data.message || 'All repairs successful!', false, 3000);
      forceUpdate();
    } catch (error) {
      logError('Fetch error:', error);
    } finally {
      setIsRepairing(false);
    }
  };

  const remainingHitpoints = (fortification?.hitpoints || 0) - (user?.fortHitpoints || 0);
  const repairCost = repairPoints * (fortification?.costPerRepairPoint || 0);
  const healthPercentage = Math.floor(((fortification?.hitpoints - remainingHitpoints) / fortification?.hitpoints) * 100);

  return (
    <MainArea title="Repair Fortification">
      {/* Resource Stats */}
      <SimpleGrid cols={{ base: 1, xs: 2, md: 2 }} className="mb-6">
        <StatCard 
          title="Gold In Hand"
          value={toLocale(user?.gold ?? 0)}
          icon={<BiCoinStack size={18} />}
        />
        <StatCard 
          title="Banked Gold"
          value={toLocale(user?.goldInBank ?? 0)}
          icon={<BiSolidBank size={18} />}
        />
      </SimpleGrid>

      <Space h="md" />

      {/* Fortification Status and Repair */}
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="xl">
        <ContentCard
          title="Fortification Status"
          icon={<FontAwesomeIcon icon={faArrowRight} />}
          variant={remainingHitpoints === 0 ? "default" : "highlight"}
          titlePosition="left"
          className="h-full"
        >
          <Group align="flex-start" className="p-4">
            <Stack spacing="md" className="flex-1">
              <Group align="center" spacing="xs">
                <Text fw={700} size="xl" className="font-medieval">
                  {fortification?.name}
                </Text>
                <Badge color={remainingHitpoints === 0 ? "gray" : "red"} variant="filled">
                  {remainingHitpoints === 0 ? 'Fully Repaired' : 'Needs Repair'}
                </Badge>
              </Group>
              
              <div className="space-y-2">
                <Group position="apart" className="bg-gray-800/30 p-3 rounded">
                  <Text size="sm" color="dimmed">Level:</Text>
                  <Text size="sm">{fortification?.level}</Text>
                </Group>
                
                <Group position="apart" className="bg-gray-800/30 p-3 rounded">
                  <Text size="sm" color="dimmed">Health:</Text>
                  <Text size="sm" color={healthPercentage < 50 ? "red" : healthPercentage < 80 ? "yellow" : "green"}>
                    {user?.fortHitpoints} / {fortification?.hitpoints}
                  </Text>
                </Group>
                
                <Group position="apart" className="bg-gray-800/30 p-3 rounded">
                  <Text size="sm" color="dimmed">Defense Bonus:</Text>
                  <Text size="sm">{fortification?.defenseBonusPercentage}%</Text>
                </Group>
                
                <Group position="apart" className="bg-gray-800/30 p-3 rounded">
                  <Text size="sm" color="dimmed">Gold Per Turn:</Text>
                  <Text size="sm">{fortification?.goldPerTurn}</Text>
                </Group>
                
                <Group position="apart" className="bg-gray-800/30 p-3 rounded">
                  <Text size="sm" color="dimmed">Cost:</Text>
                  <Text size="sm">{toLocale(fortification?.cost || 0, user?.locale)} Gold</Text>
                </Group>
              </div>
            </Stack>

            <div className="flex-shrink-0">
              <RingProgress
                size={120}
                roundCaps
                thickness={8}
                sections={[{ 
                  value: healthPercentage, 
                  color: healthPercentage < 50 ? 'red' : healthPercentage < 80 ? 'yellow' : 'green' 
                }]}
                label={
                  <Center>
                    <Text size="xl" className="font-medieval">{healthPercentage}%</Text>
                  </Center>
                }
              />
            </div>
          </Group>
        </ContentCard>

        <ContentCard
          title="Repair Fortification"
          icon={<BiWrench size={18} />}
          variant="default"
          titlePosition="left"
          className="h-full"
        >
          <Stack spacing="md" className="p-4">
            <Text size="sm" color="dimmed">
              Repair your fortification to restore its hitpoints and maintain your defensive capabilities.
            </Text>

            <Group position="apart" className="bg-gray-800/30 p-3 rounded">
              <Text size="sm" color="dimmed">Repair Cost Per HP:</Text>
              <Text size="sm">{fortification?.costPerRepairPoint} Gold</Text>
            </Group>
            
            <Group position="apart" className="bg-gray-800/30 p-3 rounded">
              <Text size="sm" color="dimmed">Total Repair Cost:</Text>
              <Text size="sm" color={repairCost > parseInt(user?.gold?.toString() || "0") ? "red" : "inherit"}>
                {toLocale(repairCost, user?.locale)} Gold
              </Text>
            </Group>

            <div className="flex items-center space-x-2 mt-2">
              <NumberInput
                value={repairPoints}
                onChange={(val) => setRepairPoints(Number(val))}
                placeholder="Points"
                className="flex-1"
                max={remainingHitpoints}
                min={0}
                allowNegative={false}
              />
              
              <Button 
                color="gray" 
                size="sm"
                onClick={() => setRepairPoints(remainingHitpoints)}
                disabled={remainingHitpoints === 0}
              >
                Max
              </Button>
            </div>

            <Group grow mt="sm">
              <Button 
                color="brand" 
                onClick={handleRepair}
                loading={isRepairing}
                disabled={repairPoints <= 0 || repairCost > parseInt(user?.gold?.toString() || "0")}
              >
                Repair
              </Button>
              
              <Button 
                color="red" 
                variant="outline"
                onClick={() => setRepairPoints(0)}
                disabled={repairPoints === 0}
              >
                Reset
              </Button>
            </Group>
            
            <Button 
              color="brand" 
              variant="light"
              fullWidth
              onClick={handleRepairAll}
              loading={isRepairing}
              disabled={
                remainingHitpoints === 0 || 
                remainingHitpoints * (fortification?.costPerRepairPoint || 0) > parseInt(user?.gold?.toString() || "0")
              }
            >
              Repair All ({remainingHitpoints} HP)
            </Button>
          </Stack>
        </ContentCard>
      </SimpleGrid>

      <Space h="xl" />

      {/* Repair History */}
      <ContentCard
        title="Repair History"
        icon={<BiHistory size={18} />}
        variant="default"
        titlePosition="left"
        className="w-full"
      >
        <div className="p-4">
          {history.length === 0 ? (
            <Text color="dimmed" className="text-center py-4">No repair history available</Text>
          ) : (
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th c="dimmed">Repair Date</Table.Th>
                  <Table.Th c="dimmed">Repair Points</Table.Th>
                  <Table.Th c="dimmed">HP Change</Table.Th>
                  <Table.Th c="dimmed">Cost</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {history.map((entry) => (
                  <Table.Tr key={entry.id}>
                    <Table.Td>{new Date(entry.date_time).toLocaleString()}</Table.Td>
                    <Table.Td>+{entry.stats.increase}</Table.Td>
                    <Table.Td>
                      {entry.stats.currentFortHP}{" "}
                      <FontAwesomeIcon icon={faArrowRight} size="xs" />{" "}
                      {entry.stats.newFortHP}
                    </Table.Td>
                    <Table.Td>-{toLocale(entry.gold_amount, user?.locale)}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
        </div>
      </ContentCard>
    </MainArea>
  );
};

export default Repair;
