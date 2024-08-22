import React, { useCallback, useEffect, useRef, useState } from 'react';
import Alert from '@/components/alert';
import NewUnitSection from '@/components/newUnitSection';
import { EconomyUpgrades, Fortifications } from '@/constants';
import { useUser } from '@/context/users';
import { alertService } from '@/services';
import toLocale from '@/utils/numberFormatting';
import { Paper, Group, SimpleGrid, Title, Text, ThemeIcon, Badge, Tooltip, Button, Space, Flex, Stack } from '@mantine/core';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBuildingColumns, faCoins, faPeopleGroup, faShield } from '@fortawesome/free-solid-svg-icons';

const Training = (props) => {
  //const [data, setData] = useState({ citizens: 0, gold: 0, goldInBank: 0 });
  const { user, forceUpdate } = useUser();
  const [totalCost, setTotalCost] = useState(0);

  // Keys we use to add the state objects to each unit type
  const indexDataKeys = ['unitData', 'updateFn'];

  // A quick function that turns the useState output into an object with the above keys
  const getUnitIndexState = () => Object.fromEntries(
    useState(null).map((s, i) => [indexDataKeys[i], s])
  );

  // All the things we need for each unit type
  const unitTypesIndex = [
    {
      type: 'WORKER',
      sectionTitle: 'Economy',
    },
    {
      type: 'OFFENSE',
      sectionTitle: 'Offense',
    },
    {
      type: 'DEFENSE',
      sectionTitle: 'Defense',
    },
    {
      type: 'SPY',
      sectionTitle: 'Spy',
    },
    {
      type: 'SENTRY',
      sectionTitle: 'Sentry',
    },
  // n.b. this returns unitData and updateFn for each unit type, so they're all available
  ].map((ix) => { return {...ix, ...getUnitIndexState()}});

  /**
   * Gets an object representing the base state of the form, i.e., no units
   * being trained.
   * @return {Object<string, number>}
   */
  const getBlankSectionCosts = () => {
    return Object.fromEntries(
      unitTypesIndex.map((unitType) => [unitType.type, 0])
    )
  };

  const [sectionCosts, setSectionCosts] = useState(getBlankSectionCosts());

  const [unitCosts, setUnitCosts] = useState<{ [key: string]: number }>({});

  /**
   * Update the total costs for the units currently slated to be trained in a section.
   *
   * @param {string} section The section to update.
   * @param {number} cost 
   */
  const updateTotalCost = (section: string, cost: number) => {
    setSectionCosts((prevCosts) => {
      const updatedCosts = { ...prevCosts, [section]: cost };
      const newTotalCost = Object.values(updatedCosts).reduce(
        (acc, curr) => acc + curr,
        0
      );
      setTotalCost(newTotalCost);
      return updatedCosts;
    });
  };
 
  /**
   * Reset the unit costs to zero (for example, when a previous training action is done)
   */
  const resetUnitCosts = () => {
    setUnitCosts({});
    setTotalCost(0);
    setSectionCosts(getBlankSectionCosts());
  };

  /**
   * Gives data about a specific unit.
   *
   * @param {Object} unit
   * @param {string} unit.name The name of the unit we want data for.
   * @return {Object} Includes id, name, ownedUnits, requirement, cost, enabled, and level
   */
  const unitMapFunction = useCallback((unit, idPrefix: string) => {
    if (!user) {
      return;
    }
    const bonus =
      unit.name === 'Worker'
        ? EconomyUpgrades[user?.economyLevel]?.goldPerWorker
        : unit.bonus;

    const unitId = `${idPrefix}_${unit.level}`;

    return {
      id: unitId,
      name: unit.name,
      bonus,
      ownedUnits:
        user.units.find((u) => u.type === unit.type && u.level === unit.level)
          ?.quantity || 0,
      requirement: Fortifications.find((fort) => {
        return fort.level === unit.fortLevel;
      }).name,
      cost: unit.cost - (user?.priceBonus / 100) * unit.cost,
      enabled: unit.fortLevel <= user?.fortLevel,
      level: unit.level,
    };
  }, [user]);

  useEffect(() => {
    if (user && user.availableUnitTypes) {
      unitTypesIndex.forEach((unitType) => {
        unitType.updateFn(
          user.availableUnitTypes
            .filter((unit) => unit.type === unitType.type)
            .map((unit) => unitMapFunction(unit, unitType.type))
        );
      });
    }
  }, [user, unitMapFunction]);

  /**
   * Get type, quantity, and level for each unit.
   * @return {Object}
   */
  const getUnitQuantities = () => {
    return unitTypesIndex.reduce((curVal, unitType) => [...curVal, ...unitType.unitData], [])
      .filter((unit) => unit.enabled)
      .map((unit) => {
        const unitComponents = unit.id.split('_');
        return {
          type: unitComponents[0],
          quantity: unitCosts[unit.id] || 0,
          level: parseInt(unitComponents[1], 10),
        };
      });
  };

  /**
   * Calls the named training API endpoint, with the provided user and units.
   * 
   * @param {string} endpoint Either 'train' or 'untrain'
   * @param {User} user
   * @param {Array} units
   * @return {Promise}
   */
  const callTrainingApi = async (endpoint, user, units) => {
    const response = await fetch('/api/training/' + endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId: user.id,
        units: units,
      }),
    });

    if (!response.ok) {
      throw new Error('Calling training API endpoint ' + endpoint + ' failed.');
      return;
    }

    const data = await response.json();

    alertService.success(data.message);

    return data;
  };

  /**
   * Updates the units on the page with data from the API, e.g. after a successful
   * API call.
   * @param {Object} data Parsed JSON response from one of the training API endpoints.
   */
  const updateUnits = (data) => {
    unitTypesIndex.forEach((unit) => {
      unit.updateFn((prevUnits) => {
        return prevUnits.map((unit) => {
          const updatedUnit = data.data.find(
            (u) => u.type === unit.id.split('_')[0]
          );
          if (updatedUnit) {
            return { ...unit, ownedUnits: updatedUnit.quantity };
          }
          return unit;
        });
      });
    });

    resetUnitCosts(); // Reset unit costs to 0
    forceUpdate();
  };

  /**
   * Handles either a train or untrain action.
   * @param {'train'|'untrain'} submitType
   */
  const handleFormSubmit = async (submitType) => {
    if (!user) {
      alertService.error('User not found. Please try again.');
      return;
    }

    const unitsToModify = getUnitQuantities();

    try {
      const data = await callTrainingApi(submitType, user, unitsToModify);
      updateUnits(data);
    } catch (error) {
      console.log(error);
      alertService.error('Failed to ' + submitType + ' units. Please try again.');
    }
  };

  /**
   * Handles a train action.
   */
  const handleTrainAll = async () => {
    try {
      handleFormSubmit('train');
    } catch (error) {
      console.log(error);
      return;
    }
  };

  /**
   * Handles an untrain action.
   */
  const handleUntrainAll = async () => {
    try {
      handleFormSubmit('untrain');
    } catch (error) {
      console.log(error);
      return;
    }
  };

  const parentRef = useRef(null);
  const stickyRef = useRef(null);

  useEffect(() => {
    const handleScroll = () => {
      const stickyElement = stickyRef.current;
      const parentElement = parentRef.current;
      const { bottom } = parentElement.getBoundingClientRect();
      const windowHeight = window.innerHeight;
      
      if (bottom <= windowHeight) {
        stickyElement.style.position = 'absolute';
        stickyElement.style.bottom = '0';
        stickyElement.style.width = '100%';
      } else {
        stickyElement.style.position = 'fixed';
        stickyElement.style.bottom = '0';
        stickyElement.style.width = '69vw';
        stickyElement.style.maxWidth = '1200px';
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, [stickyRef, parentRef]);

  return (
    <div ref={parentRef} className="mainArea" style={{ position: 'relative', paddingBottom: '50px' }}>
      <h2 className="page-title text-2xl font-bold">Training</h2>
      <div className="my-5 flex justify-between">
        <Alert />
      </div>
      <SimpleGrid cols={{ base: 1, xs: 2, sm:3, md: 4 }}>
        <Paper withBorder p="md" radius={'md'} key='UntrainedCitz'>
          <Group justify='space-between'>
            <Text size="lg" fw={'bold'} c="dimmed">Untrained Citizens</Text>
            <ThemeIcon c='white'>
              <FontAwesomeIcon icon={faPeopleGroup} />
            </ThemeIcon>
          </Group>
          <Group>
            <Text>
                {user?.units.filter((unit) => unit.type === 'CITIZEN')[0].quantity}
            </Text>
          </Group>
        </Paper>
        <Paper withBorder p="md" radius={'md'} key='GoldOnHand'>
          <Group justify='space-between'>
            <Text size="lg" fw={'bold'} c="dimmed">Gold On Hand</Text>
            <ThemeIcon c='white'>
              <FontAwesomeIcon icon={faCoins} />
            </ThemeIcon>
          </Group>
          <Group>
            <Text>
              {toLocale(user?.gold, user?.locale)}
            </Text>
          </Group>
        </Paper>
        <Paper withBorder p="md" radius={'md'} key='BankedGold'>
          <Group justify='space-between'>
            <Text size="lg" fw={'bold'} c="dimmed">Banked Gold</Text>
            <ThemeIcon c='white'>
              <FontAwesomeIcon icon={faBuildingColumns} />
            </ThemeIcon>
          </Group>
          <Group>
            <Text>
              {toLocale(user?.goldInBank, user?.locale)}
            </Text>
          </Group>
        </Paper>
        <Paper withBorder p="md" radius={'md'} key='DefenseToPopulation'>
          <Group justify='space-between'>
            <Text size="lg" fw={'bold'} c="dimmed">Defense Ratio</Text>
            <ThemeIcon c='white'>
              <FontAwesomeIcon icon={faShield} />
            </ThemeIcon>
          </Group>
          <Group>
            <Text>
              {toLocale((user?.unitTotals.defense / user?.population) * 100)} %
            </Text>
            {(user?.unitTotals.defense / user?.population) < .25 && (
              <Text size='sm' c='dimmed'>
                <Tooltip label='It is recommended that you have at least 25% Defense along with a healthy Fort. You may take heavier losses and your Workers and Citizens may be at risk!'>
                  <Badge color="brand">Advisor: Too low</Badge>
                </Tooltip>
            </Text>
            )}
          </Group>
        </Paper>
      </SimpleGrid>
      {
        unitTypesIndex.filter((unitType) => unitType.unitData !== null)
          .map((unitType) => (
            <NewUnitSection
              heading={unitType.sectionTitle}
              units={unitType.unitData.filter((unit) => unit.enabled)}
              updateTotalCost={(cost) => updateTotalCost(unitType.type, cost)}
              unitCosts={unitCosts}
              setUnitCosts={setUnitCosts}
            />
          ))
      }
      <Flex justify='space-between'
        ref={stickyRef}
        className=" mt-8 rounded bg-gray-800 sticky bottom-0 px-4 z-10 sm:w-100 md:w-[69vw]"
      >
        <Stack
          justify="center"
          gap="xs">
          <Text size='sm'>Total Cost: {toLocale(totalCost)}</Text>
          <Text size='sm'>Total Refund: {toLocale(totalCost * .75)}</Text>
        </Stack>
        <Flex justify='space-between' m={'xs'}>
          <Button
            color='brand.6'
            onClick={handleTrainAll}
          >
            Train All
          </Button>
          <Space w='sm' />
          <Button
            color='brand'
            onClick={handleUntrainAll}
          >
            Untrain All
          </Button>
        </Flex>
      </Flex>
    </div>
  );
};

export default Training;
