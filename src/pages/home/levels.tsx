import { useEffect, useState } from 'react';

import { DefaultLevelBonus } from '@/constants';
import { useUser } from '@/context/users';
import { Text } from '@mantine/core';

const Levels = (props) => {
  const { user, forceUpdate } = useUser();
  const [levels, setLevels] = useState(user?.bonus_points ?? DefaultLevelBonus);
  const [proficiencyPoints, setProficiencyPoints] = useState(user?.availableProficiencyPoints ?? 0);

  const incrementLevel = (typeToUpdate) => {
    const updatedLevels = levels.map((level) => {
      if (level.type === typeToUpdate) {
        return { ...level, level: level.level + 1 };
      }
      return level;
    });
    setLevels(updatedLevels);
    // If you want to call an API to persist this update, do it here
  };

  useEffect(() => {
    // This will ensure levels are updated whenever user.bonus_points changes
    setLevels(user?.bonus_points ?? DefaultLevelBonus);
    setProficiencyPoints(user?.availableProficiencyPoints ?? 0);
  }, [user?.bonus_points, user?.availableProficiencyPoints]);

  const handleAddBonus = async (type) => {
    // Optimistically update the local state
    const previousLevels = [...levels];
    const previousPoints = proficiencyPoints;
    incrementLevel(type);

    // Prepare the data to send to the API
    const requestData = { typeToUpdate: type };

    // Send a POST request to the API endpoint
    try {
      const response = await fetch('/api/account/bonusPoints', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestData),
      });

      if (!response.ok) {
        // If the response is not ok, throw an error to catch it below
        throw new Error(`Error: ${response.statusText}`);
      }

      const data = await response.json();

      // You can choose to update the state with the response if needed
      // setLevels(data.updatedBonusPoints);

      setProficiencyPoints(user?.availableProficiencyPoints ?? proficiencyPoints - 1);
      forceUpdate();
    } catch (error) {
      // Handle any errors here
      console.error('Failed to update bonus points:', error);
      // Optionally, revert the optimistic update
      setLevels(previousLevels);
      setProficiencyPoints(previousPoints);
    }
  };
  return (
    <div className="mainArea pb-10">
      <h2 className="page-title">Levels</h2>
      <Text size="lg">
        You currently have {proficiencyPoints} proficiency points
        available.
      </Text>
      <Text size="sm">Maximum % is 75</Text>
      <div className="flex flex-col items-center">
        <div className="block rounded-lg border border-yellow-400 text-center shadow-[0_2px_15px_-3px_rgba(0,0,0,0.07),0_10px_20px_-2px_rgba(0,0,0,0.04)] dark:bg-neutral-700">
          <div className="border-b-2 border-yellow-200 px-6 py-3 ">
            Strength (Offense)
          </div>
          <div className="p-6">
            <p className="mb-4 text-base  dark:text-neutral-200">
              Current Bonus{' '}
              {levels.find((level) => level.type === 'OFFENSE')?.level ?? 0}%
            </p>
            <button
              type="button"
              onClick={() => handleAddBonus('OFFENSE')}
              className="inline-block  rounded bg-green-900 px-6 pb-2 pt-2.5 text-xs uppercase leading-normal"
              data-te-ripple-init
              data-te-ripple-color="light"
              disabled={!user?.availableProficiencyPoints || levels.find((level) => level.type === 'OFFENSE')?.level >= 75}
            >
              Add
            </button>
          </div>
        </div>
        <div className="flex justify-between">
          <div className="block rounded-lg border border-yellow-400 text-center shadow-[0_2px_15px_-3px_rgba(0,0,0,0.07),0_10px_20px_-2px_rgba(0,0,0,0.04)] dark:bg-neutral-700">
            <div className="border-b-2 border-yellow-200 px-6 py-3 ">
              Constitution (Defense)
            </div>
            <div className="p-6">
              <p className="mb-4 text-base  dark:text-neutral-200">
                Current Bonus{' '}
                {levels.find((level) => level.type === 'DEFENSE')?.level ?? 0}%
              </p>
              <button
                type="button"
                onClick={() => handleAddBonus('DEFENSE')}
                className="inline-block  rounded bg-green-900 px-6 pb-2 pt-2.5 text-xs uppercase leading-normal"
                data-te-ripple-init
                data-te-ripple-color="light"
                disabled={!user?.availableProficiencyPoints || levels.find((level) => level.type === 'DEFENSE')?.level >= 75}
              >
                Add
              </button>
            </div>
          </div>

          <div className="block rounded-lg border border-yellow-400 text-center shadow-[0_2px_15px_-3px_rgba(0,0,0,0.07),0_10px_20px_-2px_rgba(0,0,0,0.04)] dark:bg-neutral-700">
            <div className="border-b-2 border-yellow-200 px-6 py-3 ">
              Wealth (Income)
            </div>
            <div className="p-6">
              <p className="mb-4 text-base  dark:text-neutral-200">
                Current Bonus{' '}
                {levels.find((level) => level.type === 'INCOME')?.level ?? 0}%
              </p>
              <button
                type="button"
                onClick={() => handleAddBonus('INCOME')}
                className="inline-block  rounded bg-green-900 px-6 pb-2 pt-2.5 text-xs uppercase leading-normal"
                data-te-ripple-init
                data-te-ripple-color="light"
                disabled={!user?.availableProficiencyPoints || levels.find((level) => level.type === 'INCOME')?.level >= 75}
              >
                Add
              </button>
            </div>
          </div>
        </div>

        <div className="flex justify-between">
          <div className="flex justify-start">
            <div className="block rounded-lg border border-yellow-400 text-center shadow-[0_2px_15px_-3px_rgba(0,0,0,0.07),0_10px_20px_-2px_rgba(0,0,0,0.04)] dark:bg-neutral-700">
              <div className="border-b-2 border-yellow-200 px-6 py-3 ">
                Dexterity (Spy & Sentry)
              </div>
              <div className="p-6">
                <p className="mb-4 text-base  dark:text-neutral-200">
                  Current Bonus{' '}
                  {levels.find((level) => level.type === 'INTEL')?.level ?? 0}%
                </p>
                <button
                  type="button"
                  className="inline-block  rounded bg-green-900 px-6 pb-2 pt-2.5 text-xs uppercase leading-normal"
                  data-te-ripple-init
                  onClick={() => handleAddBonus('INTEL')}
                  data-te-ripple-color="light"
                  disabled={!user?.availableProficiencyPoints || levels.find((level) => level.type === 'INTEL')?.level >= 75}
                >
                  Add
                </button>
              </div>
            </div>
          </div>
          <div className="flex justify-end">
            <div className="block rounded-lg border border-yellow-400 text-center shadow-[0_2px_15px_-3px_rgba(0,0,0,0.07),0_10px_20px_-2px_rgba(0,0,0,0.04)] dark:bg-neutral-700">
              <div className="border-b-2 border-yellow-200 px-6 py-3 ">
                Charisma (Reduced Prices)
              </div>
              <div className="p-6">
                <p className="mb-4 text-base  dark:text-neutral-200">
                  Current Bonus{' '}
                  {levels.find((level) => level.type === 'PRICES')?.level ?? 0}%
                </p>
                <button
                  type="button"
                  className="inline-block  rounded bg-green-900 px-6 pb-2 pt-2.5 text-xs uppercase leading-normal"
                  data-te-ripple-init
                  onClick={() => handleAddBonus('PRICES')}
                  data-te-ripple-color="light"
                  disabled={!user?.availableProficiencyPoints || levels.find((level) => level.type === 'PRICES')?.level >= 75}
                >
                  Add
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Levels;
