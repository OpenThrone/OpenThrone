import { useEffect, useState } from 'react';

import Layout from '@/components/Layout';
import UnitSection from '@/components/unitsection';
import { Fortifications } from '@/constants';
import { useUser } from '@/context/users';
import { Meta } from '@/layouts/Meta';

const Training = () => {
  // Replace this with actual data fetching
  const [data, setData] = useState({ citizens: 0, gold: 0, goldInBank: 0 });
  const { user } = useUser();
  const [workerUnits, setWorkers] = useState([]); // Define the worker units data here
  const [offensiveUnits, setOffensive] = useState([]); // Define the offensive units data here
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
    setWorkers(
      user?.availableUnitTypes
        .filter((unit) => unit.type === 'WORKER')
        .map((unit) => unitMapFunction(unit, 'WORKER'))
    );
    setOffensive(
      user?.availableUnitTypes
        .filter((unit) => unit.type === 'OFFENSE')
        .map((unit) => unitMapFunction(unit, 'OFFENSE'))
    );
    // setWorkers(user.user?.unitTotals?.workers);
    // setOffensive(user.user?.unitTotals?.offense);
    // Fetch the necessary data here
    // setData(fetchedData);
  }, [user]);

  return (
    <Layout meta={<Meta title="Training" description="Train your troops" />}>
      <div className="mainArea pb-10">
        <h2 className="text-2xl font-bold">Training</h2>
        <div className="my-5 flex justify-around">
          <p className="mb-0">
            Untrained Citizens:{' '}
            <span>
              {
                user?.units.filter((unit) => unit.type === 'CITIZEN')[0]
                  .quantity
              }
            </span>
          </p>
          <p className="mb-0">
            Gold On Hand: <span>{user?.gold}</span>
          </p>
          <p className="mb-0">
            Banked Gold: <span>{user?.goldInBank}</span>
          </p>
        </div>
        <UnitSection heading="Economy" units={workerUnits} />

        <UnitSection heading="Offense" units={offensiveUnits} />

        {/* Add other sections (e.g., unitSection) here */}
      </div>
    </Layout>
  );
};

export default Training;
