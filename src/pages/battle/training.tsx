import React, { useCallback, useEffect, useRef, useState } from 'react';
import Alert from '@/components/alert';
import NewUnitSection from '@/components/newUnitSection';
import { EconomyUpgrades, Fortifications } from '@/constants';
import { useUser } from '@/context/users';
import { alertService } from '@/services';
import toLocale from '@/utils/numberFormatting';
import { Paper, Group, SimpleGrid, Title, Text, ThemeIcon } from '@mantine/core';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBuildingColumns, faCoins, faPeopleGroup } from '@fortawesome/free-solid-svg-icons';

const Training = (props) => {
  //const [data, setData] = useState({ citizens: 0, gold: 0, goldInBank: 0 });
  const { user, forceUpdate } = useUser();
  const [workerUnits, setWorkers] = useState(null);
  const [offensiveUnits, setOffensive] = useState(null);
  const [defensiveUnits, setDefensive] = useState(null);
  const [spyUnits, setSpyUnits] = useState(null);
  const [sentryUnits, setSentryUnits] = useState(null);
  const [totalCost, setTotalCost] = useState(0);
  const [sectionCosts, setSectionCosts] = useState({
    WORKER: 0,
    OFFENSE: 0,
    DEFENSE: 0,
    SPY: 0,
    SENTRY: 0,
  });

  const [unitCosts, setUnitCosts] = useState<{ [key: string]: number }>({});

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
  
  const resetUnitCosts = () => {
    setUnitCosts({});
    setTotalCost(0);
  };

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
      setWorkers(
        user.availableUnitTypes
          .filter((unit) => unit.type === 'WORKER')
          .map((unit) => unitMapFunction(unit, 'WORKER'))
      );
      setOffensive(
        user.availableUnitTypes
          .filter((unit) => unit.type === 'OFFENSE')
          .map((unit) => unitMapFunction(unit, 'OFFENSE'))
      );
      setDefensive(
        user.availableUnitTypes
          .filter((unit) => unit.type === 'DEFENSE')
          .map((unit) => unitMapFunction(unit, 'DEFENSE'))
      );
      setSpyUnits(
        user.availableUnitTypes
          .filter((unit) => unit.type === 'SPY')
          .map((unit) => unitMapFunction(unit, 'SPY'))
      );
      setSentryUnits(
        user.availableUnitTypes
          .filter((unit) => unit.type === 'SENTRY')
          .map((unit) => unitMapFunction(unit, 'SENTRY'))
      );
    }
  }, [user, unitMapFunction]);

  const handleTrainAll = async () => {
    const unitsToTrain = [...workerUnits, ...offensiveUnits, ...defensiveUnits, ...spyUnits, ...sentryUnits]
      .filter((unit) => unit.enabled)
      .map((unit) => {
        return {
          type: unit.id.split('_')[0],
          quantity: unitCosts[unit.id] || 0,
          level: parseInt(unit.id.split('_')[1], 10),
        };
      });

    try {
      if (!user) {
        alertService.error('User not found. Please try again.');
        return;
      }
      const response = await fetch('/api/training/train', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.id,
          units: unitsToTrain,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        alertService.success(data.message);

        // Update the getUnits state with the new quantities
        setWorkers((prevUnits) => {
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
        setOffensive((prevUnits) => {
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
        setDefensive((prevUnits) => {
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
        setSentryUnits((prevUnits) => {
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
        setSpyUnits((prevUnits) => {
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
        resetUnitCosts(); // Reset unit costs to 0
        forceUpdate();
      } else {
        alertService.error(data.error);
      }
    } catch (error) {
      console.log(error);
      alertService.error('Failed to train units. Please try again.');
    }
  };

  const handleUntrainAll = async () => {
    const unitsToUnTrain = [
      ...workerUnits,
      ...offensiveUnits,
      ...defensiveUnits,
      ...spyUnits,
      ...sentryUnits
    ]
      .filter((unit) => unit.enabled)
      .map((unit) => {
        const inputElement = document.querySelector(`input[name="${unit.id}"]`);

        if (!user) {
          alertService.error('User not found. Please try again.');
          return;
        }

        return {
          type: unit.id.split('_')[0], // Extracting the unit type from the id
          quantity: parseInt(inputElement.value, 10),
          level: parseInt(unit.id.split('_')[1], 10),
        };
      });

    try {
      const response = await fetch('/api/training/untrain', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.id, // Assuming you have the user's ID available
          units: unitsToUnTrain,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        alertService.success(data.message);

        // Update the getUnits state with the new quantities
        setWorkers((prevUnits) => {
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
        setOffensive((prevUnits) => {
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
        setDefensive((prevUnits) => {
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
        setSentryUnits((prevUnits) => {
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
        setSpyUnits((prevUnits) => {
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
        resetUnitCosts(); // Reset unit costs to 0
        forceUpdate();
      } else {
        alertService.error(data.error);
      }
    } catch (error) {
      alertService.error('Failed to train units. Please try again.');
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
      <SimpleGrid cols={{ base: 1, xs: 2, md: 3 }}>
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
      </SimpleGrid>
      {workerUnits && (
        <NewUnitSection
          heading="Economy"
          units={workerUnits.filter((unit) => unit.enabled)}
          updateTotalCost={(cost) => updateTotalCost('WORKER', cost)}
          unitCosts={unitCosts}
          setUnitCosts={setUnitCosts}
        />
      )}
      {offensiveUnits && (
        <NewUnitSection
          heading="Offense"
          units={offensiveUnits.filter((unit) => unit.enabled)}
          updateTotalCost={(cost) => updateTotalCost('OFFENSE', cost)}
          unitCosts={unitCosts}
          setUnitCosts={setUnitCosts}
        />
      )}
      {defensiveUnits && (
        <NewUnitSection
          heading="Defense"
          units={defensiveUnits.filter((unit) => unit.enabled)}
          updateTotalCost={(cost) => updateTotalCost('DEFENSE', cost)}
          unitCosts={unitCosts}
          setUnitCosts={setUnitCosts}
        />
      )}
      {spyUnits && (
        <NewUnitSection
          heading="Spy"
          units={spyUnits.filter((unit) => unit.enabled)}
          updateTotalCost={(cost) => updateTotalCost('SPY', cost)}
          unitCosts={unitCosts}
          setUnitCosts={setUnitCosts}
        />
      )}
      {sentryUnits && (
        <NewUnitSection
          heading="Sentry"
          units={sentryUnits.filter((unit) => unit.enabled)}
          updateTotalCost={(cost) => updateTotalCost('SENTRY', cost)}
          unitCosts={unitCosts}
          setUnitCosts={setUnitCosts}
        />
      )}
      <div
        ref={stickyRef}
        className="flex justify-between mt-8 rounded bg-gray-800 sticky bottom-0 px-4 z-10 sm:w-100 md:w-[69vw]"
      >
        <div className="mt-4">
          <p>Total Cost: {toLocale(totalCost)}</p>
          <p>Total Refund: {toLocale(totalCost * .75)}</p>
        </div>
        <div className="mt-4 flex justify-between">
          <button
            type="button"
            className="rounded bg-blue-500 px-4 py-2 font-bold text-white hover:bg-blue-700"
            onClick={handleTrainAll}
          >
            Train All
          </button>
          <button
            type="button"
            className="rounded bg-red-500 px-4 py-2 font-bold text-white hover:bg-red-700"
            onClick={handleUntrainAll}
          >
            Untrain All
          </button>
        </div>
      </div>
    </div>
  );
};

export default Training;
