import toLocale from '@/utils/numberFormatting';
import React from 'react';

const StatsTable = ({ title, data }) => {
  return (
    <div>
      <center><h2 className="text-xl font-semibold mb-4">{title}</h2>
      </center><table className="min-w-full table-auto">
        <thead className="border-b">
          <tr className="bg-table-odd">
            <th className="text-sm font-medium px-6 py-4 text-left">
              Rank
            </th>
            <th className="text-sm font-medium px-6 py-4 text-left">
              Player
            </th>
            <th className="text-sm font-medium px-6 py-4 text-left">
              Stat
            </th>
          </tr>
        </thead>
        <tbody>
          {data.map((player, index) => (
            <tr key={index} className="border-b odd:bg-table-even even:bg-table-odd">
              <td className="px-6 py-4 whitespace-nowrap text-sm">
                {index + 1}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm">
                {player.display_name}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm">
                {toLocale(player.stat) || 0}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default StatsTable;
