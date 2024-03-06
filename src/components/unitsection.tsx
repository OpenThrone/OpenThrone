// components/UnitSection.tsx

import React, { useEffect, useState } from 'react';

import { useUser } from '@/context/users';
import { alertService } from '@/services';
import { UnitProps } from '@/types/typings';



type UnitSectionProps = {
  heading: string;
  units: UnitProps[];
  updateTotalCost: (costChange: number) => void; // New prop
  onTrain: any; // New prop
  onUntrain: any; // New prop
};

const UnitSection: React.FC<UnitSectionProps> = ({
  heading,
  units,
  updateTotalCost,
  onTrain, // New prop
  onUntrain, // New prop
}) => {
  const { user, forceUpdate } = useUser();
  const [getUnits, setUnits] = useState<UnitProps[]>(units || []);

  useEffect(() => {
    const computeTotalCostForSection = () => {
      let sectionCost = 0;
      units.forEach((unit) => {
        const inputElement = document.querySelector(`input[name="${unit.id}"]`) as HTMLInputElement;
        sectionCost +=
          parseInt(inputElement?.value || '0', 10) *
          parseInt(unit.cost.replace(/,/g, ''), 10);
      });
      updateTotalCost(sectionCost); // Send the total cost for this section
    };

    units.forEach((unit) => {
      const inputElement = document.querySelector(`input[name="${unit.id}"]`);
      inputElement?.addEventListener('input', computeTotalCostForSection);
    });

    return () => {
      units.forEach((unit) => {
        const inputElement = document.querySelector(`input[name="${unit.id}"]`);
        inputElement?.removeEventListener('input', computeTotalCostForSection);
      });
    };
  }, [units, updateTotalCost]);

  if (!user || !user.id) {
    alertService.error('User information is not available.');
    return;
  }

  const handleTrain = async () => {
    const unitsToTrain = units
      .filter((unit) => unit.enabled)
      .map((unit) => {
        const inputElement = document.querySelector(
          `input[name="${unit.id}"]`
        ) as HTMLInputElement;
        if (!inputElement) return null;
        return {
          type: unit.id.split('_')[0], // Extracting the unit type from the id
          quantity: parseInt(inputElement.value, 10),
          level: parseInt(
            unit.id.split('_')[1] ? unit.id.split('_')[1] : "1",
            10
          ),
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
            const unitTypeLevel = unit.id.split('_');
            const updatedUnit = data.data.find(
              (u: any) =>
                u.type === unitTypeLevel[0] &&
                u.level.toString() === unitTypeLevel[1]
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
        const inputElement = document.querySelector(
          `input[name="${unit.id}"]`
        ) as HTMLInputElement;
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
          units: unitsToUntrain,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        alertService.success(data.message);
        // Update the getUnits state with the new quantities
        setUnits((prevUnits) => {
          return prevUnits.map((unit) => {
            const unitTypeLevel = unit.id.split('_');
            const updatedUnit = data.data.find(
              (u: UnitProps) =>
                u.type === unitTypeLevel[0] &&
                u.level?.toString() === unitTypeLevel[1]
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

  const handleTrainClick = () => {
    handleTrain();
    onTrain && onTrain(heading); // Use the passed down handler
    units.forEach((unit) => {
      if (unit.enabled) {
        const inputElement = document.querySelector(
          `input[name="${unit.id}"]`
        ) as HTMLInputElement;
        inputElement.value = "0";
      }
    });
    updateTotalCost(0);
  };

  const handleUntrainClick = () => {
    handleUntrain();
    onUntrain && onUntrain(heading); // Use the passed down handler
    units.forEach((unit) => {
      if (unit.enabled) {
        const inputElement = document.querySelector(`input[name="${unit.id}"]`) as HTMLInputElement;
        inputElement.value = "0";
      }
    });
    updateTotalCost(0);
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
          {(() => {
            const sortedUnits = getUnits.sort((a, b) => parseInt(a.id,10) - parseInt(b.id,10)); // Ensure units are sorted by ID.
            const firstDisabledUnit = sortedUnits.find(u => !u.enabled); // Find the first disabled unit.
            return sortedUnits.map((unit) => {
              if (unit.enabled) {
                return (
                  <tr key={unit.id}>
                    <td className="border px-4 py-2">{unit.name}</td>
                    <td className="border px-4 py-2">+{unit.bonus} {heading}</td>
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
                        min="0"
                        className="w-full rounded-md bg-gray-600 p-2"
                      />
                    </td>
                  </tr>
                );
              } else if (unit.id === firstDisabledUnit?.id) {
                // Rendering for the first disabled unit
                return (
                  <tr key={unit.id}>
                    <td className="border px-4 py-2">{unit.name}</td>
                    <td className="border px-4 py-2">-</td>
                    <td colSpan={3} className="border px-4 py-2 text-center">
                      Unlocked with {unit.requirement}
                    </td>
                  </tr>
                );
              }
              return null; // For all other disabled units, do not render anything.
            });
          })()}
        </tbody>
      </table>
      <div className="mt-2 flex p-2 justify-between">
        <button
          className="rounded bg-blue-500 px-4 py-2 font-bold text-blue-100 hover:bg-blue-700"
          onClick={handleTrainClick}
          type="button"
        >
          Train
        </button>
        <button
          className="rounded bg-red-500 px-4 py-2 font-bold text-red-100 hover:bg-red-700"
          onClick={handleUntrainClick}
          type="button"
        >
          Untrain
        </button>
      </div>
    </div>
  );
};

export default UnitSection;
