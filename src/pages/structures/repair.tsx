import { useEffect, useState } from 'react';

import { Fortifications } from '@/constants';
import { useUser } from '@/context/users';

const Repair = () => {
  const { user, forceUpdate } = useUser();
  const [fortification, setFortification] = useState(Fortifications[0]);
  useEffect(() => {
    if (user?.fortLevel) {
      setFortification(Fortifications[user.fortLevel]);
    }
  }, [user?.fortLevel]);
  console.log(user);
  return (
    <div className="mainArea pb-10">
      <h2>Fort Repair</h2>
      <div className="my-5 flex justify-around">
        <p className="mb-0">
          Gold On Hand: <span>{parseInt(user?.gold).toLocaleString()}</span>
        </p>
        <p className="mb-0">
          Banked Gold:{' '}
          <span>{parseInt(user?.goldInBank).toLocaleString()}</span>
        </p>
      </div>

      <form className="mb-5">
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
                Repair Cost Per HP: {fortification?.costPerRepairPoint} gold
              </td>
            </tr>
            <tr className="odd:bg-table-odd even:bg-table-even">
              <td>
                Total Repair Cost:{' '}
                {fortification?.costPerRepairPoint *
                  (fortification?.hitpoints - user?.fortHitpoints)}
              </td>
            </tr>
          </tbody>
        </table>
      </form>
    </div>
  );
};

export default Repair;
