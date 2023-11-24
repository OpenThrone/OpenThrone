import { useEffect, useState } from 'react';

import { Fortifications } from '@/constants';
import { useUser } from '@/context/users';
import toLocale from '@/utils/numberFormatting';

const Repair = () => {
  const { user, forceUpdate } = useUser();
  const [fortification, setFortification] = useState(Fortifications[0]);
  const [repairPoints, setRepairPoints] = useState(0);
  useEffect(() => {
    if (user?.fortLevel) {
      setFortification(Fortifications[user.fortLevel]);
    }
  }, [user?.fortLevel]);

  const handleRepair = async (e) => {
    e.preventDefault(); // Prevent the default form submit
    try {
      const response = await fetch('/api/repair', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ repairPoints }),
      });

      if (!response.ok) {
        const data = await response.json();
        // Handle error
        console.error('Error repairing:', data.error);
        return;
      }

      const data = await response.json();
      // Handle success
      console.log('Success:', data);
      forceUpdate(); // Consider calling a function to re-fetch user data after successful repair
    } catch (error) {
      // Handle error during fetch
      console.error('Fetch error:', error);
    }
  };

  const handleRepairAll = async () => {
    const maxRepairPoints = (fortification?.hitpoints ?? 0) - (user?.fortHitpoints ?? 0);
    if (maxRepairPoints <= 0) return; // No repair needed
    try {
      const response = await fetch('/api/repair', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ repairPoints: maxRepairPoints }),
      });

      if (!response.ok) {
        const data = await response.json();
        // Handle error
        console.error('Error repairing all:', data.error);
        return;
      }

      const data = await response.json();
      // Handle success
      console.log('Success:', data);
      forceUpdate(); // Consider calling a function to re-fetch user data after successful repair
    } catch (error) {
      // Handle error during fetch
      console.error('Fetch error:', error);
    }
  };


  return (
    <div className="mainArea pb-10">
      <h2>Fort Repair</h2>
      <div className="my-5 flex justify-around">
        <p className="mb-0">
          Gold On Hand: <span>{toLocale(user?.gold, user?.locale)}</span>
        </p>
        <p className="mb-0">
          Banked Gold:{' '}
          <span>{toLocale(user?.goldInBank, user?.locale)}</span>
        </p>
      </div>

      <form className="mb-5" onSubmit={handleRepair}>
        <table className="w-full table-auto">
          <thead>
            <tr>
              <th>Repair Fortification</th>
            </tr>
          </thead>
          <tbody>
            <tr className="odd:bg-table-odd even:bg-table-even">
              <td>Current Fortification: {fortification?.name}</td>
            </tr>
            <tr className="odd:bg-table-odd even:bg-table-even">
              <td>
                Fort Health: {user?.fortHitpoints} / {fortification?.hitpoints}
              </td>
            </tr>
            <tr className="odd:bg-table-odd even:bg-table-even">
              <td>
                Repair Cost Per HP: {toLocale(fortification?.costPerRepairPoint, user?.locale)} gold
              </td>
            </tr>
            <tr className="odd:bg-table-odd even:bg-table-even">
              <td>
                Total Repair Cost:{' '}
                {toLocale(fortification?.costPerRepairPoint *
                  (fortification?.hitpoints - user?.fortHitpoints), user?.locale)}
              </td>
            </tr>
            <tr className="odd:bg-table-odd even:bg-table-even">
              <td>
                <label>
                  Repair Points:
                  <input
                    type="number"
                    min="0"
                    max={((fortification?.hitpoints ?? 0) - (user?.fortHitpoints ?? 0)) > 0 ? ((fortification?.hitpoints ?? 0) - (user?.fortHitpoints ?? 0)) : 0}
                    value={repairPoints}
                    onChange={(e) => setRepairPoints(Number(e.target.value))}
                    className="shadow appearance-none border rounded w-75 py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                  />
                </label>
              </td>
            </tr>
            <tr className='odd:bg-table-odd even:bg-table-even'>
              <td>
                <button
                  type="submit"
                  className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
                >
                  Repair
                </button>
                <button
                  type="button"
                  onClick={handleRepairAll}
                  className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline ml-2"
                >
                  Repair All
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </form>
    </div>
  );
};

export default Repair;
