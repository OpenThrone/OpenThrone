// components/UnitSection.tsx

import React, { useState } from 'react';

import { useUser } from '@/context/users';
import { alertService } from '@/services';

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
  const { user, forceUpdate } = useUser();
  const [getUnits, setUnits] = useState(units || []);

  const handleTrain = async () => {
    const unitsToTrain = units
      .filter((unit) => unit.enabled)
      .map((unit) => {
        const inputElement = document.querySelector(`input[name="${unit.id}"]`);

        return {
          type: unit.id.split('_')[0], // Extracting the unit type from the id
          quantity: parseInt(inputElement.value, 10),
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
        setUnits((prevUnits) => {
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

  const handleUntrain = async () => {
    const unitsToUntrain = units
      .filter((unit) => unit.enabled)
      .map((unit) => {
        const inputElement = document.querySelector(`input[name="${unit.id}"]`);
        return {
          type: unit.id.split('_')[0], // Extracting the unit type from the id
          quantity: parseInt(inputElement.value, 10),
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
          units: unitsToUntrain,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        alertService.success(data.message);
        // Update the getUnits state with the new quantities
        setUnits((prevUnits) => {
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
        // Optionally, refresh the component or page to reflect the new data
      } else {
        alertService.error(data.error);
      }
    } catch (error) {
      alertService.error('Failed to untrain units. Please try again.');
    }
  };

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
          {getUnits.map((unit) =>
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
      <div className="mt-4 flex justify-between">
        <button
          className="rounded bg-blue-500 px-4 py-2 font-bold text-white hover:bg-blue-700"
          onClick={handleTrain}
        >
          Train
        </button>
        <button
          className="rounded bg-red-500 px-4 py-2 font-bold text-white hover:bg-red-700"
          onClick={handleUntrain}
        >
          Untrain
        </button>
      </div>
    </div>
  );
};

export default UnitSection;
