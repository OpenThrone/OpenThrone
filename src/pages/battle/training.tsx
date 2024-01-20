'use client';

// src/pages/battle/training.tsx
import { useEffect, useState } from 'react';

import Alert from '@/components/alert';
import UnitSection from '@/components/unitsection';
import { EconomyUpgrades, Fortifications } from '@/constants';
import { useUser } from '@/context/users';
import { alertService } from '@/services';
import toLocale from '@/utils/numberFormatting';

const Training = () => {
  // Replace this with actual data fetching
  const [data, setData] = useState({ citizens: 0, gold: 0, goldInBank: 0 });
  const { user, forceUpdate } = useUser();
  const [workerUnits, setWorkers] = useState(null); // Define the worker units data here
  const [offensiveUnits, setOffensive] = useState(null); // Define the offensive units data here
  const [defensiveUnits, setDefensive] = useState(null); // Define the offensive units data here
  const [spyUnits, setSpyUnits] = useState(null); // Define the spy units data here
  const [sentryUnits, setSentryUnits] = useState(null); // Define the sentry units data here
  const [totalCost, setTotalCost] = useState(0); // Added state for total cost
  const [sectionCosts, setSectionCosts] = useState({
    WORKER: 0,
    OFFENSE: 0,
    DEFENSE: 0,
    SPY: 0,
    SENTRY: 0,
  });
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

  const unitMapFunction = (unit, idPrefix: string) => {
    const bonus =
      unit.name === 'Worker'
        ? EconomyUpgrades[user?.economyLevel]?.goldPerWorker
        : unit.bonus;

    return {
      id: `${idPrefix}_${unit.level}`,
      name: unit.name,
      bonus,
      ownedUnits:
        user.units.find((u) => u.type === unit.type && u.level === unit.level)
          ?.quantity || 0,
      requirement: Fortifications.find((fort) => {
        return fort.level === unit.fortLevel;
      }).name,
      cost: toLocale(
        unit.cost - (user?.priceBonus / 100) * unit.cost,
        user?.locale
      ),
      enabled: unit.fortLevel <= user?.fortLevel,
      level: unit.level,
    };
  };
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
  }, [user]);

  const handleTrain = async (unitTypeData: any[]) => {
    const allUnitsToTrain = [].concat(...unitTypeData);

    try {
      const responseData = await fetch('/api/training/train', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.id, // Assuming you have the user's ID available
          units: allUnitsToTrain,
        }),
      });

      console.log('Training was successful:', responseData);
      // Handle success scenario (like updating UI, showing a success message, etc.)
    } catch (error) {
      console.error('Failed to train units:', error);
      // Handle error scenario (like showing an error message to the user, etc.)
    }
  };

  const handleUntrain = async (unitTypeData: any[]) => {
    const allUnitsToUntrain = [].concat(...unitTypeData);

    try {
      const responseData = await fetch('/api/training/untrain', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.id, // Assuming you have the user's ID available
          units: allUnitsToUntrain,
        }),
      });

      console.log('Untraining was successful:', responseData);
      // Handle success scenario
    } catch (error) {
      console.error('Failed to untrain units:', error);
      // Handle error scenario
    }
  };

  const handleTrainAll = async () => {
    const unitsToTrain = [...workerUnits, ...offensiveUnits, ...defensiveUnits]
      .filter((unit) => unit.enabled)
      .map((unit) => {
        const inputElement = document.querySelector(`input[name="${unit.id}"]`);

        return {
          type: unit.id.split('_')[0], // Extracting the unit type from the id
          quantity: parseInt(inputElement.value, 10),
          level: parseInt(unit.id.split('_')[1], 10),
        };
      });

    try {
      const response = await fetch('/api/training/train', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.id, // Assuming you have the user's ID available
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
    ]
      .filter((unit) => unit.enabled)
      .map((unit) => {
        const inputElement = document.querySelector(`input[name="${unit.id}"]`);

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
        forceUpdate();
      } else {
        alertService.error(data.error);
      }
    } catch (error) {
      alertService.error('Failed to train units. Please try again.');
    }
  };
  return (
    <div className="mainArea pb-10">
      <h2 className="text-2xl font-bold">Training</h2>
      <div className="my-5 flex justify-between">
        <Alert />
      </div>
      <div className="my-5 flex justify-around">
        <p className="mb-0">
          Untrained Citizens:{' '}
          <span>
            {user?.units.filter((unit) => unit.type === 'CITIZEN')[0].quantity}
          </span>
        </p>
        <p className="mb-0">
          Gold On Hand: <span>{toLocale(user?.gold, user?.locale)}</span>
        </p>
        <p className="mb-0">
          Banked Gold: <span>{toLocale(user?.goldInBank, user?.locale)}</span>
        </p>
      </div>
      {workerUnits && (
        <UnitSection
          heading="Economy"
          units={workerUnits}
          updateTotalCost={(cost) => updateTotalCost('WORKER', cost)}
        />
      )}
      {offensiveUnits && (
        <UnitSection
          heading="Offense"
          units={offensiveUnits}
          updateTotalCost={(cost) => updateTotalCost('OFFENSE', cost)}
        />
      )}
      {defensiveUnits && (
        <UnitSection
          heading="Defense"
          units={defensiveUnits}
          updateTotalCost={(cost) => updateTotalCost('DEFENSE', cost)}
        />
      )}
      {spyUnits && (
        <UnitSection
          heading="Spy"
          units={spyUnits}
          updateTotalCost={(cost) => updateTotalCost('SPY', cost)}
        />
      )}
      {sentryUnits && (
        <UnitSection
          heading="Sentry"
          units={sentryUnits}
          updateTotalCost={(cost) => updateTotalCost('SENTRY', cost)}
        />
      )}
      <div className="mt-4">
        <p>Total Cost: {toLocale(totalCost)}</p>
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
  );
};

export default Training;
