// components/UnitSection.tsx

import React from 'react';

type UnitProps = {
  id: string;
  name: string;
  bonus?: number;
  ownedUnits: number;
  cost: string;
  enabled: boolean;
  fortName?: string;
};

type UnitSectionProps = {
  heading: string;
  units: UnitProps[];
};

const UnitSection: React.FC<UnitSectionProps> = ({ heading, units }) => {
  return (
    <div className="my-10 rounded-lg bg-gray-800">
      <table className="w-full table-auto">
        <thead>
          <tr>
            <th className="w-60 px-4 py-2">{heading}</th>
            <th className="w-10 px-4 py-2">Bonus</th>
            <th className="w-10 px-4 py-2">You Have</th>
            <th className="w-10 px-4 py-2">Cost</th>
            <th className="w-10 px-4 py-2">Quantity</th>
          </tr>
        </thead>
        <tbody>
          {units.map((unit) =>
            unit.enabled ? (
              <tr key={unit.id}>
                <td className="border px-4 py-2">{unit.name}</td>
                <td className="border px-4 py-2">
                  +{unit.bonus} {heading}
                </td>
                <td className="border px-4 py-2">
                  <span id={`${unit.id}_owned`}>{unit.ownedUnits}</span>
                </td>
                <td className="border px-4 py-2">{unit.cost}</td>
                <td className="border px-4 py-2">
                  <input
                    type="number"
                    aria-labelledby={unit.id}
                    name={unit.id}
                    defaultValue="0"
                    className="w-full rounded-md bg-gray-600 p-2"
                  />
                </td>
              </tr>
            ) : (
              <tr key={unit.id}>
                <td className="border px-4 py-2">{unit.name}</td>
                <td className="border px-4 py-2" />
                <td colSpan={3} className="border px-4 py-2 text-center">
                  Unlocked with {unit.fortName}
                </td>
              </tr>
            )
          )}
        </tbody>
      </table>
    </div>
  );
};

export default UnitSection;
