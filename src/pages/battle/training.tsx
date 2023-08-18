// src/pages/battle/training.tsx
import { useEffect, useState } from 'react';

import Alert from '@/components/alert';
import UnitSection from '@/components/unitsection';
import { Fortifications } from '@/constants';
import { useUser } from '@/context/users';

const Training = () => {
  // Replace this with actual data fetching
  const [data, setData] = useState({ citizens: 0, gold: 0, goldInBank: 0 });
  const { user } = useUser();
  const [workerUnits, setWorkers] = useState(null); // Define the worker units data here
  const [offensiveUnits, setOffensive] = useState(null); // Define the offensive units data here
  const [defensiveUnits, setDefensive] = useState(null); // Define the offensive units data here
  const unitMapFunction = (unit, idPrefix: string) => {
    return {
      id: `${idPrefix}_${unit.level}`,
      name: unit.name,
      bonus: unit.bonus,
      ownedUnits:
        user.units.find((u) => u.type === unit.type && u.level === unit.level)
          ?.quantity || 0,
      fortName: Fortifications.filter((fort) => {
        return fort.level == unit.level;
      })[0].name,
      cost: new Intl.NumberFormat('en-GB').format(unit.cost),
      enabled: unit.level <= user?.fortLevel,
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
    }
  }, [user]);

  const handleTrain = (unitType: string) => {
    // Logic to train units based on unitType
  };

  const handleUntrain = (unitType: string) => {
    // Logic to untrain units based on unitType
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
          Gold On Hand: <span>{user?.gold}</span>
        </p>
        <p className="mb-0">
          Banked Gold: <span>{user?.goldInBank}</span>
        </p>
      </div>
      {workerUnits && (
        <UnitSection
          heading="Economy"
          units={workerUnits}
          onTrain={() => handleTrain('WORKER')}
          onUntrain={() => handleUntrain('WORKER')}
        />
      )}
      {offensiveUnits && (
        <UnitSection
          heading="Offense"
          units={offensiveUnits}
          onTrain={() => handleTrain('OFFENSE')}
          onUntrain={() => handleUntrain('OFFENSE')}
        />
      )}
      {defensiveUnits && (
        <UnitSection
          heading="Defense"
          units={defensiveUnits}
          onTrain={() => handleTrain('DEFENSE')}
          onUntrain={() => handleUntrain('DEFENSE')}
        />
      )}
    </div>
  );
};

export default Training;
