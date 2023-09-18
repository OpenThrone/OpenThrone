import { useEffect, useState } from 'react';

import { DefaultLevelBonus } from '@/constants';
import { useUser } from '@/context/users';

const Levels = () => {
  const { user } = useUser();
  const [levels, setLevels] = useState(user?.bonus_points ?? DefaultLevelBonus);

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
  }, [user?.bonus_points]);

  const handleAddBonus = (type) => {
    incrementLevel(type);
    // Here you can also send a request to the backend to actually update the level and handle any errors.
  };
  return (
    <div className="mainArea pb-10">
      <h2>Levels</h2>
      <h4>
        You currently have {user?.availableProficiencyPoints} proficiency points
        available.
      </h4>
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
              disabled={!user?.availableProficiencyPoints}
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
                disabled={!user?.availableProficiencyPoints}
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
                // disabled={!user?.availableProficiencyPoints}
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
                  disabled={!user?.availableProficiencyPoints}
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
                  disabled={!user?.availableProficiencyPoints}
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
